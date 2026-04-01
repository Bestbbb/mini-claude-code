# mini-claude-code

Claude Code 核心架构的中等规模复现（~5000 行，54 个文件）。

原版 Claude Code 有 1902 个文件、512K 行代码。本项目在保留核心设计模式的前提下，将其精简为可读、可运行的教学级实现。

## 安装

```bash
npm install -g @xzwtlb/mini-claude-code
```

或直接使用 npx：

```bash
npx @xzwtlb/mini-claude-code
```

首次运行会引导你配置 API Key、API 地址和模型选择，配置保存在 `~/.mini-claude-code/.env`。

## 推荐：阿里云百炼 Coding Plan

本项目推荐使用 [阿里云百炼 DashScope Coding Plan](https://bailian.console.aliyun.com/) 作为 API 后端，**便宜量大**，通过 Anthropic 兼容接口支持多家国产大模型：

| 品牌 | 模型 | 说明 |
| --- | --- | --- |
| **Kimi** | `kimi-k2.5` | **默认推荐**，综合能力强 |
| 千问 | `qwen3.5-plus` | 阿里通义千问 3.5 Plus |
| 千问 | `qwen3-max-2026-01-23` | 千问 3 Max |
| 千问 | `qwen3-coder-next` | 千问代码专用 |
| 千问 | `qwen3-coder-plus` | 千问代码增强 |
| 智谱 | `glm-5` | 智谱 GLM 5 |
| 智谱 | `glm-4.7` | 智谱 GLM 4.7 |
| MiniMax | `MiniMax-M2.5` | MiniMax M2.5 |

### 配置步骤

1. 注册 [阿里云百炼](https://bailian.console.aliyun.com/)，开通 Coding Plan
2. 在控制台获取 API Key
3. 运行 `npx @xzwtlb/mini-claude-code`，首次启动会引导配置：

```text
  Welcome to mini-claude-code!

  No API key found. Let's set one up.

  ANTHROPIC_API_KEY: <你的百炼 API Key>
  ANTHROPIC_BASE_URL: https://coding.dashscope.aliyuncs.com/apps/anthropic

  Available models:
    1. kimi-k2.5                [Kimi]    Kimi K2.5 (推荐)
    2. qwen3.5-plus             [千问]    Qwen 3.5 Plus
    3. qwen3-max-2026-01-23     [千问]    Qwen 3 Max
    4. qwen3-coder-next         [千问]    Qwen 3 Coder Next
    5. qwen3-coder-plus         [千问]    Qwen 3 Coder Plus
    6. glm-5                    [智谱]    GLM 5
    7. glm-4.7                  [智谱]    GLM 4.7
    8. MiniMax-M2.5             [MiniMax] MiniMax M2.5

  Choose model (1-8, or name, Enter for kimi-k2.5): 1

  Save to ~/.mini-claude-code/.env for next time? (Y/n): y
```

也可以手动配置 `~/.mini-claude-code/.env`：

```bash
ANTHROPIC_API_KEY=sk-xxx
ANTHROPIC_BASE_URL=https://coding.dashscope.aliyuncs.com/apps/anthropic
MODEL=kimi-k2.5
```

## CLI 参数

```text
mini-claude-code [options] [prompt]

选项:
  -m, --model <model>              模型名称 (默认 kimi-k2.5)
  -p, --print <prompt>             非交互模式：执行后退出
  -k, --api-key <key>              API Key
  --base-url <url>                 自定义 API 地址
  --auto                           自动批准所有工具调用
  --dangerously-skip-permissions   跳过所有权限检查
  --resume [sessionId]             恢复历史会话
```

## 使用示例

```bash
# 交互模式（直接聊天）
mini-claude-code

# 指定模型
mini-claude-code -m qwen3-coder-next

# 单次执行
mini-claude-code -p "读取 package.json 并总结"

# 自动模式（不询问权限）
mini-claude-code --auto "找出所有 .ts 文件并统计行数"

# 恢复上次会话
mini-claude-code --resume
```

## 斜杠命令

在交互模式下输入 `/` 开头的命令：

| 命令 | 功能 |
| --- | --- |
| `/help` | 列出所有命令 |
| `/model [name]` | 查看/切换模型 |
| `/cost` | 查看 Token 用量和成本 |
| `/compact` | 压缩对话历史 |
| `/clear` | 清空历史 |
| `/memory` | 查看/编辑 CLAUDE.md |
| `/config` | 查看/切换权限模式 |
| `/sessions` | 列出历史会话 |
| `/resume [id]` | 恢复会话 |
| `/exit` | 退出 |

## 架构概览

```text
src/
├── index.tsx                 # CLI 入口，首次配置引导
├── bootstrap.ts              # 会话初始化（CWD、OS、shell、CLAUDE.md）
├── systemPrompt.ts           # 动态系统提示词组装
├── settings.ts               # 三级配置合并（全局/项目/本地）
├── types.ts                  # 全局类型定义
├── store.ts                  # 最小响应式状态管理
│
├── query.ts                  # 核心 Agentic 循环
├── api.ts                    # API 流式调用 + 缓存 + Token 追踪
├── tool.ts                   # Tool 接口定义
├── tools.ts                  # 工具注册表（13 个工具）
├── permissions.ts            # 权限判断主逻辑
├── hooks.ts                  # Pre/Post 工具调用钩子
├── commands.ts               # 斜杠命令框架
│
├── tools/                    # 13 个工具
│   ├── BashTool.ts           # Shell 命令执行
│   ├── FileReadTool.ts       # 文件读取
│   ├── FileWriteTool.ts      # 文件写入
│   ├── FileEditTool.ts       # 文件编辑
│   ├── GrepTool.ts           # 正则搜索
│   ├── GlobTool.ts           # 文件匹配
│   ├── AgentTool.ts          # 子 Agent
│   ├── WebFetchTool.ts       # URL 获取
│   ├── WebSearchTool.ts      # Web 搜索
│   ├── AskUserTool.ts        # 向用户提问
│   ├── TodoWriteTool.ts      # 待办管理
│   ├── NotebookEditTool.ts   # Jupyter 编辑
│   └── SkillTool.ts          # 技能模板
│
├── commands/                 # 10 个斜杠命令
├── services/                 # 压缩、Token 追踪、重试、会话持久化
├── permissions/              # Bash 安全分类、路径校验
└── components/               # React (Ink) 终端 UI
```

## 核心机制

### Agentic 循环

```text
用户消息 → API 流式调用 → 解析响应
  ├── 纯文本 → 返回给用户，结束
  └── tool_use → hooks → 权限检查 → 执行工具 → hooks → 结果追加 → 继续循环
```

### 权限系统

十级判断链：bypass → 只读放行 → settings deny → settings allow → 工具自检 → alwaysAllow → Bash 安全分类 → 路径校验 → auto 模式 → 询问用户

### 对话压缩

上下文超过 80% 时自动触发：保留最近 6 条消息，旧消息由 AI 生成摘要替代。

## 配置文件

| 路径 | 用途 |
| --- | --- |
| `~/.mini-claude-code/.env` | API Key、Base URL、默认模型 |
| `~/.claude/settings.json` | 全局权限规则、Hooks |
| `.claude/settings.json` | 项目级设置 |
| `CLAUDE.md` | 项目指令（注入系统提示词） |
| `~/.claude/skills/*.md` | 技能模板 |
| `~/.claude/sessions/` | 会话历史 |

## 卸载

```bash
npm uninstall -g @xzwtlb/mini-claude-code
rm -rf ~/.mini-claude-code    # 删除配置
```

## 技术栈

- **TypeScript** — 全部源码
- **React + Ink** — 终端 UI 渲染
- **Anthropic SDK** — 兼容 API 流式调用
- **Zod** — 工具输入 schema 定义与验证
- **Commander** — CLI 参数解析

## License

MIT
