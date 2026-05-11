import TelegramMessage from "./TelegramMessage.js";

export default interface TelegramGuestMessage extends TelegramMessage {
  guest_query_id: string;
}
