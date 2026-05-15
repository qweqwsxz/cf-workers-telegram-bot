import { InlineQueryResult as TelegramInlineQueryResult } from '@grammyjs/types';


/** Interface for common Telegram API parameters */
export interface TelegramApiBaseParams {
  chat_id: number | string;
  message_thread_id?: number;
  business_connection_id?: string | number;
}

/** Interface for message parameters */
export interface SendMessageParams extends TelegramApiBaseParams {
  text: string;
  parse_mode: string;
  reply_to_message_id?: number | string;
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Interface for message draft parameters */
export interface SendMessageDraftParams extends SendMessageParams {
  draft_id: number;
}

/** Interface for photo parameters */
export interface SendPhotoParams extends TelegramApiBaseParams {
  photo: string;
  caption?: string;
  parse_mode?: string;
  reply_to_message_id?: number | string;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Interface for video parameters */
export interface SendVideoParams extends TelegramApiBaseParams {
  video: string;
  caption?: string;
  parse_mode?: string;
  reply_to_message_id?: number | string;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Interface for chat action parameters */
export interface SendChatActionParams extends TelegramApiBaseParams {
  action: string;
}

/** Interface for callback query parameters */
export interface AnswerCallbackParams {
  callback_query_id: number | string;
  text?: string;
  show_alert?: boolean;
  url?: string;
  cache_time?: number;
}

/** Interface for inline query parameters */
export interface AnswerInlineParams {
  inline_query_id: number | string;
  results: TelegramInlineQueryResult[];
  cache_time?: number;
  is_personal?: boolean;
  next_offset?: string;
}

/** Interface for guest query parameters */
export interface AnswerGuestParams {
  guest_query_id: string;
  result: TelegramInlineQueryResult;
}

/** Interface for invoice parameters */
export interface SendInvoiceParams extends TelegramApiBaseParams {
  title: string;
  description: string;
  payload: string;
  provider_token: string;
  currency: string;
  prices: { label: string; amount: number }[];
}

/** Interface for pre-checkout query parameters */
export interface AnswerPreCheckoutParams {
  pre_checkout_query_id: string;
  ok: boolean;
  error_message?: string;
}

/** Interface for voice parameters */
export interface SendVoiceParams extends TelegramApiBaseParams {
  voice: string;
  caption?: string;
  parse_mode?: string;
  duration?: number;
  reply_to_message_id?: number | string;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Type for all possible API parameters */
export type TelegramApiParams =
  | SendMessageParams
  | SendPhotoParams
  | SendVideoParams
  | SendVoiceParams
  | SendChatActionParams
  | AnswerCallbackParams
  | AnswerInlineParams
  | AnswerGuestParams
  | SendInvoiceParams
  | AnswerPreCheckoutParams
  | Record<string, unknown>;

/** Class representing the Telegram API and all its methods */
export default class TelegramApi {
  /**
   * Get the API URL for a given bot API and slug
   * @param botApi - full URL to the telegram API without slug
   * @param slug - slug to append to the API URL
   * @param data - data to append to the request
   * @returns Request object with the full URL and parameters
   */
  getApiUrl(botApi: string, slug: string, data: TelegramApiParams): Request {
    const request = new URL(botApi + (slug.startsWith('/') || botApi.endsWith('/') ? '' : '/') + slug);
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        params.append(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));
      }
    }

    return new Request(`${request.toString()}?${params.toString()}`);
  }

  /**
   * Fetch a URL and log the response
   * @param url - the URL to fetch
   * @param slug - the API method name
   * @param data - the data sent to the API
   * @returns Promise with the API response
   */
  private async fetchAndLog(url: Request, slug: string, data: TelegramApiParams): Promise<Response> {
    const response = await fetch(url);
    if (response.status !== 200) {
      const cloned = response.clone();
      let errorDescription = '';
      try {
        const json = (await cloned.json()) as { description?: string };
        errorDescription = json.description || '';
      } catch {
        // ignore
      }

      if (errorDescription.includes('BUSINESS_CONNECTION_INVALID') || errorDescription.includes('BUSINESS_PEER_INVALID')) {
        console.warn(`Telegram API business error: ${errorDescription}`);
        throw new Error('BUSINESS_CONNECTION_INVALID');
      }

      if (errorDescription.includes('PEER_ID_INVALID')) {
        console.warn(`Telegram API peer error: ${errorDescription}`);
        throw new Error('PEER_ID_INVALID');
      }

      throw new Error(`Telegram API error: ${String(response.status)} ${response.statusText}${errorDescription ? ': ' + errorDescription : ''}`);
    }
    const cloned = response.clone();
    try {
      const json = await cloned.json();
      console.log({
        method: slug,
        params: data,
        response: json,
      });
    } catch (e) {
      console.error(`Error logging response for ${slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return response;
  }

  /**
   * Send a chat action to indicate the bot is doing something
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendChatAction(botApi: string, data: SendChatActionParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendChatAction', data);
    return await this.fetchAndLog(url, 'sendChatAction', data);
  }

  /**
   * Get a file with a given file_id
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @param token - bot token
   * @returns Promise with the file response
   */
  async getFile(botApi: string, data: { file_id: string } & Record<string, number | string | boolean>, token: string): Promise<Response> {
    if (!data.file_id || data.file_id === '') {
      throw new Error('No file_id provided');
    }

    const url = this.getApiUrl(botApi, 'getFile', data);
    const response = await this.fetchAndLog(url, 'getFile', data);

    const json: { ok: boolean; result?: { file_path: string }; description?: string } = await response.json();

    if (!json.ok || !json.result?.file_path) {
      throw new Error(json.description ?? 'Failed to get file path');
    }

    const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${json.result.file_path}`);
    if (fileResponse.status !== 200) {
      throw new Error(`Telegram File API error: ${String(fileResponse.status)} ${fileResponse.statusText}`);
    }
    return fileResponse;
  }

  /**
   * Send a message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendMessage(botApi: string, data: SendMessageParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendMessage', data);
    return await this.fetchAndLog(url, 'sendMessage', data);
  }

  /**
   * Send a video message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendVideo(botApi: string, data: SendVideoParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendVideo', data);
    return await this.fetchAndLog(url, 'sendVideo', data);
  }

  /**
   * Send a photo message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendPhoto(botApi: string, data: SendPhotoParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendPhoto', data);
    return await this.fetchAndLog(url, 'sendPhoto', data);
  }

  /**
   * Send a voice message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendVoice(botApi: string, data: SendVoiceParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendVoice', data);
    return await this.fetchAndLog(url, 'sendVoice', data);
  }

  /**
   * Send an inline response to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async answerInline(botApi: string, data: AnswerInlineParams): Promise<Response> {
    const params = {
      inline_query_id: data.inline_query_id,
      results: data.results,
      cache_time: data.cache_time,
      is_personal: data.is_personal,
      next_offset: data.next_offset,
    };
    const url = this.getApiUrl(botApi, 'answerInlineQuery', params);
    return await this.fetchAndLog(url, 'answerInlineQuery', params);
  }

  /**
   * Send a callback response to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async answerCallback(botApi: string, data: AnswerCallbackParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'answerCallbackQuery', data);
    return await this.fetchAndLog(url, 'answerCallbackQuery', data);
  }

  /**
   * Send a guest response to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async answerGuestQuery(botApi: string, data: AnswerGuestParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'answerGuestQuery', data);
    return await this.fetchAndLog(url, 'answerGuestQuery', data);
  }

  /**
   * Delete a message
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async deleteMessage(botApi: string, data: { chat_id: number | string; message_id: number }): Promise<Response> {
    const url = this.getApiUrl(botApi, 'deleteMessage', data);
    return await this.fetchAndLog(url, 'deleteMessage', data);
  }

  /**
   * Edit a message text
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async editMessageText(
    botApi: string,
    data: {
      chat_id?: number | string;
      message_id?: number;
      inline_message_id?: string;
      text: string;
      parse_mode?: string;
      disable_web_page_preview?: boolean;
      reply_markup?: object;
      business_connection_id?: string | number;
    },
  ): Promise<Response> {
    const url = this.getApiUrl(botApi, 'editMessageText', data);
    return await this.fetchAndLog(url, 'editMessageText', data);
  }

  async sendMessageDraft(
    botApi: string,
    data: SendMessageDraftParams,
  ): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendMessageDraft', data);
    return await this.fetchAndLog(url, 'sendMessageDraft', data);
  }

  /**
   * Send an invoice to a user
   * @param botApi - full URL to the telegram API without slug
   * @param data - invoice parameters
   * @returns Promise with the API response
   */
  async sendInvoice(botApi: string, data: SendInvoiceParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendInvoice', data);
    return await this.fetchAndLog(url, 'sendInvoice', data);
  }

  /**
   * Answer a pre-checkout query
   * @param botApi - full URL to the telegram API without slug
   * @param data - pre-checkout parameters
   * @returns Promise with the API response
   */
  async answerPreCheckoutQuery(botApi: string, data: AnswerPreCheckoutParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'answerPreCheckoutQuery', data);
    return await this.fetchAndLog(url, 'answerPreCheckoutQuery', data);
  }

  /**
   * Get basic information about the bot
   * @param botApi - full URL to the telegram API without slug
   * @returns Promise with the API response
   */
  async getMe(botApi: string): Promise<Response> {
    const url = this.getApiUrl(botApi, 'getMe', {});
    return await this.fetchAndLog(url, 'getMe', {});
  }
}
