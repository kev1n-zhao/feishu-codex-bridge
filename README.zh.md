# lark-to-codex

把飞书 / Lark 消息和本地 [Codex CLI](https://developers.openai.com/codex/cli) 打通的轻量 bot。一条命令起服务，扫码绑应用，在飞书里和 Codex 对话、发图发文件、敲斜杠命令，实时看到流式回复。

[English README](./README.md)

---

## 快速开始

**前置条件：** Node.js >= 20，已安装并登录 Codex CLI。

```bash
npm i -g lark-to-codex
lark-to-codex run
```

首次启动自动进入**扫码向导**——用飞书 App 扫码，创建或绑定一个 PersonalAgent 应用。凭据自动保存到 `~/.lark-channel/config.json`。

之后私聊 bot 或在群里 `@bot` 即可开始使用。

---

## 功能

| 功能 | 说明 |
|---|---|
| **流式卡片** | Codex 的文本和工具调用实时更新在同一张交互卡片上 |
| **会话延续** | 每个 chat/话题独立 session，对话可接着上次说 |
| **抢占 + 批处理** | 新消息打断当前任务；快速连发多条自动合并请求 |
| **多工作空间** | `/ws` 切换项目目录，session 自动重置 |
| **图片 & 文件** | 直接发给 bot，Codex 读取本地缓存路径 |
| **云文档评论** | 在飞书文档里 `@bot`，Codex 在评论线程内回复 |
| **引用上下文** | 引用消息、合并转发、交互卡 JSON 自动展开为 Codex 上下文 |
| **Codex → 飞书** | 完成 `lark-cli config bind --source lark-channel` 后，Codex 可直接操作飞书卡片、文档、日历、任务等 |
| **空闲探活** | Codex 静默超时自动终止（`/timeout` 按会话设定，`/config` 设全局默认） |

---

## 命令速查

### 宿主 CLI（终端）

| 命令 | 作用 |
|---|---|
| `lark-to-codex run [-c <配置路径>]` | 前台启动 bot |
| `lark-to-codex start` | 注册为 OS 后台 daemon 并启动 |
| `lark-to-codex stop` | 停止 daemon |
| `lark-to-codex restart` | 重启 daemon |
| `lark-to-codex status` | 查看 daemon 状态 |
| `lark-to-codex unregister` | 取消 daemon 注册并停止 |
| `lark-to-codex ps` | 列出本机所有 bridge 进程 |
| `lark-to-codex kill <id\|#>` | 终止指定 bridge 进程 |

> daemon 命令需全局安装（`npm i -g`），不要用 `npx`——缓存路径会被 GC 清理。

### 斜杠命令（飞书内使用）

| 命令 | 作用 |
|---|---|
| `/new` `/reset` | 清空当前 chat 的会话 |
| `/cd <路径>` | 切换工作目录（重置 session） |
| `/ws list` / `save` / `use` / `remove` | 管理命名工作空间 |
| `/status` | 查看当前 cwd / session / agent |
| `/config` | 调整偏好和访问控制 |
| `/stop` | 终止当前运行（或点卡片 ⏹ 按钮） |
| `/timeout [N\|off\|default]` | 设置当前会话空闲超时（分钟） |
| `/ps` | 列出本机所有 start 进程 |
| `/exit <id\|#>` | 终止指定 start 进程 |
| `/reconnect` | 强制重连 WebSocket |
| `/doctor [描述]` | 把运行日志喂给 Codex 自助诊断 |
| `/help` | 帮助卡片 |
| 其它 `/xxx` | 原样传给 Codex |

**消息策略：** 私聊 = 任何消息都回；**群（含话题群）= 默认需 `@bot`**，不 @ 则沉默。`@all` 永远不响应。

---

## 数据目录

所有数据在 `~/.lark-channel/` 下：

| 文件 | 内容 |
|---|---|
| `config.json` | 应用凭据、偏好、访问控制 |
| `sessions.json` | 每个 chat/topic 的 Codex session ID |
| `workspaces.json` | 命名工作空间定义 |
| `secrets.enc` | AES-256-GCM 加密凭据 |
| `media/<chatId>/` | 下载的图片/文件（24h 自动清理） |
| `logs/YYYY-MM-DD.log` | 结构化运行日志（7天滚动） |

---

## 访问控制（可选）

默认 bot 是开放的。在飞书里发 `/config` 可限制访问：

- **用户白名单** — 仅这些 `open_id` 可用（其他人被静默忽略）
- **群白名单** — 仅在这些群触发响应（私聊不受约束）
- **管理员** — 仅这些人可运行敏感命令（`/config` `/cd` `/ws` `/exit` 等）

修改后下一条消息即生效，无需重启。

找 `open_id` / `chat_id`：让目标用户发一条消息，然后查日志：

```bash
grep '"event":"enter"' ~/.lark-channel/logs/$(date +%Y-%m-%d).log | tail -5
```

---

## 常见问题

**Bot 不回复。** 通常是 Codex CLI 未登录或 session 指向了不存在的目录。试 `/status` 查看，`/new` 重开会话。

**Codex 卡住（卡片不动）。** 可通过 `/config` 或 `/timeout` 启用空闲探活，静默超时自动终止。

**如何升级？** `npm i -g lark-to-codex@latest` 然后重启。从 0.1.11 之前版本升级，先跑一次 `lark-to-codex migrate`。

---

## 本地开发

构建并全局链接，用于本地开发调试：

```bash
git clone https://github.com/kev1n-zhao/lark-to-codex.git
cd lark-to-codex
pnpm install
pnpm link:local
```

这会执行 `pnpm build`（类型检查 + 打包），然后 `npm link` 将本地克隆的 `lark-to-codex` 命令注册为全局可用。

取消链接：`npm unlink -g lark-to-codex`

## 许可

[MIT](./LICENSE)

<img src="./assets/feedback-group-qr.png" alt="飞书反馈群二维码" width="360">
