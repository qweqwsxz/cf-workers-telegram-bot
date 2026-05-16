import { Update as TelegramUpdate, InlineQueryResult as TelegramInlineQueryResult, ParseMode } from '@grammyjs/types';
import TelegramApi, {
	TelegramApiBaseParams,
	SendMessageParams,
	SendPhotoParams,
	SendVideoParams,
	SendVoiceParams,
	SendChatActionParams,
	SendInvoiceParams,
	SendMessageDraftParams,
} from './telegram_api.js';
import TelegramBot from './telegram_bot.js';

/** Class representing the context of execution */
export default class TelegramExecutionContext {
	/** Cache for business connection owners */
	private static businessOwners = new Map<string, number>();
	/** Cache for dead business connections */
	private static poisonedConnections = new Set<string>();

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
		return this.update.message?.from?.id ?? this.update.business_message?.from?.id ?? this.update.guest_message?.from?.id;
	}

	/**
	 * Check if the message sender is a bot
	 * @returns True if the sender is a bot
	 */
	get isBot(): boolean {
		return (
			this.update.message?.from?.is_bot ?? this.update.business_message?.from?.is_bot ?? this.update.guest_message?.from?.is_bot ?? false
		);
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
				return (
					(this.update.message?.text ?? this.update.business_message?.text ?? this.update.guest_message?.text)?.toString().split(' ') ?? []
				);
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

	/**
	 * Determine if the current update should be processed.
	 * For business messages, this checks if the connection is valid and has reply permissions.
	 */
	public async shouldProcess(): Promise<boolean> {
		if (this.update_type !== 'business_message') {
			return true;
		}

		const connectionId = this.update.business_message?.business_connection_id?.toString();
		if (!connectionId) {
			return true;
		}

		if (TelegramExecutionContext.poisonedConnections.has(connectionId)) {
			return false;
		}

		let ownerId = TelegramExecutionContext.businessOwners.get(connectionId);
		if (ownerId === undefined) {
			try {
				const response = await this.api.getBusinessConnection(this.bot.api.toString(), connectionId);
				if (response.status === 200) {
					const json = (await response.json()) as {
						ok: boolean;
						result: { user: { id: number }; user_chat_id: number; can_reply: boolean };
					};
					if (json.ok && json.result) {
						ownerId = json.result.user?.id || json.result.user_chat_id;
						if (ownerId) {
							TelegramExecutionContext.businessOwners.set(connectionId, ownerId);
						}
						if (json.result.can_reply === false) {
							console.warn('Business connection ' + connectionId + ' lacks reply permissions, poisoning connection');
							TelegramExecutionContext.poisonedConnections.add(connectionId);
							return false;
						}
					}
				}
			} catch (e) {
				if (e instanceof Error && e.message === 'BUSINESS_CONNECTION_INVALID') {
					console.warn('Business connection ' + connectionId + ' is invalid, poisoning connection');
					TelegramExecutionContext.poisonedConnections.add(connectionId);
					return false;
				}
				console.warn('Failed to fetch business connection info:', e);
			}
		}

		return true;
	}

	private determineUpdateType(): string {
		if (this.update.message?.photo) {
			return 'photo';
		} else if (this.update.message?.voice) {
			return 'voice';
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
		} else if (this.update.business_connection) {
			return 'business_connection';
		}
		return '';
	}

	/**
	 * Get the chat ID from the current update
	 * @returns The chat ID as a string or empty string if not available
	 */
	private getChatId(): string {
		if (this.update.message?.chat?.id) {
			return this.update.message.chat.id.toString();
		} else if (this.update.business_message?.chat?.id) {
			return this.update.business_message.chat.id.toString();
		} else if (this.update.guest_message?.chat?.id) {
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
		} else if (this.update.business_message?.message_id) {
			return this.update.business_message.message_id.toString();
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
		return this.update.message?.message_thread_id ?? this.update.business_message?.message_thread_id;
	}

	/**
	 * Reply to the last message with a video
	 * @param video - string to a video on the internet or a file_id on telegram
	 * @param options - any additional options to pass to sendVideo
	 * @returns Promise with the API response
	 */

	/**
	 * Helper to handle business connection fallbacks
	 */
	private async withBusinessFallback<T extends Partial<TelegramApiBaseParams>>(
		params: T,
		apiMethod: (botApi: string, data: T) => Promise<Response>,
	): Promise<Response | null> {
		const connectionId = params.business_connection_id?.toString();

		if (connectionId) {
			if (TelegramExecutionContext.poisonedConnections.has(connectionId)) {
				return null;
			}

			let ownerId = TelegramExecutionContext.businessOwners.get(connectionId);
			if (ownerId === undefined) {
				try {
					const response = await this.api.getBusinessConnection(this.bot.api.toString(), connectionId);
					if (response.status === 200) {
						const json = (await response.json()) as {
							ok: boolean;
							result: { user: { id: number }; user_chat_id: number; can_reply: boolean };
						};
						if (json.ok && json.result) {
							ownerId = json.result.user?.id || json.result.user_chat_id;
							if (ownerId) {
								TelegramExecutionContext.businessOwners.set(connectionId, ownerId);
							}
							if (json.result.can_reply === false) {
								TelegramExecutionContext.poisonedConnections.add(connectionId);
								return null;
							}
						}
					}
				} catch (e) {
					if (e instanceof Error && e.message === 'BUSINESS_CONNECTION_INVALID') {
						TelegramExecutionContext.poisonedConnections.add(connectionId);
						return null;
					}
				}
			}

			if (ownerId !== undefined && params.chat_id?.toString() === ownerId.toString()) {
				return null;
			}
		}

		try {
			return await apiMethod(this.bot.api.toString(), params);
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === 'BUSINESS_CONNECTION_INVALID') {
					if (connectionId) {
						TelegramExecutionContext.poisonedConnections.add(connectionId);
					}
					return null;
				}
				if (e.message === 'PEER_ID_INVALID') {
					return null;
				}
			}
			throw e;
		}
	}

	async replyVideo(video: string, options: Partial<SendVideoParams> = {}) {
		const params: SendVideoParams = {
			...options,
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			reply_to_message_id: this.getMessageId(),
			video,
		};

		if (this.update_type === 'business_message') {
			params['business_connection_id'] = this.update.business_message?.business_connection_id;
			return await this.withBusinessFallback(params, (api, data) => this.api.sendVideo(api, data));
		}

		if (this.update_type === 'guest_message') {
			return await this.answerGuestQueryVideo(video);
		}

		if (this.update_type === 'inline') {
			return await this.api.answerInline(this.bot.api.toString(), {
				...options,
				inline_query_id: this.update.inline_query?.id.toString() ?? '',
				results: [
					{ type: 'video', id: crypto.randomUUID(), video_url: video, mime_type: 'video/mp4', thumbnail_url: video, title: 'Video' },
				],
			});
		}

		return await this.api.sendVideo(this.bot.api.toString(), params);
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
	async replyPhoto(photo: string, caption = '', options: Partial<SendPhotoParams> = {}) {
		const params: SendPhotoParams = {
			...options,
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			reply_to_message_id: this.getMessageId(),
			photo,
			caption,
		};

		if (this.update_type === 'business_message') {
			params['business_connection_id'] = this.update.business_message?.business_connection_id;
			return await this.withBusinessFallback(params, (api, data) => this.api.sendPhoto(api, data));
		}

		if (this.update_type === 'guest_message') {
			return await this.answerGuestQueryPhoto(photo, caption);
		}

		if (this.update_type === 'inline') {
			return await this.api.answerInline(this.bot.api.toString(), {
				inline_query_id: this.update.inline_query?.id.toString() ?? '',
				results: [{ type: 'photo', id: crypto.randomUUID(), photo_url: photo, thumbnail_url: photo }],
			});
		}

		return await this.api.sendPhoto(this.bot.api.toString(), params);
	}

	/**
	 * Reply to the last message with a voice message
	 * @param voice - url or file_id to voice
	 * @param caption - voice caption
	 * @param options - any additional options to pass to sendVoice
	 * @returns Promise with the API response
	 */
	async replyVoice(voice: string, caption = '', options: Partial<SendVoiceParams> = {}) {
		const params: SendVoiceParams = {
			...options,
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			reply_to_message_id: this.getMessageId(),
			voice,
			caption,
		};

		if (this.update_type === 'business_message') {
			params['business_connection_id'] = this.update.business_message?.business_connection_id;
			return await this.withBusinessFallback(params, (api, data) => this.api.sendVoice(api, data));
		}

		if (this.update_type === 'guest_message') {
			return await this.answerGuestQueryVoice(voice, caption);
		}

		return await this.api.sendVoice(this.bot.api.toString(), params);
	}

	/**
	 * Send typing in a chat
	 * @returns Promise with the API response
	 */
	async sendTyping() {
		if (this.update_type === 'guest_message') {
			return null;
		}

		const params: SendChatActionParams = {
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			action: 'typing',
		};

		if (this.update_type === 'business_message') {
			params['business_connection_id'] = this.update.business_message?.business_connection_id;
			return await this.withBusinessFallback(params, (api, data) => this.api.sendChatAction(api, data));
		}

		return await this.api.sendChatAction(this.bot.api.toString(), params);
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
				results: [
					{
						type: 'article',
						id: crypto.randomUUID(),
						title: title ?? '',
						input_message_content: { message_text: message, parse_mode: parse_mode as ParseMode },
					},
				],
			});
		}
		return null;
	}

	/**
	 * Answer a guest query
	 * @param result - the result to reply with
	 * @returns Promise with the API response
	 */
	async answerGuestQuery(result: TelegramInlineQueryResult) {
		return await this.api.answerGuestQuery(this.bot.api.toString(), {
			guest_query_id: this.update.guest_message?.guest_query_id ?? '',
			result,
		});
	}

	/**
	 * Answer a guest query with text
	 * @param message - text to reply with
	 * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
	 * @returns Promise with the API response
	 */
	async answerGuestQueryText(message: string, parse_mode = '') {
		return await this.answerGuestQuery({
			type: 'article',
			id: crypto.randomUUID(),
			title: 'Response',
			input_message_content: { message_text: message, parse_mode: parse_mode as ParseMode },
		});
	}

	/**
	 * Answer a guest query with a photo
	 * @param photo - url or file_id to photo
	 * @param caption - photo caption
	 * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
	 * @returns Promise with the API response
	 */
	async answerGuestQueryPhoto(photo: string, caption = '', parse_mode = '') {
		return await this.answerGuestQuery({
			type: 'photo',
			id: crypto.randomUUID(),
			photo_url: photo,
			thumbnail_url: photo,
			caption,
			parse_mode: parse_mode as ParseMode,
		});
	}

	/**
	 * Answer a guest query with a video
	 * @param video - url or file_id to video
	 * @param caption - video caption
	 * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
	 * @returns Promise with the API response
	 */
	async answerGuestQueryVideo(video: string, caption = '', parse_mode = '') {
		return await this.answerGuestQuery({
			type: 'video',
			id: crypto.randomUUID(),
			video_url: video,
			mime_type: 'video/mp4',
			thumbnail_url: video,
			title: 'Video',
			caption,
			parse_mode: parse_mode as ParseMode,
		});
	}

	/**
	 * Answer a guest query with a voice message
	 * @param voice - url or file_id to voice
	 * @param caption - voice caption
	 * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
	 * @returns Promise with the API response
	 */
	async answerGuestQueryVoice(voice: string, caption = '', parse_mode = '') {
		return await this.answerGuestQuery({
			type: 'voice',
			id: crypto.randomUUID(),
			voice_url: voice,
			title: 'Voice',
			caption,
			parse_mode: parse_mode as ParseMode,
		});
	}

	/** Map of draft IDs to message IDs for streaming */
	private drafts = new Map<number, number>();

	/**
	 * Reply to the last message with a stream of text
	 * @param message - text to reply with
	 * @param draft_id - unique ID for this stream
	 * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
	 * @param options - any additional options to pass to sendMessage/editMessageText
	 * @returns Promise with the API response
	 */
	async streamReply(message: string, draft_id: number, parse_mode = '', options: Partial<SendMessageDraftParams> = {}, finish = false) {
		if (this.update_type === 'guest_message') {
			if (finish) {
				return await this.answerGuestQueryText(message, parse_mode);
			}
			return null;
		}

		if (finish) {
			return await this.reply(message, parse_mode, true, options as unknown as Partial<SendMessageParams>);
		}

		const params: SendMessageDraftParams = {
			...(options as SendMessageDraftParams),
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			text: message,
			parse_mode,
			draft_id,
		};

		if (this.update_type === 'business_message') {
			params.business_connection_id = this.update.business_message?.business_connection_id;
		}

		return await this.withBusinessFallback(params, (api, data) => this.api.sendMessageDraft(api, data));
	}

	async reply(message: string, parse_mode = '', reply = true, options: Partial<SendMessageParams> = {}) {
		if (this.update_type === 'guest_message') {
			return await this.answerGuestQueryText(message, parse_mode);
		}

		if (this.update_type === 'inline') {
			return await this.replyInline('Response', message, parse_mode);
		}

		const params: SendMessageParams = {
			...options,
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			text: message,
			parse_mode,
		};

		if (reply) {
			params.reply_to_message_id = this.getMessageId();
		}

		if (this.update_type === 'business_message') {
			params['business_connection_id'] = this.update.business_message?.business_connection_id;
			return await this.withBusinessFallback(params, (api, data) => this.api.sendMessage(api, data));
		}

		if (this.update_type === 'callback') {
			if (this.update.callback_query?.message?.chat.id) {
				params['chat_id'] = this.update.callback_query.message.chat.id.toString();
			}
		}

		return await this.api.sendMessage(this.bot.api.toString(), params);
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
		const params: SendInvoiceParams = {
			chat_id: this.getChatId(),
			message_thread_id: this.getThreadId(),
			title,
			description,
			payload,
			provider_token: '',
			currency: 'XTR',
			prices: [{ label: title, amount }],
		};

		if (this.update_type === 'business_message') {
			params['business_connection_id'] = this.update.business_message?.business_connection_id;
			return await this.withBusinessFallback(params, (api, data) => this.api.sendInvoice(api, data));
		}

		return await this.api.sendInvoice(this.bot.api.toString(), params);
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
