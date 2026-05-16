<h3 align="center">
<img src="https://raw.githubusercontent.com/codebam/cf-workers-telegram-bot/master/assets/logo.png" width="100" />
<br/>
CF Workers Telegram Bot
<br/>
</h3>

<h6 align="center">
  <a href="https://cf-workers-telegram-bot.codebam.ca">Docs</a>
</h6>

<p align="center">
<a href="https://github.com/codebam/cf-workers-telegram-bot/stargazers">  <img src="https://img.shields.io/github/stars/codebam/cf-workers-telegram-bot?style=for-the-badge&logo=starship&color=111111&logoColor=ffffff&labelColor=000000" alt="GitHub stars"/></a>
<a href="https://github.com/codebam/cf-workers-telegram-bot/issues">
  <img src="https://img.shields.io/github/issues/codebam/cf-workers-telegram-bot?style=for-the-badge&logo=gitbook&color=111111&logoColor=ffffff&labelColor=000000" alt="GitHub issues"/></a>
<a href="https://github.com/codebam/cf-workers-telegram-bot">  <img src="https://img.shields.io/github/forks/codebam/cf-workers-telegram-bot?style=for-the-badge&logo=git&color=111111&logoColor=ffffff&labelColor=000000" alt="GitHub forks"/></a>
<a href="https://www.npmjs.com/package/@codebam/cf-workers-telegram-bot">  <img src="https://img.shields.io/npm/v/@codebam/cf-workers-telegram-bot?style=for-the-badge&logo=npm&color=111111&logoColor=ffffff&labelColor=000000" alt="npm version" /></a>
</p>

![screenshot of cf-workers-telegram-bot](https://raw.githubusercontent.com/codebam/cf-workers-telegram-bot/master/assets/screenshot.png)

A lightweight, type-safe Telegram Bot framework for Cloudflare Workers.

## Installation

```sh
npm install @codebam/cf-workers-telegram-bot
```

## Quick Start

```typescript
import TelegramBot, { TelegramExecutionContext } from '@codebam/cf-workers-telegram-bot';

export interface Env {
	SECRET_TELEGRAM_API_TOKEN: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const bot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);

		await bot
			.command('start', async (ctx) => {
				await ctx.reply('Hello! I am running on Cloudflare Workers.');
			})
			.onMessage(async (ctx) => {
				await ctx.reply(`You said: ${ctx.text}`);
			})
			.handle(request);

		return new Response('ok');
	},
};
```

## Features

- **Type-safe**: Built with TypeScript for a better developer experience.
- **Middleware support**: Run logic before your handlers.
- **Built-in Webhook Management**: Easily set your webhook with a simple URL.
- **Lightweight**: Zero dependencies (other than type definitions).

## Using the Consumer Template

The `consumer` directory in this repository serves as a template for new projects. It is included as a git submodule.

1. **Clone the repository with submodules**:

   ```sh
   git clone --recursive https://github.com/codebam/cf-workers-telegram-bot.git
   ```

   _Or, if you've already cloned it:_

   ```sh
   git submodule update --init --recursive
   ```

2. **Copy the consumer directory**:

   ```sh
   cp -r consumer my-new-bot
   cd my-new-bot
   npm install
   ```

3. **Configure your bot**:
   Update `wrangler.toml` with your worker name.

4. **Set your Telegram Token**:
   Get a token from [@BotFather](https://t.me/BotFather) and add it to your worker:

   ```sh
   npx wrangler secret put SECRET_TELEGRAM_API_TOKEN
   ```

5. **Deploy**:

   ```sh
   npm run deploy
   ```

6. **Set Webhook**:
   Visit the following URL in your browser to register your worker with Telegram:
   `https://<your-worker>.<your-subdomain>.workers.dev/<SECRET_TELEGRAM_API_TOKEN>/setWebhook`

## Deployment

### Manual Deployment

Use [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to deploy:

```sh
npx wrangler deploy
```

### GitHub Actions

To automate deployments, use the [Wrangler Action](https://github.com/cloudflare/wrangler-action) or Cloudflare's built-in [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/github-actions/).

## Development

### Setup

1. **Install dependencies**:
   ```sh
   npm install
   ```

2. **Set up Git hooks**:
   This project uses custom Git hooks for quality control. Run the following script to enable them:
   ```sh
   ./setup_hooks.sh
   ```

### Scripts

- `npm run lint`: Run ESLint on the source code.
- `npm run format`: Format the code using Prettier.
- `npm run build`: Compile TypeScript and run type checks.
- `npm run test`: Run unit tests with Vitest.

The pre-commit hook automatically runs formatting and linting on staged files (via `lint-staged`), followed by a full project type check and tests before every commit.

## API Documentation

Detailed API documentation is available at [cf-workers-telegram-bot.codebam.ca](https://cf-workers-telegram-bot.codebam.ca).

## License

Apache-2.0
