import TelegramApi from './telegram_api.js';
import TelegramBot from './telegram_bot.js';
import TelegramInlineQueryResultArticle from './types/TelegramInlineQueryResultArticle.js';
import TelegramInlineQueryResultPhoto from './types/TelegramInlineQueryResultPhoto.js';
import TelegramUpdate from './types/TelegramUpdate.js';
import TelegramInlineQueryResultVideo from './types/TelegramInlineQueryResultVideo.js';

/** Class representing the context of execution */
export default class TelegramExecutionContext {
  /** an instance of the telegram bot */
  bot: TelegramBot;
  /** an instance of the telegram update */
  update: TelegramUpdate;
  /** string representing the type of update that was sent */
  update_type = '';
  /** reference to TelegramApi class */
  api = new TelegramApi();
  /** array of arguments parsed from the message */
  args: string[] = [];

  /**
   * Create a telegram execution context
   * @param bot - the telegram bot
   * @param update - the telegram update
   */
  constructor(bot: TelegramBot, update: TelegramUpdate) {
    this.bot = bot;
    this.update = update;

    this.update_type = this.determineUpdateType();
    this.args = this.parseArguments();
  }

  /**
   * Get the message text from the current update
   * @returns The message text as a string or empty string if not available
   */
  get text(): string {
    return (this.update.message?.text ?? this.update.business_message?.text ?? this.update.guest_message?.text)?.toString() ?? '';
  }

  /**
   * Get the chat ID as a string
   * @returns The chat ID
   */
  get chatId(): string {
    return this.getChatId();
  }

  /**
   * Get the user ID from the current update
   * @returns The user ID or undefined if not available
   */
  get userId(): number | undefined {
    return this.update.message?.from.id ?? this.update.business_message?.from.id ?? this.update.guest_message?.from.id;
  }

  /**
   * Parse arguments from the update
   * @returns array of argument strings
   */
  private parseArguments(): string[] {
    switch (this.update_type) {
      case 'message':
      case 'business_message':
      case 'guest_message':
        return (this.update.message?.text ?? this.update.guest_message?.text)?.split(' ') ?? [];
      case 'inline':
        return this.update.inline_query?.query.split(' ') ?? [];
      default:
        return [];
    }
  }

  /**
   * Determine the type of update received
   * @returns The update type as a string
   */
  private determineUpdateType(): string {
    if (this.update.message?.photo) {
      return 'photo';
    } else if (this.update.message?.text) {
      return 'message';
    } else if (this.update.inline_query?.query) {
      return 'inline';
    } else if (this.update.message?.document) {
      return 'document';
    } else if (this.update.callback_query?.id) {
      return 'callback';
    } else if (this.update.business_message) {
      return 'business_message';
    } else if (this.update.guest_message) {
      return 'guest_message';
    } else if (this.update.pre_checkout_query) {
      return 'pre_checkout_query';
    } else if (this.update.message?.successful_payment) {
      return 'successful_payment';
    }
    return '';
  }

  /**
   * Get the chat ID from the current update
   * @returns The chat ID as a string or empty string if not available
   */
  private getChatId(): string {
    if (this.update.message?.chat.id) {
      return this.update.message.chat.id.toString();
    } else if (this.update.business_message?.chat.id) {
      return this.update.business_message.chat.id.toString();
    } else if (this.update.guest_message?.chat.id) {
      return this.update.guest_message.chat.id.toString();
    }
    return '';
  }

  /**
   * Get the message ID from the current update
   * @returns The message ID as a string or empty string if not available
   */
  private getMessageId(): string {
    if (this.update.message?.message_id) {
      return this.update.message.message_id.toString();
    } else if (this.update.guest_message?.message_id) {
      return this.update.guest_message.message_id.toString();
    }
    return '';
  }

  /**
   * Get the message thread ID from the current update
   * @returns The message thread ID as a number or undefined
   */
  private getThreadId(): number | undefined {
    return this.update.message?.message_thread_id;
  }

  /**
   * Reply to the last message with a video
   * @param video - string to a video on the internet or a file_id on telegram
   * @param options - any additional options to pass to sendVideo
   * @returns Promise with the API response
   */
  async replyVideo(video: string, options: Record<string, number | string | boolean> = {}) {
    switch (this.update_type) {
      case 'message':
      case 'guest_message':
        return await this.api.sendVideo(this.bot.api.toString(), {
          ...options,
           chat_id: this.getChatId(),
           message_thread_id: this.getThreadId(),
           reply_to_message_id: this.getMessageId(),
           video,
         });
      case 'inline':
        return await this.api.answerInline(this.bot.api.toString(), {
          ...options,
          inline_query_id: this.update.inline_query?.id.toString() ?? '',
          results: [new TelegramInlineQueryResultVideo(video)],
        });

      default:
        return null;
    }
  }

  /**
   * Get File from telegram file_id
   * @param file_id - telegram file_id
   * @returns Promise with the file response
   */
  async getFile(file_id: string) {
    return await this.api.getFile(this.bot.api.toString(), { file_id }, this.bot.token);
  }

  /**
   * Reply to the last message with a photo
   * @param photo - url or file_id to photo
   * @param caption - photo caption
   * @param options - any additional options to pass to sendPhoto
   * @returns Promise with the API response
   */
  async replyPhoto(photo: string, caption = '', options: Record<string, number | string | boolean> = {}) {
    switch (this.update_type) {
      case 'photo':
      case 'message':
      case 'guest_message':
        return await this.api.sendPhoto(this.bot.api.toString(), {
          ...options,
           chat_id: this.getChatId(),
           message_thread_id: this.getThreadId(),
           reply_to_message_id: this.getMessageId(),
           photo,
           caption,
         });
      case 'inline':
        return await this.api.answerInline(this.bot.api.toString(), {
          inline_query_id: this.update.inline_query?.id.toString() ?? '',
          results: [new TelegramInlineQueryResultPhoto(photo)],
        });

      default:
        return null;
    }
  }

  /**
   * Send typing in a chat
   * @returns Promise with the API response
   */
  async sendTyping() {
    switch (this.update_type) {
      case 'message':
      case 'photo':
      case 'document':
         return await this.api.sendChatAction(this.bot.api.toString(), {
           chat_id: this.getChatId(),
           message_thread_id: this.getThreadId(),
           action: 'typing',
         });
      case 'business_message':
        return await this.api.sendChatAction(this.bot.api.toString(), {
           business_connection_id: this.update.business_message?.business_connection_id.toString() ?? '',
           chat_id: this.getChatId(),
           message_thread_id: this.getThreadId(),
           action: 'typing',
         });
      default:
        return null;
    }
  }

  /**
   * Reply to an inline message with a title and content
   * @param title - title to reply with
   * @param message - message contents to reply with
   * @param parse_mode - parse mode to use
   * @returns Promise with the API response
   */
  async replyInline(title: string, message: string, parse_mode = '') {
    if (this.update_type === 'inline') {
      return await this.api.answerInline(this.bot.api.toString(), {
        inline_query_id: this.update.inline_query?.id.toString() ?? '',
        results: [new TelegramInlineQueryResultArticle({ content: message, title, parse_mode })],
      });
    }
    return null;
  }

  /**
   * Answer a guest query
   * @param message - text to reply with
   * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
   * @returns Promise with the API response
   */
  async answerGuestQuery(message: string, parse_mode = '') {
    return await this.api.answerGuestQuery(this.bot.api.toString(), {
      guest_query_id: this.update.guest_message?.guest_query_id ?? '',
      result: new TelegramInlineQueryResultArticle({ content: message, title: 'Response', parse_mode }),
    });
  }


  /**
   * Reply to the last message with a stream of text
   * @param message - text to reply with
   * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
   * @param options - any additional options to pass to sendMessage
   * @returns Promise with the API response
   */
  async streamReply(message: string, draft_id: number, parse_mode = '', options: Record<string, number | string | boolean> = {}) {
    return await this.api.sendMessageDraft(this.bot.api.toString(), {
      ...options,
       chat_id: this.getChatId(),
       message_thread_id: this.getThreadId(),
       text: message,
       parse_mode,
       draft_id,
     });
  }

  /**
   * Reply to the last message with text
   * @param message - text to reply with
   * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
   * @param options - any additional options to pass to sendMessage
   * @returns Promise with the API response
   */
  async reply(message: string, parse_mode = '', reply = true, options: Record<string, number | string | boolean> = {}) {
    switch (this.update_type) {
      case 'message':
      case 'photo':
      case 'document':
      case 'guest_message':
        if (this.update_type === 'guest_message') {
          return await this.answerGuestQuery(message, parse_mode);
        }
        if (reply) {
          return await this.api.sendMessage(this.bot.api.toString(), {
            ...options,
             chat_id: this.getChatId(),
             message_thread_id: this.getThreadId(),
             reply_to_message_id: this.getMessageId(),
             text: message,
             parse_mode,
           });
        }
         return await this.api.sendMessage(this.bot.api.toString(), {
           ...options,
           chat_id: this.getChatId(),
           message_thread_id: this.getThreadId(),
           text: message,
           parse_mode,
         });
      case 'business_message':
         return await this.api.sendMessage(this.bot.api.toString(), {
           chat_id: this.getChatId(),
           message_thread_id: this.getThreadId(),
           text: message,
           business_connection_id: this.update.business_message?.business_connection_id.toString() ?? '',
           parse_mode,
         });
      case 'callback':
        if (this.update.callback_query?.message.chat.id) {
          return await this.api.sendMessage(this.bot.api.toString(), {
            ...options,
             chat_id: this.update.callback_query.message.chat.id.toString(),
             message_thread_id: this.getThreadId(),
             text: message,
             parse_mode,
           });
        }
        return null;
      case 'inline':
        return await this.replyInline('Response', message, parse_mode);
      default:
        return null;
    }
  }

  /**
   * Send an invoice for Telegram Stars
   * @param title - product name
   * @param description - product description
   * @param payload - bot-defined invoice payload
   * @param amount - amount of stars
   * @returns Promise with the API response
   */
  async sendStarsInvoice(title: string, description: string, payload: string, amount: number) {
    return await this.api.sendInvoice(this.bot.api.toString(), {
       chat_id: this.getChatId(),
       message_thread_id: this.getThreadId(),
       title,
       description,
       payload,
       provider_token: '',
       currency: 'XTR',
       prices: [{ label: title, amount }],
     });
  }

  /**
   * Answer a pre-checkout query
   * @param ok - whether the payment can proceed
   * @param error_message - error message if not ok
   * @returns Promise with the API response
   */
  async answerPreCheckoutQuery(ok: boolean, error_message?: string) {
    return await this.api.answerPreCheckoutQuery(this.bot.api.toString(), {
      pre_checkout_query_id: this.update.pre_checkout_query?.id ?? '',
      ok,
      error_message,
    });
  }
}
