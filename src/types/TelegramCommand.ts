import TelegramBot from '../telegram_bot.js';
import { Update as TelegramUpdate } from '@grammyjs/types';

type TelegramCommand = (bot: TelegramBot, update: TelegramUpdate, args: string[]) => Promise<Response>;
export default TelegramCommand;
