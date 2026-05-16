import { Update as TelegramUpdate } from '@grammyjs/types';

import TelegramExecutionContext from './telegram_execution_context.js';
import Webhook from './webhook.js';

/** Class representing a telegram bot. */
export default class TelegramBot {
  /** The telegram token */
  token: string;
  /** The telegram api URL */
  api: URL;
  /** The telegram webhook object */
  webhook: Webhook = new Webhook('', new Request('http://127.0.0.1'));
  /** The telegram update object */
  update: TelegramUpdate = { update_id: 0 } as TelegramUpdate;  /** The telegram commands record map */
  commands: Record<string, (ctx: TelegramExecutionContext) => Promise<Response | void>> = {};
  /** Middleware functions to run before handlers */
  middleware: ((ctx: TelegramExecutionContext) => Promise<Response | void>)[] = [];
  /** The current bot context */
  currentContext!: TelegramExecutionContext;
  /** Default command to use when no matching command is found */
  defaultCommand = ':message';
  /** Optional secret token for webhook verification */
  secretToken?: string;
  /** The bot's own user ID */
  botId: number;
  /** TTL for self-responses */
  ttl = 2;

  /**
   *	Create a bot
   *	@param token - the telegram secret token
   *	@param options - optional configuration for the bot
   */
  constructor(token: string, options?: { defaultCommand?: string; secretToken?: string }) {
    this.token = token.trim();
    this.api = new URL('https://api.telegram.org/bot' + this.token);
    this.botId = parseInt(this.token.split(':')[0]);

    if (options?.defaultCommand) {
      this.defaultCommand = options.defaultCommand;
    }

    if (options?.secretToken) {
      this.secretToken = options.secretToken;
    }

    // Register default handler for the default command to avoid errors
    this.commands[this.defaultCommand] = () => Promise.resolve(new Response('Command not implemented'));
  }

  /**
   * Register a function on the bot
   * @param event - the event or command name
   * @param callback - the bot context
   */
  on(event: string, callback: (ctx: TelegramExecutionContext) => Promise<Response | void>) {
    this.commands[event] = callback;
    return this;
  }

  /**
   * Register middleware to run before all handlers
   * @param callback - the middleware function
   */
  use(callback: (ctx: TelegramExecutionContext) => Promise<Response | void>) {
    this.middleware.push(callback);
    return this;
  }

  /**
   * Register a command handler
   * @param commandName - the command name (without /)
   * @param callback - the handler function
   */
  command(commandName: string, callback: (ctx: TelegramExecutionContext) => Promise<Response | void>) {
    return this.on(commandName, callback);
  }

  /**
   * Register a message handler
   * @param callback - the handler function
   */
  onMessage(callback: (ctx: TelegramExecutionContext) => Promise<Response | void>) {
    return this.on(':message', callback);
  }

  /**
   * Register a photo handler
   * @param callback - the handler function
   */
  onPhoto(callback: (ctx: TelegramExecutionContext) => Promise<Response | void>) {
    return this.on(':photo', callback);
  }

  /**
   * Register a callback query handler
   * @param callback - the handler function
   */
  onCallback(callback: (ctx: TelegramExecutionContext) => Promise<Response | void>) {
    return this.on(':callback', callback);
  }

  /**
   * Register multiple command handlers at once
   * @param handlers - object mapping command names to handler functions
   */
  registerHandlers(handlers: Record<string, (ctx: TelegramExecutionContext) => Promise<Response | void>>) {
    for (const [event, callback] of Object.entries(handlers)) {
      this.on(event, callback);
    }
    return this;
  }

  /**
   * Determine the command from the update
   * @param ctx - the execution context
   * @param args - command arguments
   * @returns the command string
   */
  private determineCommand(ctx: TelegramExecutionContext, args: string[]): string {
    // First check if it's a special update type
    switch (ctx.update_type) {
      case 'photo':
        return ':photo' in this.commands ? ':photo' : this.defaultCommand;
      case 'voice':
        return ':voice' in this.commands ? ':voice' : this.defaultCommand;
      case 'document':
        return ':document' in this.commands ? ':document' : this.defaultCommand;
      case 'callback':
        return ':callback' in this.commands ? ':callback' : this.defaultCommand;
      case 'inline':
        return ':inline' in this.commands ? ':inline' : this.defaultCommand;
      case 'guest_message':
        // For guest messages, we fall through to command detection if it's not a special type
        break;
      case 'business_message':
        return this.defaultCommand;
      case 'pre_checkout_query':
        return ':pre_checkout_query' in this.commands ? ':pre_checkout_query' : this.defaultCommand;
      case 'successful_payment':
        return ':successful_payment' in this.commands ? ':successful_payment' : this.defaultCommand;
    }

    // Then check if there's a command starting with / anywhere in the message
    const commandIndex = args.findIndex((arg) => arg.startsWith('/'));
    if (commandIndex !== -1) {
      if (ctx.update_type === 'message' && ctx.update.message?.chat.type !== 'private') {
        return this.defaultCommand;
      }

      const fullCommand = args[commandIndex];
      const command = fullCommand.substring(
        1,
        fullCommand.lastIndexOf('@') > -1 ? fullCommand.lastIndexOf('@') : fullCommand.length,
      );
      if (command in this.commands) {
        // Shift args so the command handler sees the command at index 0
        ctx.args = args.slice(commandIndex);
        return command;
      }
    }

    if (ctx.update_type === 'guest_message' && ':guest_message' in this.commands) {
      return ':guest_message';
    }

    return this.defaultCommand;
  }

  /**
   * Handle a request on a given bot
   * @param request - the request to handle
   */
  async handle(request: Request): Promise<Response> {
    this.webhook = new Webhook(this.token, request, this.secretToken);
    const url = new URL(request.url);

    // Check if the request is for this bot
    if (!url.pathname.startsWith(`/${this.token}`)) {
      return new Response('Invalid token', { status: 404 });
    }

    // Handle different HTTP methods
    switch (request.method) {
      case 'POST': {
        try {
          // Verify secret token if configured
          if (this.secretToken && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== this.secretToken) {
            return new Response('Unauthorized', { status: 403 });
          }

          this.update = await request.json();
          console.log(this.update);

          const ctx = new TelegramExecutionContext(this, this.update);
          this.currentContext = ctx;

          if (ctx.shouldProcess && !(await ctx.shouldProcess())) {
            console.log('Skipping update processing based on context validation');
            return new Response('ok');
          }

          // Run middleware
          for (const middleware of this.middleware) {
            const result = await middleware(ctx);
            if (result instanceof Response) {
              return result;
            }
          }

          const command = this.determineCommand(ctx, ctx.args);
          const response = await this.commands[command](ctx);

          return response instanceof Response ? response : new Response('ok');
        } catch (error) {
          console.error('Error handling Telegram update:', error);
          return new Response('Error processing request', { status: 500 });
        }
      }

      case 'GET': {
        const command = url.searchParams.get('command');
        if (command === 'set' || url.pathname.endsWith('/setWebhook')) {
          return this.webhook.set();
        }
        return new Response('Invalid command', { status: 400 });
      }

      default:
        return new Response('Method not allowed', { status: 405 });
    }
  }
}
