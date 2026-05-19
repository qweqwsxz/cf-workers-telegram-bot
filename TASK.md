# Task: Implement Codebase Improvements

## Overview
Implement the agreed-upon codebase improvements outlined in `SUGGESTIONS.md`.

## Tasks

### 1. Enable Type Checking in Shared Package
- [x] Add `"check": "tsc --noEmit"` to `packages/shared/package.json`.
- [x] Ensure `npm run check --workspace=@codebam/shared` passes.

### 2. Clean up ESLint Warnings
- [x] Suppress generated `worker-configuration.d.ts` via `eslint.config.js` ignore list.
- [x] Remove redundant `eslint-disable-next-line` comments in `bot/src/index.ts` and `webapp/src/routes/+page.svelte`.

### 3. Resolve TypeScript Type Errors in `webapp`
- [x] Fix `webapp/src/routes/api/chat/+server.ts` with `AiResponseData` and typed request body.
- [x] Fix `webapp/src/routes/+page.svelte` with `ChatMessage`, `BalanceResponse`, `ChatResponse` interfaces.
- [x] Fix `webapp/src/lib/Markdown.svelte` by importing `Token` from `marked`.
- [x] Eliminate the 3 `state_referenced_locally` warnings by wrapping prop reads in `untrack(() => …)`.

### 4. Eliminate `@typescript-eslint/no-explicit-any` usage
- [x] Replace `any` casts in `bot/src/index.ts` (session, KvAdapter, conversation builder, inline-AI response, fetch-handler aiResponse, sendMessage options, webhookCallback dispatch).
- [x] Replace `any` throughout `bot/src/lib/ai.ts`: typed `messages: ChatMessage[]`, `ai: AiRunner`, `toolCalls: RawToolCall[]`, `geminiParts: GeminiPart[]`, `ctx: StreamCtx`; sendMessageDraft now takes `Record<string, unknown>`.
- [x] Type the sandbox tool's `sandboxBinding` as `DurableObjectNamespace<Sandbox>` in `bot/src/lib/utils.ts`.
- [x] Tighten `packages/shared/src/index.ts` Environment (`MESSAGE_QUEUE: Queue<Task>`, `Sandbox: DurableObjectNamespace<Sandbox>`) and add `ChatMessage`, `NormalizedToolCall`, `RawToolCall`, `GeminiPart` interfaces. Add `@cloudflare/sandbox` to shared's devDeps for the type import.
- [x] Replace the catch-block `(e as any).message` in `webapp/src/routes/+page.svelte` with an `instanceof Error` narrow.

## Follow-ups (this pass)
- [x] Drop unused `ctx: Context` parameter from `getBusinessOwnerData` (and update its three call sites).
- [x] Remove unused `marked` import from `bot/src/lib/utils.ts` and the matching `marked` entry from `bot/package.json` — `markdownToHtml` already lives in `@codebam/shared`.
- [x] Enable `noUnusedLocals` / `noUnusedParameters` in `bot/tsconfig.json` and `packages/shared/tsconfig.json` so this class of dead code is caught going forward.
- [x] Fix subtle `replyWithStream` arg routing: previously all options (incl. `business_connection_id` and `reply_to_message_id`) were passed as `otherMessageDraft`. Splitting into `(otherMessageDraft, otherMessage)` pairs so the final `sendMessage` reply also carries `reply_parameters` and `business_connection_id`.

## Remaining (intentionally out of scope)
- `Tool.function: (args: any)` retains a narrowly-scoped `eslint-disable` directive because TS function-parameter contravariance prevents typed tool implementations (e.g. `({ url, method }) => ...`) from assigning to a parameter slot like `Record<string, unknown>`. The only viable alternatives are a generic `Tool<TArgs>` (which would force every callsite to pin a type) or keeping the `any` — pragmatic choice is the latter.
- Two `as unknown as` casts remain (in `bot/src/index.ts:352` for `KvAdapter` and `:824` for narrowing a getReader-bearing object to `ReadableStream`). Both bridge nominally-different but structurally-equivalent types; replacing them would require declaration-file surgery for marginal gain.

## Verification
```
npm run check --workspaces   # bot, webapp, @codebam/shared — all pass, 0 errors, 0 warnings
npm run build                # webapp + bot build successfully
npm run lint --workspace=webapp   # clean
```
