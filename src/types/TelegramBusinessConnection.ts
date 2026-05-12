import TelegramUser from './TelegramUser.js';

interface TelegramBusinessConnection {
	id: string;
	user: TelegramUser;
	user_chat_id: number;
	date: number;
	can_reply: boolean;
	is_enabled: boolean;
}

export default TelegramBusinessConnection;
