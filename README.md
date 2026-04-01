# mini-claude-code

Claude Code 核心架构的中等规模复现（~4900 行，54 个文件）。

原版 Claude Code 有 1902 个文件、512K 行代码。本项目在保留核心设计模式的前提下，将其精简为可读、可运行的教学级实现。

## 快速开始

```bash
cd mini-claude-code
npm install

# 方式一：复制 .env 文件并填入 API Key
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY

# 方式二：直接设置环境变量
export ANTHROPIC_API_KEY=sk-ant-...

npx tsx src/index.tsx
```

### 使用代理 / 自定义 API 地址

支持通过 `ANTHROPIC_BASE_URL` 或 `--base-url` 指定自定义 API 端点，适用于各类 Anthropic API 代理服务：

```bash
# .env 方式
ANTHROPIC_API_KEY=sk-xxx
ANTHROPIC_BASE_URL=https://your-proxy.example.com

# 命令行方式
npx tsx src/index.tsx --base-url https://your-proxy.example.com
```

### CLI 参数

```text
npx tsx src/index.tsx [options] [prompt]

选项:
  -m, --model <model>              模型名称 (默认 claude-sonnet-4-20250514)
  -p, --print <prompt>             非交互模式：执行后退出
  -k, --api-key <key>              API Key (或通过环境变量 ANTHROPIC_API_KEY)
  --base-url <url>                 自定义 API 地址 (或 ANTHROPIC_BASE_URL 环境变量)
  --auto                           自动批准所有工具调用
  --dangerously-skip-permissions   跳过所有权限检查
  --resume [sessionId]             恢复历史会话
```

### 使用示例

```bash
# 交互模式
npx tsx src/index.tsx

# 单次执行
npx tsx src/index.tsx -p "读取 package.json 并总结"

# 自动模式（不询问权限）
npx tsx src/index.tsx --auto "找出所有 .ts 文件并统计行数"

# 恢复上次会话
npx tsx src/index.tsx --resume
```

## 架构概览

```
src/
├── index.tsx                 # CLI 入口，参数解析，启动 Ink 渲染
├── bootstrap.ts              # 会话初始化（CWD、OS、shell、CLAUDE.md）
├── systemPrompt.ts           # 动态系统提示词组装
├── settings.ts               # 三级配置合并（全局/项目/本地）
├── types.ts                  # 全局类型定义
├── store.ts                  # 最小响应式状态管理
│
├── query.ts                  # ★ 核心 Agentic 循环
├── api.ts                    # Anthropic API 流式调用 + 缓存 + Token 追踪
├── tool.ts                   # Tool 接口定义 + buildTool 工厂
├── tools.ts                  # 工具注册表（13 个工具）
├── permissions.ts            # 权限判断主逻辑
├── hooks.ts                  # Pre/Post 工具调用钩子系统
├── commands.ts               # 斜杠命令框架
│
├── tools/                    # 13 个工具实现
│   ├── BashTool.ts           #   Shell 命令执行
│   ├── FileReadTool.ts       #   文件读取
│   ├── FileWriteTool.ts      #   文件写入
│   ├── FileEditTool.ts       #   文件编辑（查找替换）
│   ├── GrepTool.ts           #   正则内容搜索
│   ├── GlobTool.ts           #   文件名模式匹配
│   ├── AgentTool.ts          #   子 Agent 派生
│   ├── WebFetchTool.ts       #   URL 内容获取
│   ├── WebSearchTool.ts      #   DuckDuckGo 搜索
│   ├── AskUserTool.ts        #   向用户提问
│   ├── TodoWriteTool.ts      #   待办事项管理
│   ├── NotebookEditTool.ts   #   Jupyter Notebook 编辑
│   └── SkillTool.ts          #   技能模板执行
│
├── commands/                 # 10 个斜杠命令
│   ├── help.ts               #   /help    列出命令
│   ├── clear.ts              #   /clear   清空历史
│   ├── compact.ts            #   /compact 压缩对话
│   ├── model.ts              #   /model   切换模型
│   ├── exit.ts               #   /exit    退出
│   ├── cost.ts               #   /cost    Token 用量与成本
│   ├── memory.ts             #   /memory  查看/编辑 CLAUDE.md
│   ├── config.ts             #   /config  查看/切换权限模式
│   ├── resume.ts             #   /resume  恢复会话
│   └── sessions.ts           #   /sessions 列出历史会话
│
├── services/                 # 服务层
│   ├── compact.ts            #   对话压缩（摘要 + 滑动窗口）
│   ├── compactPrompt.ts      #   压缩用提示词模板
│   ├── tokenEstimation.ts    #   Token 估算（字符/4 近似）
│   ├── tokenTracking.ts      #   逐次 API 调用成本追踪
│   ├── withRetry.ts          #   指数退避重试（429/529）
│   ├── sessionStorage.ts     #   JSONL 会话持久化
│   └── stopHooks.ts          #   回合结束钩子
│
├── permissions/              # 增强权限
│   ├── bashClassifier.ts     #   Bash 命令安全分类（safe/risky/dangerous）
│   └── pathValidator.ts      #   文件路径敏感性校验
│
└── components/               # React (Ink) UI 层
    ├── App.tsx               #   顶层组件（状态管理、事件分发）
    ├── MessageList.tsx       #   消息列表渲染
    ├── PromptInput.tsx       #   输入框（历史、Tab 补全）
    ├── PermissionDialog.tsx  #   权限确认对话框
    ├── Spinner.tsx           #   加载动画
    ├── ToolResultView.tsx    #   工具结果渲染
    ├── DiffView.tsx          #   Diff 渲染
    ├── CostDisplay.tsx       #   底部成本状态栏
    └── CommandOutput.tsx     #   命令输出渲染
```

## 核心机制

### 1. Agentic 循环 (`query.ts`)

Claude Code 的核心是一个 `while(true)` 循环：

```
用户消息 → API 流式调用 → 解析响应
  ├── 纯文本 → 返回给用户，结束
  └── tool_use → 权限检查 → 执行工具 → 结果追加 → 继续循环
```

每轮循环开始前检查 auto-compact（上下文快满时自动压缩历史）。工具执行前后运行 hooks。

### 2. 权限系统 (`permissions.ts`)

十级判断链：

1. bypass 模式 → 直接放行
2. 只读工具 → 放行
3. settings deny 规则 → 拒绝
4. settings allow 规则 → 放行
5. 工具自身 checkPermissions
6. alwaysAllow 规则（用户选过"总是允许"）
7. Bash 命令安全分类
8. 文件路径敏感性校验
9. auto 模式 → 放行
10. default 模式 → 询问用户

### 3. 流式 API (`api.ts`)

使用 Anthropic SDK 的 `client.messages.stream()` 进行流式调用。逐 token 输出文本，逐步构建 tool_use JSON。支持 prompt caching（`cache_control: ephemeral`）和 token 用量追踪。

### 4. 对话压缩 (`services/compact.ts`)

当消息总量估算超过上下文窗口 80% 时自动触发：

- 保留最近 6 条消息
- 将旧消息交给 Claude 生成结构化摘要
- 用摘要替换旧消息，大幅减少 token 占用

### 5. 子 Agent (`tools/AgentTool.ts`)

可以派生独立的 sub-agent：拥有自己的消息历史，共享工具集（除了 Agent 本身，防止递归），最多运行 10 轮。用于并行研究或复杂多步操作。

### 6. Hooks 系统 (`hooks.ts`)

从 `settings.json` 读取 hook 配置，在工具调用前后执行 shell 命令：

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "command": "echo $CLAUDE_TOOL_INPUT | check-safety" }
    ],
    "PostToolUse": [
      { "matcher": "*", "command": "logger 'Tool used: $CLAUDE_TOOL_NAME'" }
    ]
  }
}
```

PreToolUse hook 返回非零退出码会阻止工具执行。

## 与原版的对应关系

| 原版子系统 | 原版规模 | mini 实现 | 保真度 |
|-----------|---------|----------|-------|
| Agentic 循环 | 1700 行 | query.ts 247 行 | 高 |
| 工具集 | 45 目录 | 13 个工具 | 中 |
| API 客户端 | 22 文件 | api.ts + withRetry 293 行 | 中 |
| 权限系统 | 26 文件 | 3 文件 338 行 | 中 |
| 对话压缩 | 13 文件 | 3 文件 268 行 | 中 |
| 命令系统 | 101 目录 | 10 个命令 354 行 | 低-中 |
| Hooks | 87 文件 | hooks.ts 186 行 | 低 |
| 系统提示词 | 914 行 | systemPrompt.ts 80 行 | 中 |
| 会话持久化 | 多文件 | sessionStorage.ts 150 行 | 中 |
| 状态管理 | 569 行 | store.ts 44 行 | 高 |
| UI/REPL | 5005 行 | 9 个组件 990 行 | 中 |
| 设置系统 | 19 文件 | settings.ts 155 行 | 低 |
| 成本追踪 | 分散 | tokenTracking.ts 108 行 | 中 |

**未复现：** MCP 协议、OAuth、远程会话、语音模式、Vim 模式、IDE/LSP 集成、插件市场、多 Agent Swarm、Buddy 系统、协调者模式。

## 配置

### settings.json

在 `~/.claude/settings.json` 或项目的 `.claude/settings.json` 中配置：

```json
{
  "model": "claude-sonnet-4-20250514",
  "permissions": {
    "allow": [
      { "tool": "Bash", "pattern": "npm *" },
      { "tool": "Bash", "pattern": "git *" }
    ],
    "deny": [
      { "tool": "Bash", "pattern": "rm -rf *" }
    ]
  },
  "hooks": {
    "PreToolUse": [],
    "PostToolUse": []
  }
}
```

### CLAUDE.md

项目根目录的 `CLAUDE.md` 会被自动读取并注入系统提示词，用于存放项目级指令。

### Skills

在 `~/.claude/skills/` 下放置 `.md` 或 `.txt` 文件，可通过 Skill 工具调用。

## 技术栈

- **TypeScript** — 全部源码
- **React + Ink** — 终端 UI 渲染
- **Anthropic SDK** — Claude API 流式调用
- **Zod** — 工具输入 schema 定义与验证
- **Commander** — CLI 参数解析
