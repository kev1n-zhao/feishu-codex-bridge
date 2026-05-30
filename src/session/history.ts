import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface SessionSummary {
  sessionId: string;
  mtime: number;
  preview: string;
  lineCount: number;
}

interface CodexIndexEntry {
  id?: string;
  thread_name?: string;
  updated_at?: string;
}

function codexSessionIndex(): string {
  return join(homedir(), '.codex', 'session_index.jsonl');
}

/** Return recent Codex sessions, newest first. Codex's index is global; cwd is kept for API symmetry. */
export async function listRecentSessions(_cwd: string, limit = 5): Promise<SessionSummary[]> {
  let entries: CodexIndexEntry[];
  try {
    entries = await readCodexIndex();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const sorted = entries
    .filter((e): e is Required<Pick<CodexIndexEntry, 'id' | 'updated_at'>> & CodexIndexEntry =>
      Boolean(e.id && e.updated_at),
    )
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit);

  return sorted.map((entry) => ({
    sessionId: entry.id,
    mtime: Date.parse(entry.updated_at),
    preview: entry.thread_name || entry.id,
    lineCount: 0,
  }));
}

async function readCodexIndex(): Promise<CodexIndexEntry[]> {
  const path = codexSessionIndex();
  await stat(path);
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream });
  const entries: CodexIndexEntry[] = [];
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as CodexIndexEntry);
      } catch {
        /* malformed line */
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return entries;
}

/** Format a relative time like "3 小时前", "昨天", "3 天前". */
export function formatRelTime(mtime: number): string {
  const diffMs = Date.now() - mtime;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '昨天';
  if (day < 30) return `${day} 天前`;
  const mo = Math.floor(day / 30);
  return `${mo} 个月前`;
}
