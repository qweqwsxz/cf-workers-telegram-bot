import TelegramBusinessMessage from './TelegramBusinessMessage.js';
import TelegramInlineQuery from './TelegramInlineQuery.js';
import TelegramMessage from './TelegramMessage.js';
import TelegramGuestMessage from './TelegramGuestMessage.js';
import TelegramPreCheckoutQuery from './TelegramPreCheckoutQuery.js';
import TelegramCallbackQuery from './TelegramCallbackQuery.js';

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
}
export default PartialTelegramUpdate;
