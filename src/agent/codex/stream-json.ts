import type { AgentEvent } from '../types';

interface CodexContext {
  cwd?: string;
  model?: string;
}

interface CodexJsonEvent {
  type?: string;
  thread_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
  };
  error?: { message?: string } | string;
  message?: string;
}

export function* translateEvent(
  raw: unknown,
  context: CodexContext = {},
): Generator<AgentEvent> {
  if (!raw || typeof raw !== 'object') return;
  const evt = raw as CodexJsonEvent;

  if (evt.type === 'thread.started' && evt.thread_id) {
    yield {
      type: 'system',
      sessionId: evt.thread_id,
      cwd: context.cwd,
      model: context.model,
    };
    return;
  }

  if (evt.type === 'item.started' && evt.item?.type === 'command_execution') {
    yield {
      type: 'tool_use',
      id: evt.item.id ?? `cmd-${Date.now()}`,
      name: 'shell',
      input: evt.item.command ?? {},
    };
    return;
  }

  if (evt.type === 'item.completed' && evt.item?.type === 'command_execution') {
    yield {
      type: 'tool_result',
      id: evt.item.id ?? `cmd-${Date.now()}`,
      output: evt.item.aggregated_output ?? '',
      isError: typeof evt.item.exit_code === 'number' && evt.item.exit_code !== 0,
    };
    return;
  }

  if (evt.type === 'item.completed' && evt.item?.type === 'agent_message') {
    if (evt.item.text) yield { type: 'text', delta: evt.item.text };
    return;
  }

  if (evt.type === 'turn.completed') {
    if (evt.usage) {
      yield {
        type: 'usage',
        inputTokens: evt.usage.input_tokens,
        outputTokens: evt.usage.output_tokens,
      };
    }
    yield { type: 'done' };
    return;
  }

  if (evt.type === 'error') {
    const message =
      typeof evt.error === 'string' ? evt.error : evt.error?.message ?? evt.message ?? 'unknown error';
    yield { type: 'error', message };
  }
}
