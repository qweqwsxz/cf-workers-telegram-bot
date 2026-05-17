/**
 * Webhook class for managing Telegram bot webhook configuration.
 * Handles setting up and configuring webhooks for Telegram bots.
 */
export default class Webhook {
	/** Base URL for the Telegram Bot API */
	private readonly api: URL;

	/** Webhook URL that Telegram will send updates to */
	private readonly webhook: URL;

	/** Secret token to be sent in the X-Telegram-Bot-Api-Secret-Token header */
	private readonly secretToken?: string;

	/**
	 * Creates a new Webhook instance.
	 *
	 * @param token - The Telegram bot token
	 * @param request - The incoming request object used to determine the webhook URL
	 * @param secretToken - Optional secret token for webhook verification
	 */
	constructor(token: string, request: Request, secretToken?: string) {
		this.api = new URL(`https://api.telegram.org/bot${token}`);
		this.webhook = new URL(`${new URL(request.url).origin}/${token}`);
		this.secretToken = secretToken;
	}

	/**
	 * Sets the webhook URL for the Telegram bot.
	 *
	 * @returns Promise that resolves to the fetch response from Telegram
	 * @throws Will throw an error if the fetch request fails
	 */
	async set(): Promise<Response> {
		const baseUrl = this.api.toString();
		const url = new URL(`${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}setWebhook`);

		// Configure webhook parameters
		const params: Record<string, string> = {
			url: this.webhook.toString(),
			max_connections: '40',
			allowed_updates: JSON.stringify([
				'message',
				'edited_message',
				'callback_query',
				'inline_query',
				'guest_message',
				'business_message',
				'business_connection',
				'pre_checkout_query',
			]),
			drop_pending_updates: 'true',
		};

		if (this.secretToken) {
			params.secret_token = this.secretToken;
		}

		const searchParams = new URLSearchParams(params);

		try {
			const response = await fetch(`${url.toString()}?${searchParams.toString()}`);
			if (response.status !== 200) {
				throw new Error(`Telegram API error (setWebhook): ${String(response.status)} ${response.statusText}`);
			}
			const cloned = response.clone();
			try {
				const json = await cloned.json();
				console.log({
					method: 'setWebhook',
					params: params,
					response: json,
				});
			} catch (e) {
				console.error(`Error logging response for setWebhook: ${e instanceof Error ? e.message : String(e)}`);
			}
			return response;
		} catch (error) {
			console.error('Failed to set webhook:', error);
			throw error;
		}
	}

	/**
	 * Removes the webhook configuration from Telegram.
	 *
	 * @returns Promise that resolves to the fetch response from Telegram
	 * @throws Will throw an error if the fetch request fails
	 */
	async delete(): Promise<Response> {
		const baseUrl = this.api.toString();
		const url = new URL(`${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}deleteWebhook`);

		try {
			const response = await fetch(url.toString());
			if (response.status !== 200) {
				throw new Error(`Telegram API error (deleteWebhook): ${String(response.status)} ${response.statusText}`);
			}
			const cloned = response.clone();
			try {
				const json = await cloned.json();
				console.log({
					method: 'deleteWebhook',
					response: json,
				});
			} catch (e) {
				console.error(`Error logging response for deleteWebhook: ${e instanceof Error ? e.message : String(e)}`);
			}
			return response;
		} catch (error) {
			console.error('Failed to delete webhook:', error);
			throw error;
		}
	}
}
