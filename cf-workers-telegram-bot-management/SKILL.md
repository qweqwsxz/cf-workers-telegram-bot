---
name: cf-workers-telegram-bot-management
description: Manage and extend the cf-workers-telegram-bot monorepo, including library changes, webhook logic, and AI prompt engineering.
---

# CF Workers Telegram Bot Management

## Overview
This skill helps you navigate and modify the `cf-workers-telegram-bot` project. It covers the library core, the SvelteKit-based webhook handler, and AI workflow integration.

## Key Files
- Library: `src/`
- Production Bot Logic: `webapp/src/routes/api/webhook/+server.ts`
- AI Config: `webapp/src/lib/server/chatUtils.ts`

## Workflows
For detailed architecture and common tasks like adding commands or modifying business mode, see [references/codebase_guide.md](references/codebase_guide.md).

## Guidelines
- **Type Safety**: Use `@grammyjs/types` for Telegram objects.
- **Context Helpers**: Always prefer `bot.reply()`, `bot.sendTyping()`, etc., from `TelegramExecutionContext`.
- **KV Storage**: Use `env.CONVERSATION_HISTORY` for persistent state.
- **AI Workflows**: Long-running AI tasks should be delegated to `env.AI_WORKFLOW`.
