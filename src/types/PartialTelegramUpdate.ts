import { Message as TelegramBusinessMessage } from '@grammyjs/types';
import { InlineQuery as TelegramInlineQuery } from '@grammyjs/types';
import { Message as TelegramMessage } from '@grammyjs/types';
import TelegramGuestMessage from './TelegramGuestMessage.js';
import { PreCheckoutQuery as TelegramPreCheckoutQuery } from '@grammyjs/types';
import { CallbackQuery as TelegramCallbackQuery } from '@grammyjs/types';
import { BusinessConnection as TelegramBusinessConnection } from '@grammyjs/types';

interface PartialTelegramUpdate {
	update_id?: number;
	message?: TelegramMessage;
	edited_message?: TelegramMessage;
	channel_post?: TelegramMessage;
	edited_channel_post?: TelegramMessage;
	inline_query?: TelegramInlineQuery;
	business_message?: TelegramBusinessMessage;
	guest_message?: TelegramGuestMessage;
	pre_checkout_query?: TelegramPreCheckoutQuery;
	callback_query?: TelegramCallbackQuery;
	business_connection?: TelegramBusinessConnection;
}
export default PartialTelegramUpdate;
