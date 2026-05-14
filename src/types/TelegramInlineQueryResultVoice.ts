import TelegramInlineQueryResult from './TelegramInlineQueryResult.js';

export default class TelegramInlineQueryResultVoice extends TelegramInlineQueryResult {
	voice_url: string;
	title: string;
	caption?: string;
	parse_mode?: string;
	constructor(data: { voice: string; title?: string; caption?: string; parse_mode?: string }) {
		super('voice');
		this.voice_url = data.voice;
		this.title = data.title ?? 'Voice';
		this.caption = data.caption;
		this.parse_mode = data.parse_mode;
	}
}
