interface TelegramSuccessfulPayment {
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
	telegram_payment_charge_id: string;
	provider_payment_charge_id: string;
}

export default TelegramSuccessfulPayment;
