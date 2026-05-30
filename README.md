# feishu-codex-bridge

A lightweight bot that bridges Feishu / Lark messenger with your local [Codex CLI](https://developers.openai.com/codex/cli). Talk to Codex from chat — send messages, images, files, and slash commands, and get streaming responses in real time.

[中文 README](./README.zh.md)

---

## Quick start

**Prerequisites:** Node.js >= 20, Codex CLI installed and logged in.

```bash
npm i -g feishu-codex-bridge
feishu-codex-bridge run
```

First run detects no app is configured and launches a **QR-code wizard** — scan it with the Feishu/Lark app to create or bind a PersonalAgent app. Credentials are saved automatically to `~/.lark-channel/config.json`.

That's it. DM the bot or `@bot` in a group and start talking.

---

## Features

| Feature | Description |
|---|---|
| **Streaming cards** | Codex output (text + tool calls) updates on a single interactive card in real time |
| **Per-chat sessions** | Each chat/topic keeps its own Codex session — conversations resume where they left off |
| **Preempt + batch** | New messages interrupt the current run; rapid-fire messages coalesce into one request |
| **Multiple workspaces** | `/ws` switches between named project directories, sessions reset per workspace |
| **Images & files** | Send them to the bot — Codex reads the locally cached paths |
| **Cloud-doc comments** | `@bot` in a Feishu doc comment gets a Codex-powered reply in-thread |
| **Quoted context** | Reply-quoted messages, forwarded messages, and interactive card JSON are expanded into Codex context |
| **Codex → Feishu actions** | After `lark-cli config bind --source lark-channel`, Codex can send cards, access docs, calendar, tasks, etc. |
| **Idle watchdog** | Auto-kills Codex if it goes silent for N minutes (configurable per session via `/timeout` or globally via `/config`) |

---

## Commands

### Host CLI (terminal)

| Command | Effect |
|---|---|
| `feishu-codex-bridge run [-c <config>]` | Run the bot in the foreground |
| `feishu-codex-bridge start` | Register as an OS daemon (launchd / systemd / Task Scheduler) and start |
| `feishu-codex-bridge stop` | Stop the daemon |
| `feishu-codex-bridge restart` | Restart the daemon |
| `feishu-codex-bridge status` | Show daemon status |
| `feishu-codex-bridge unregister` | Remove daemon registration and stop |
| `feishu-codex-bridge ps` | List running bridge processes |
| `feishu-codex-bridge kill <id\|#>` | Kill a bridge process |

> Daemon commands require global install (`npm i -g`). Do not use `npx` for daemon commands — the cache path gets garbage collected.

### Slash commands (inside Feishu / Lark)

| Command | Effect |
|---|---|
| `/new` `/reset` | Clear current chat's session |
| `/cd <path>` | Switch working directory (resets session) |
| `/ws list` / `save` / `use` / `remove` | Manage named workspaces |
| `/status` | Show cwd / session / agent info |
| `/config` | Adjust preferences (reply style, tool-call display, access control) |
| `/stop` | Stop the current run (or click the ⏹ button on the card) |
| `/timeout [N\|off\|default]` | Set idle watchdog minutes for current session |
| `/ps` | List all `start` processes on this host |
| `/exit <id\|#>` | Stop a `start` process |
| `/reconnect` | Force WebSocket reconnect (after network blip) |
| `/doctor [description]` | Feed recent logs to Codex for self-diagnosis |
| `/help` | Help card |
| Other `/xxx` | Forwarded verbatim to Codex |

**Reply policy:** In DM, the bot replies to everything. In **groups (including topic groups)**, `@bot` is required by default. `@all` is never answered.

---

## Data directory

Everything lives under `~/.lark-channel/`:

| File | Purpose |
|---|---|
| `config.json` | App credentials, preferences, access control |
| `sessions.json` | Codex session IDs per chat/topic |
| `workspaces.json` | Named workspace definitions |
| `secrets.enc` | AES-256-GCM encrypted secrets |
| `media/<chatId>/` | Downloaded images/files (auto-cleaned after 24h) |
| `logs/YYYY-MM-DD.log` | Structured JSON logs (7-day rotation) |

---

## Access control (optional)

Out of the box the bot is **open** — anyone who finds it can use it. Send `/config` inside Feishu to restrict access via three allowlists:

- **Allowed users** — only these `open_id`s can interact (others are silently ignored)
- **Allowed chats** — only these `chat_id`s trigger responses (DMs are always exempt)
- **Admins** — only these `open_id`s can run sensitive commands (`/config`, `/cd`, `/ws`, `/exit`, etc.)

DM the bot with `/config` to configure. Changes take effect on the next message — no restart needed.

To find `open_id` / `chat_id`: have the user send a message, then check the log:

```bash
grep '"event":"enter"' ~/.lark-channel/logs/$(date +%Y-%m-%d).log | tail -5
```

---

## FAQ

**Bot stays silent / Codex never replies.** Usually Codex CLI isn't logged in, or the session points to a nonexistent cwd. Try `/status` to inspect, `/new` for a fresh session.

**Codex freezes (card stuck).** The idle watchdog (if enabled via `/config` or `/timeout`) auto-kills processes that are silent for N minutes.

**How to upgrade?** `npm i -g feishu-codex-bridge@latest` then restart. If upgrading from before 0.1.11, run `feishu-codex-bridge migrate` once.

---

## License

[MIT](./LICENSE)

<img src="./assets/feedback-group-qr.png" alt="Feedback group QR code" width="360">
