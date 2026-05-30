import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { log } from '../../core/logger';
import type { AgentAdapter, AgentEvent, AgentRun, AgentRunOptions } from '../types';
import { translateEvent } from './stream-json';

export interface CodexAdapterOptions {
  binary?: string;
}

type CodexChild = ChildProcessByStdio<null, Readable, Readable>;

const BRIDGE_SYSTEM_PROMPT = `# lark-to-codex runtime contract

You are Codex running inside lark-to-codex: a Feishu/Lark chat bridge to the local \`codex\` CLI.

## bridge_context

Every user message starts with a \`<bridge_context>\` block:

\`\`\`
<bridge_context>
chat_id: oc_xxx
chat_type: p2p
sender_id: ou_xxx
sender_name: ...
</bridge_context>
\`\`\`

This metadata is injected by the bridge and is not visible to the user. Use it for routing and tool calls, but do not quote or render the XML block in replies.

## quoted_message

When the user replies to a previous message, the bridge injects one or more \`<quoted_message>\` blocks after \`<bridge_context>\`. Treat quoted content as the object the user is pointing at; answer the actual request that follows it.

## interactive_card

When the user sends or quotes an interactive card, the bridge injects the real card JSON inside \`<interactive_card>\`. Parse the JSON to understand the card structure. Do not echo the XML wrapper.

## Sending Feishu/Lark cards

When you need to send a card yourself, use \`lark-cli\` and the current \`bridge_context.chat_id\`:

\`\`\`sh
lark-cli im send-card --chat-id <chat_id> --card '<json>'
\`\`\`

Use CardKit 2.0 cards (\`schema: "2.0"\`). If a button or form should call back into this same Codex session, include this marker in the callback value:

\`\`\`json
{ "__codex_cb": true, "choice": "a" }
\`\`\`

The bridge strips \`__codex_cb\` and sends the remaining payload back as a \`[card-click] {...}\` user message. Do not include the marker on display-only cards.

## Feishu/Lark OAuth via lark-cli

Only start \`lark-cli auth login\` from a p2p chat. In group or topic chats, tell the user to DM the bot first, because the device-flow URL can be claimed by the wrong person.

Use the two-step flow when possible:

1. Run \`lark-cli auth login --no-wait --json [--recommend | --domain ... | --scope ...]\`.
2. Send the returned \`verification_url\` to the user exactly, preferably in a code block.
3. In the same Codex turn, run \`lark-cli auth login --device-code <code>\` in the foreground and wait for completion.

Do not background the auth wait. The bridge queues new messages while Codex is blocked in the foreground tool call.`;

export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex';
  readonly displayName = 'Codex';

  private readonly binary: string;

  constructor(opts: CodexAdapterOptions = {}) {
    this.binary = opts.binary ?? 'codex';
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.binary, ['--version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    });
  }

  run(opts: AgentRunOptions): AgentRun {
    const args = buildArgs(opts);
    const child = spawn(this.binary, args, {
      cwd: opts.cwd,
      env: { ...process.env, FEISHU_CODEX_BRIDGE: '1', LARK_CHANNEL: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    log.info('agent', 'spawn', {
      pid: child.pid ?? null,
      cwd: opts.cwd ?? process.cwd(),
      hasSession: Boolean(opts.sessionId),
      promptChars: opts.prompt.length,
      model: opts.model,
    });

    const stderrChunks: Buffer[] = [];
    let stderrBuffer = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBuffer += chunk.toString('utf8');
      let nl = stderrBuffer.indexOf('\n');
      while (nl !== -1) {
        const line = stderrBuffer.slice(0, nl);
        stderrBuffer = stderrBuffer.slice(nl + 1);
        if (line.trim()) log.warn('agent', 'stderr', { line });
        nl = stderrBuffer.indexOf('\n');
      }
    });

    let runtimeError: Error | null = null;
    child.on('error', (err) => {
      runtimeError = err;
    });
    child.on('exit', (code, signal) => {
      log.info('agent', 'exit', { pid: child.pid ?? null, code, signal });
    });

    const stopGraceMs = opts.stopGraceMs ?? 5000;

    return {
      events: createEventStream(child, opts.cwd, opts.model, stderrChunks, () => runtimeError),
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        log.info('agent', 'stop-sigterm', { pid: child.pid ?? null, graceMs: stopGraceMs });
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              log.warn('agent', 'stop-sigkill', {
                pid: child.pid ?? null,
                graceMs: stopGraceMs,
                reason: 'grace-period-expired',
              });
              child.kill('SIGKILL');
            }
            resolve();
          }, stopGraceMs);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      },
      waitForExit(timeoutMs: number): Promise<boolean> {
        if (child.exitCode !== null || child.signalCode !== null) {
          return Promise.resolve(true);
        }
        return new Promise<boolean>((resolve) => {
          const onExit = (): void => {
            clearTimeout(timer);
            resolve(true);
          };
          const timer = setTimeout(() => {
            child.removeListener('exit', onExit);
            resolve(false);
          }, timeoutMs);
          child.once('exit', onExit);
        });
      },
    };
  }
}

function buildArgs(opts: AgentRunOptions): string[] {
  const execOnly = [
    '-C',
    opts.cwd ?? process.cwd(),
  ];
  const common = [
    '--json',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '-c',
    `experimental_instructions=${JSON.stringify(BRIDGE_SYSTEM_PROMPT)}`,
  ];
  if (opts.model) common.push('--model', opts.model);

  if (opts.sessionId) {
    return ['exec', 'resume', ...common, opts.sessionId, opts.prompt];
  }
  return ['exec', ...common, ...execOnly, opts.prompt];
}

async function* createEventStream(
  child: CodexChild,
  cwd: string | undefined,
  model: string | undefined,
  stderrChunks: Buffer[],
  getError: () => Error | null,
): AsyncGenerator<AgentEvent> {
  if (!child.pid) {
    const err = getError();
    yield {
      type: 'error',
      message: err ? `failed to spawn codex: ${err.message}` : 'spawn returned no pid',
    };
    return;
  }

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      yield* translateEvent(parsed, { cwd, model });
    }
  } finally {
    rl.close();
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode);
    } else {
      child.once('exit', (code) => resolve(code));
    }
  });

  const runtimeError = getError();
  if (exitCode !== 0 && exitCode !== null) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    const detail = stderr ? `: ${stderr.slice(0, 500)}` : '';
    yield { type: 'error', message: `codex exited with code ${exitCode}${detail}` };
  } else if (runtimeError) {
    yield { type: 'error', message: `codex runtime error: ${runtimeError.message}` };
  }
}
