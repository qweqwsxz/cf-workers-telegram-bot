import TelegramInlineQueryResult from './TelegramInlineQueryResult.js';
import TelegramInputMessageContent from './TelegramInputMessageContent.js';

export default class TelegramInlineQueryResultVideo extends TelegramInlineQueryResult {
	video_url: string;
	mime_type: string;
	thumb_url: string;
	title: string;
	caption?: string;
	parse_mode?: string;
	video_width?: number;
	video_height?: number;
	video_duration?: number;
	description?: string;
	input_message_content?: TelegramInputMessageContent;
	constructor(data: { video: string; title?: string; caption?: string; parse_mode?: string }) {
		super('video');
		this.video_url = data.video;
		this.mime_type = 'video/mp4';
		this.thumb_url = data.video;
		this.title = data.title ?? 'Video';
		this.caption = data.caption;
		this.parse_mode = data.parse_mode;
	}
}
