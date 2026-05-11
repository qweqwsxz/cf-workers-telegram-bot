import TelegramUser from './TelegramUser.js';

interface TelegramPreCheckoutQuery {
	id: string;
	from: TelegramUser;
	currency: string;
	total_amount: number;
	invoice_payload: string;
	shipping_option_id?: string;
	order_info?: {
		name?: string;
		phone_number?: string;
		email?: string;
		shipping_address?: {
			country_code: string;
			state: string;
			city: string;
			street_line1: string;
			street_line2: string;
			post_code: string;
		};
	};
}

export default TelegramPreCheckoutQuery;
