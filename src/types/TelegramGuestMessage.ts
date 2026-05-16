import { Message as TelegramMessage } from '@grammyjs/types';

export default interface TelegramGuestMessage extends TelegramMessage {
	guest_query_id: string;
}
