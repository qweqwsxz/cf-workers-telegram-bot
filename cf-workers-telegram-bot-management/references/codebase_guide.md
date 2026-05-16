# Project Structure

- `src/`: Core library code.
  - `telegram_bot.ts`: Main bot class, handles command registration and determination.
  - `telegram_execution_context.ts`: Context object for each update, provides reply helpers.
  - `telegram_api.ts`: Low-level Telegram API client.
- `webapp/src/routes/api/webhook/+server.ts`: The main entry point for the bot's production logic (TuxRobot).
- `webapp/src/lib/server/chatUtils.ts`: AI configuration, system prompts, and model definitions.
- `ai-workflow/src/index.ts`: Background workflow for long-running AI tasks.
- `consumer/src/index.ts`: A minimal example consumer of the library.

# Common Workflows

## Adding a Command
1. Open `webapp/src/routes/api/webhook/+server.ts`.
2. Find the chain of `.command()` or `.on()` calls.
3. Add a new `.command('name', async (bot) => { ... })`.

## Modifying AI Behavior
1. Update `SYSTEM_PROMPTS` in `webapp/src/lib/server/chatUtils.ts`.
2. If adding a model, update `AVAILABLE_MODELS`.

## Handling Business Messages
- Updates of type `business_message` are handled in `+server.ts`.
- Business connection data (like owner name) is stored in KV under `business_connection:<id>`.
- Use `SYSTEM_PROMPTS.BUSINESS_MODE` for these messages.

# Testing
- Unit tests are in `test/`.
- Run tests using `npm test` or `vitest`.
