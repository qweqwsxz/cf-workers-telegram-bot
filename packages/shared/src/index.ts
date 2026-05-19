import { marked } from 'marked';
import type { Sandbox } from '@cloudflare/sandbox';

/** Class representing a manager for conversation history stored in KV */
export class HistoryManager {
	constructor(private kv: KVNamespace) {}

	private getKey(userId: number | string, threadId?: number): string {
		return threadId ? `history:${String(userId)}:${String(threadId)}` : `history:${String(userId)}`;
	}

	/**
	 * Get the conversation history for a user
	 * @param userId - the telegram user ID
	 * @param threadId - optional thread ID
	 * @returns array of messages
	 */
	async getHistory(
		userId: number | string,
		threadId?: number
	): Promise<{ role: string; content: string }[]> {
		if (!this.kv) {
			return [];
		}
		const history = await this.kv.get<{ role: string; content: string }[]>(
			this.getKey(userId, threadId),
			'json'
		);
		return history ?? [];
	}

	/**
	 * Add a message and its response to the history
	 * @param userId - the telegram user ID
	 * @param prompt - the user message
	 * @param response - the bot response
	 * @param threadId - optional thread ID
	 */
	async addMessage(userId: number | string, prompt: string, response: string, threadId?: number) {
		if (!this.kv) {
			return;
		}
		const history = await this.getHistory(userId, threadId);
		history.push({ role: 'user', content: prompt });
		history.push({ role: 'assistant', content: response });
		const trimmedHistory = history.slice(-20);
		await this.kv.put(this.getKey(userId, threadId), JSON.stringify(trimmedHistory), {
			expirationTtl: 86400
		});
	}

	/**
	 * Clear the conversation history for a user
	 * @param userId - the telegram user ID
	 * @param threadId - optional thread ID
	 */
	async clearHistory(userId: number | string, threadId?: number) {
		if (!this.kv) {
			return;
		}
		await this.kv.delete(this.getKey(userId, threadId));
	}
}

/**
 * Get the balance for a user, initializing it if it doesn't exist
 * @param userId - the telegram user ID | string
 * @param kv - the KV namespace
 * @returns the user's balance
 */
export async function getBalance(userId: number | string, kv: KVNamespace): Promise<number> {
	const balanceKey = `balance:${String(userId)}`;
	const balance = await kv.get<number>(balanceKey, 'json');
	if (balance === null) {
		const defaultBalance = 200;
		await kv.put(balanceKey, JSON.stringify(defaultBalance));
		return defaultBalance;
	}
	return balance;
}

export async function markdownToHtml(s: string): Promise<string> {
	const renderer = new marked.Renderer();

	// Telegram supports: b, strong, i, em, u, ins, s, strike, del, span, tg-spoiler, a, code, pre, blockquote

	renderer.heading = ({ tokens, depth }) => {
		const text = renderer.parser.parseInline(tokens);
		if (depth === 1) {
			return `<b>${text}</b>\n\n`;
		}
		if (depth === 2) {
			return `<b>${text}</b>\n\n`;
		}
		return `<b>${text}</b>\n\n`;
	};

	renderer.paragraph = ({ tokens }) => {
		const text = renderer.parser.parseInline(tokens);
		return `${text}\n\n`;
	};

	renderer.br = () => '\n';

	renderer.list = ({ items, ordered, start }) => {
		let result = '';
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const prefix = ordered
				? `${start !== '' && start !== undefined ? Number(start) + i : i + 1}. `
				: '• ';
			result += `${prefix}${renderer.listitem(item)}\n`;
		}
		return result;
	};

	renderer.listitem = (item) => {
		return renderer.parser.parse(item.tokens).trim();
	};

	renderer.strong = ({ tokens }) => `<b>${renderer.parser.parseInline(tokens)}</b>`;
	renderer.em = ({ tokens }) => `<i>${renderer.parser.parseInline(tokens)}</i>`;
	const escapeHtml = (text: string) =>
		text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	renderer.codespan = ({ text }) => `<code>${escapeHtml(text)}</code>`;
	renderer.code = ({ text, lang }) => {
		const escapedText = escapeHtml(text);
		if (lang) {
			return `<pre><code class="language-${lang}">${escapedText}</code></pre>\n`;
		}
		return `<pre><code>${escapedText}</code></pre>\n`;
	};
	renderer.del = ({ tokens }) => `<s>${renderer.parser.parseInline(tokens)}</s>`;

	renderer.link = ({ href, tokens }) =>
		`<a href="${escapeHtml(href)}">${renderer.parser.parseInline(tokens)}</a>`;
	renderer.image = ({ href, text }) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;

	renderer.blockquote = ({ tokens }) => {
		return `<blockquote>${renderer.parser.parse(tokens)}</blockquote>\n`;
	};

	renderer.hr = () => `────────\n\n`;

	// html tag pass-through for supported tags or escaping
	renderer.html = ({ text }) => {
		const allowedTags = [
			'b',
			'strong',
			'i',
			'em',
			'u',
			'ins',
			's',
			'strike',
			'del',
			'span',
			'tg-spoiler',
			'a',
			'code',
			'pre',
			'blockquote'
		];
		const match = /^<\/?([a-z0-9-]+)(?:\s+[^>]*)?>/i.exec(text);
		if (match) {
			const tagName = match[1].toLowerCase();
			if (allowedTags.includes(tagName)) {
				return text; // Allow through
			}
		}
		// Escape everything else
		return escapeHtml(text);
	};

	renderer.text = (token) => {
		if ('tokens' in token && token.tokens) {
			return renderer.parser.parseInline(token.tokens);
		}
		// Escape standard HTML entities
		return escapeHtml(token.text);
	};

	marked.setOptions({
		gfm: true,
		breaks: true
	});

	const parsed = await marked.parse(s, { renderer });

	// Trim multiple newlines
	return (parsed as string).replace(/\n{3,}/g, '\n\n').trim();
}

export const SYSTEM_PROMPTS = {
	TUX_ROBOT:
		'You are a friendly assistant named TuxRobot. You have access to an HTTP fetch tool, a web search tool, and document tools. If a user asks you to get data from an API, look up a profile, or visit a website, you MUST execute the fetch tool yourself to get the data. You can perform web searches using the `tavily_search` tool. If the user asks about an uploaded document, a file, a PDF, or a markdown file, you MUST use the `search_telegram_file` tool to search its contents; do NOT use `tavily_search` or write code. If a user asks a follow-up question about a document they previously uploaded, use the tool again if needed. When calling tools, use the EXACT name provided (e.g., `search_telegram_file`); do NOT add any prefixes like "functions.". If the user replies with only a single word, sticker, or emoji, respond with no more than one short paragraph. Always keep replies below 4096 characters. Only use formatting that will be supported on Telegram. DO NOT use LaTeX formatting or math equations (like \\( ... \\) or \\[ ... \\]); always use standard plain text or simple markdown formatting as LaTeX does not render on Telegram.',
	BUSINESS_MODE:
		'You are {owner_name}. You are replying to a message from a customer, friend, or contact on Telegram. Be helpful, natural, and concise. Do not mention you are an AI or a bot. Your name is {owner_name}. Respond exactly as {owner_name}. Do not use any generic placeholders like [Business Name], [Your Name], or similar in your response. Only use tools if you truly need outside information to answer the question. Only use formatting that will be supported on Telegram. DO NOT use LaTeX formatting or math equations (like \\( ... \\) or \\[ ... \\]); always use standard plain text or simple markdown formatting as LaTeX does not render on Telegram.'
};

export const AVAILABLE_MODELS: Record<
	string,
	{ id: string; cost: number; supportsTools?: boolean; supportsVision?: boolean }
> = {
	hermes: { id: '@hf/nousresearch/hermes-2-pro-mistral-7b', cost: 5, supportsTools: true },
	gemma4: { id: '@cf/google/gemma-4-26b-a4b-it', cost: 10, supportsTools: true, supportsVision: true },
	'google/gemini-3-flash': { id: 'google/gemini-3-flash', cost: 15, supportsTools: true, supportsVision: true },
	'google/gemini-3.1-flash-lite': {
		id: 'google/gemini-3.1-flash-lite',
		cost: 10,
		supportsTools: true,
		supportsVision: true
	},
	'google/gemini-3.1-pro': { id: 'google/gemini-3.1-pro', cost: 80, supportsTools: true, supportsVision: true },
	'llama-3.2-vision': {
		id: '@cf/meta/llama-3.2-11b-vision-instruct',
		cost: 10,
		supportsTools: true,
		supportsVision: true
	},
	'kimi-k2.6': { id: '@cf/moonshotai/kimi-k2.6', cost: 40, supportsTools: true, supportsVision: true },
	'glm-4.7-flash': { id: '@cf/zai-org/glm-4.7-flash', cost: 10, supportsTools: true, supportsVision: true },
	'llama-3.3-70b': {
		id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		cost: 40,
		supportsTools: true
	},
	'deepseek-r1-32b': {
		id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
		cost: 60,
		supportsTools: false
	},
	'nemotron-3': { id: '@cf/nvidia/nemotron-3-120b-a12b', cost: 100, supportsTools: true }
};

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
	GITHUB_TOKEN?: string;
	AI: Ai;
	R2: R2Bucket;
	CONVERSATION_HISTORY: KVNamespace;
	AI_WORKFLOW: Fetcher;
	MESSAGE_QUEUE: Queue<Task>;
	TAVILY_API_KEY?: string;
	Sandbox: DurableObjectNamespace<Sandbox>;
	VECTORIZE?: VectorizeIndex;
}

export interface Tool {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function: (args: any) => Promise<unknown>;
}

export interface NormalizedToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool' | string;
	content?: string;
	tool_calls?: NormalizedToolCall[];
	tool_call_id?: string;
	name?: string;
	geminiParts?: GeminiPart[];
}

export interface Task {
	type: 'code' | 'message' | 'business_message' | 'photo' | 'gen_photo' | 'voice' | 'tool_call';
	updateId?: number;
	updateType?: string;
	guestQueryId?: string;
	businessConnectionId?: string;
	prompt: string;
	userId?: number | string;
	senderId?: number;
	chatId?: string;
	threadId?: number;
	messageId?: number;
	history?: { role: string; content: string }[];
	modelId?: string;
	fileId?: string;
	systemPrompt?: string;
	telegramToken?: string;
	token?: string;
	tools?: Tool[];
	stream?: boolean;
	geminiParts?: GeminiPart[];
}

export interface RawToolCall {
	id?: string;
	type?: string;
	name?: string;
	arguments?: string | Record<string, unknown>;
	function?: { name?: string; arguments?: string | Record<string, unknown> };
}

export interface GeminiPart {
	text?: string;
	thought?: boolean;
	inlineData?: { mimeType: string; data: string };
	functionCall?: { name: string; args: Record<string, unknown> };
	functionResponse?: { name: string; response: { content: string } };
}

export interface AiResponse {
	choices?: {
		delta?: { content?: string };
		message?: { content?: string; tool_calls?: RawToolCall[] };
		tool_calls?: RawToolCall[];
	}[];
	response?: string;
	candidates?: {
		content?: { parts?: GeminiPart[] };
	}[];
	tool_calls?: RawToolCall[];
}

export async function verifyTelegramWebAppData(
	initData: string,
	botToken: string
): Promise<boolean> {
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');
	params.delete('hash');

	const sortedParams = Array.from(params.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');

	const encoder = new TextEncoder();
	const secretKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode('WebAppData'),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const secret = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));

	const signatureKey = await crypto.subtle.importKey(
		'raw',
		secret,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', signatureKey, encoder.encode(sortedParams));

	const signatureHex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return signatureHex === hash;
}
