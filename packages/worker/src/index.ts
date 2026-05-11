import TelegramBot, { TelegramExecutionContext, TelegramUpdate } from '@codebam/cf-workers-telegram-bot';
import { marked } from 'marked';

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
	SECRET_TELEGRAM_API_TOKEN2: string;
	SECRET_TELEGRAM_API_TOKEN3: string;
	AI: Ai;
	R2: R2Bucket;
	CONVERSATION_HISTORY: KVNamespace;
}

type promiseFunc<T> = (resolve: (result: T) => void, reject: (e?: Error) => void) => Promise<T>;

/**
 * Wrap setTimeout in a Promise
 * @param func - function to call after setTimeout
 * @param time - delay in milliseconds (default: 1000)
 */
function wrapPromise<T>(func: promiseFunc<T>, time = 1000) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			func(resolve, reject).catch((e: unknown) => {
				console.error('Error in wrapPromise:', e);
			});
		}, time);
	});
}

/**
 * Convert markdown to html that Telegram can parse
 * @param s - the string containing markdown
 * @returns HTML formatted string compatible with Telegram
 */
async function markdownToHtml(s: string): Promise<string> {
	marked.setOptions(marked.getDefaults());
	const parsed = (await marked.parse(s)) as string | { toString(): string };
	const html = typeof parsed === 'string' ? parsed : parsed.toString();

	const allowedTags = ['b', 'i', 'u', 's', 'code', 'pre', 'a', 'blockquote'];
	const tagStack: string[] = [];
	let result = '';
	let i = 0;

	while (i < html.length) {
		if (html[i] === '<') {
			const tagMatch = /^<\/?([a-z1-6]+)(?:\s+[^>]*)?>/i.exec(html.slice(i));
			if (tagMatch) {
				const fullTag = tagMatch[0];
				const tagName = tagMatch[1].toLowerCase();
				const isClosing = fullTag.startsWith('</');

				if (allowedTags.includes(tagName)) {
					if (isClosing) {
						if (tagStack.includes(tagName)) {
							while (tagStack.length > 0) {
								const top = tagStack.pop();
								if (top) {
									result += `</${top}>`;
									if (top === tagName) break;
								}
							}
						}
					} else {
						tagStack.push(tagName);
						if (tagName === 'a') {
							const hrefMatch = /href="([^"]*)"/i.exec(fullTag);
							result += hrefMatch ? `<a href="${hrefMatch[1]}">` : '<a>';
						} else {
							result += `<${tagName}>`;
						}
					}
				}
				i += fullTag.length;
				continue;
			}
		}

		if (html[i] === '<') result += '&lt;';
		else if (html[i] === '>') result += '&gt;';
		else if (html[i] === '&') {
			// Check if it's already an entity
			const entityMatch = /^&[a-z0-9#]+;/i.exec(html.slice(i));
			if (entityMatch) {
				result += entityMatch[0];
				i += entityMatch[0].length;
				continue;
			}
			result += '&amp;';
		} else result += html[i];
		i++;
	}

	while (tagStack.length > 0) {
		const top = tagStack.pop();
		if (top) {
			result += `</${top}>`;
		}
	}

	return result;
}

interface AiResponse {
	choices?: {
		delta?: {
			content?: string;
		};
		message?: {
			content?: string;
		};
	}[];
	response?: string;
	candidates?: {
		content?: {
			parts?: {
				text?: string;
			}[];
		};
	}[];
}

interface Task {
	type: 'code' | 'message' | 'business_message' | 'photo' | 'gen_photo';
	prompt: string;
	userId?: number;
	history?: { role: string; content: string }[];
	modelId?: string;
	fileId?: string;
	systemPrompt?: string;
}

class HistoryManager {
	constructor(private kv: KVNamespace) { }

	async getHistory(userId: number): Promise<{ role: string; content: string }[]> {
		const history = await this.kv.get<{ role: string; content: string }[]>(`history:${String(userId)}`, 'json');
		return history ?? [];
	}

	async addMessage(userId: number, prompt: string, response: string) {
		const history = await this.getHistory(userId);
		history.push({ role: 'system', content: `[INST] ${prompt} [/INST] \n ${response}` });
		const trimmedHistory = history.slice(-10);
		await this.kv.put(`history:${String(userId)}`, JSON.stringify(trimmedHistory), { expirationTtl: 86400 });
	}

	async clearHistory(userId: number) {
		await this.kv.delete(`history:${String(userId)}`);
	}
}

async function streamAiResponseGemma(
	bot: TelegramExecutionContext,
	env: Environment,
	model: string,
	messages: { role: string; content: string }[],
	max_completion_tokens?: number,
	image?: number[]
): Promise<string> {
	const isGemini = model.startsWith('google/gemini');
	const payload: Record<string, unknown> = {};

	if (isGemini) {
		payload.contents = messages.map(m => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: m.content }]
		}));
		const contents = payload.contents as { role: string; parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] }[];
		if (image) {
			contents[contents.length - 1].parts.push({
				inline_data: {
					mime_type: 'image/jpeg',
					data: btoa(String.fromCharCode(...image))
				}
			});
		}
	} else {
		payload.messages = messages;
		payload.stream = true;
		if (max_completion_tokens) {
			payload.max_completion_tokens = max_completion_tokens;
		}
		if (image) {
			payload.image = image;
		}
	}

	
	const response = (await env.AI.run(model, payload, {
		gateway: { id: 'default' }
	}));

	const draft_id = Math.floor(Math.random() * 1000000) + 1;

	// Fallback for non-streaming responses
	if (!(response instanceof ReadableStream)) {
		const data = response as AiResponse;
		const content = data.choices?.[0]?.message?.content ?? 
						data.response ?? 
						data.candidates?.[0]?.content?.parts?.[0]?.text ?? 
						'';
		if (content) {
			await bot.streamReply(await markdownToHtml(content), draft_id, 'HTML');
		}
		return content;
	}

	const reader = (response as ReadableStream<Uint8Array>).getReader();
	const decoder = new TextDecoder();
	let fullResponse = '';
	let lastUpdate = 0;
	let buffer = '';

	for (; ;) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

			if (trimmedLine.startsWith('data: ')) {
				try {
					const data = JSON.parse(trimmedLine.slice(6)) as AiResponse;

					// Handle standard OpenAI/Gemma format or Google-native format
					const content = data.choices?.[0]?.delta?.content ?? 
									data.response ?? 
									data.candidates?.[0]?.content?.parts?.[0]?.text ?? 
									'';

					if (content) {
						fullResponse += content;

						// Throttle updates to Telegram (1000ms is sensible to avoid rate limits)
						if (Date.now() - lastUpdate > 1000) {
							try {
								await bot.streamReply(await markdownToHtml(fullResponse), draft_id, 'HTML');
							} catch {
								// Ignore temporary parse errors during streaming
							}
							lastUpdate = Date.now();
						}
					}
				} catch (e) {
					// We ignore parse errors for lines that aren't valid JSON (like heartbeats)
					console.error('Error parsing AI stream chunk:', e);
				}
			}
		}
	}

	// Final update to ensure the message is complete in Telegram
	try {
		const timeToWait = Math.max(0, 1000 - (Date.now() - lastUpdate));
		if (timeToWait > 0) {
			await new Promise(resolve => setTimeout(resolve, timeToWait));
		}

		// Also process any leftover buffer just in case
		if (buffer.trim()) {
			const trimmedLine = buffer.trim();
			if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
				try {
					const data = JSON.parse(trimmedLine.slice(6)) as AiResponse;
					const content = data.choices?.[0]?.delta?.content ?? data.response ?? '';
					if (content) fullResponse += content;
				} catch {
					// Ignore parse errors
				}
			}
		}

		await bot.streamReply(await markdownToHtml(fullResponse), draft_id, 'HTML');
	} catch (e) {
		console.error('Final streamReply failed:', e);
	}

	return fullResponse;
}

// Constants for system prompts
const SYSTEM_PROMPTS = {
	TUX_ROBOT: 'You are a friendly assistant named TuxRobot.',
	SEAN: 'You are a friendly person named Sean. Sometimes just acknowledge messages with okay. You are working on coding a cool telegram bot.',
};

const AI_MODELS = {
	LLAMA: '@cf/meta/llama-3.2-11b-vision-instruct',
	CODER: '@cf/google/gemma-4-26b-a4b-it',
	IMAGEN: 'google/imagen-4',
	STABLE_DIFFUSION: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
	GEMMA: '@cf/google/gemma-4-26b-a4b-it',
};

const AVAILABLE_MODELS: Record<string, { id: string, cost: number }> = {
	'gemma4': { id: '@cf/google/gemma-4-26b-a4b-it', cost: 10 },
	'google/gemini-3-flash': { id: 'google/gemini-3-flash', cost: 30 },
	'google/gemini-3.1-flash-lite': { id: 'google/gemini-3.1-flash-lite', cost: 20 },
	'google/gemini-3.1-pro': { id: 'google/gemini-3.1-pro', cost: 100 }
};

async function processTask(bot: TelegramExecutionContext, env: Environment, task: Task, historyManager: HistoryManager, ctx: ExecutionContext) {
	await bot.sendTyping();
	try {
		switch (task.type) {
			case 'code': {
				const messages = [{ role: 'user', content: task.prompt }];
				const response = await streamAiResponseGemma(bot, env, task.modelId ?? AI_MODELS.CODER, messages, 50000);
				if (response) {
					await bot.reply(await markdownToHtml(response), 'HTML');
				}
				break;
			}
			case 'message': {
				const messages: { role: string; content: string }[] = [
					{ role: 'system', content: task.systemPrompt ?? SYSTEM_PROMPTS.TUX_ROBOT },
					...(task.history ?? []),
					{ role: 'user', content: task.prompt },
				];
				const response = await streamAiResponseGemma(bot, env, task.modelId ?? AI_MODELS.GEMMA, messages, 50000);
				if (response) {
					await bot.reply(await markdownToHtml(response), 'HTML');
					await historyManager.addMessage(task.userId!, task.prompt, response);
				}
				break;
			}
			case 'business_message': {
				const messages: { role: string; content: string }[] = [
					{ role: 'system', content: task.systemPrompt ?? SYSTEM_PROMPTS.SEAN },
					...(task.history as { role: string; content: string }[]),
					{ role: 'user', content: task.prompt },
				];
				let image: number[] | undefined;
				if (task.fileId) {
					const fileResponse = await bot.getFile(task.fileId);
					const blob = await fileResponse.arrayBuffer();
					image = [...new Uint8Array(blob)];
				}
				const response = await streamAiResponseGemma(bot, env, task.modelId ?? AI_MODELS.LLAMA, messages, 50000, image);
				if (response) {
					await bot.reply(await markdownToHtml(response), 'HTML');
					await historyManager.addMessage(task.userId!, task.prompt, response);
				}
				break;
			}
			case 'photo': {
				const messages: { role: string; content: string }[] = [
					{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
					...(task.history ?? []),
					{ role: 'user', content: task.prompt },
				];
				const fileResponse = await bot.getFile(task.fileId!);
				const blob = await fileResponse.arrayBuffer();
				const image = [...new Uint8Array(blob)];
				const response = await streamAiResponseGemma(bot, env, task.modelId ?? AI_MODELS.GEMMA, messages, 50000, image);
				if (response) {
					await bot.reply(await markdownToHtml(response), 'HTML');
					await historyManager.addMessage(task.userId!, task.prompt, response);
				}
				break;
			}
			case 'gen_photo': {
				
				const rawPhoto = await env.AI.run(
					AI_MODELS.IMAGEN,
					{ prompt: task.prompt },
					{ gateway: { id: 'default' } }
				);
				const photo = rawPhoto as { result?: { image?: string }; image?: string };

				let imgUrl: string | null = null;
				let imgData: ArrayBuffer | Uint8Array | null = null;

				if (photo.result?.image?.startsWith('http')) {
					imgUrl = photo.result.image;
				} else if (photo.image ?? photo.result?.image) {
					const data = photo.image ?? photo.result?.image ?? '';
					const base64Data = data.includes(',') ? data.split(',')[1] : data;
					const binaryString = atob(base64Data);
					imgData = Uint8Array.from(binaryString, (m) => m.codePointAt(0) ?? 0);
				} else if (photo instanceof ReadableStream || photo instanceof ArrayBuffer || (typeof Uint8Array !== 'undefined' && photo instanceof Uint8Array)) {
					imgData = photo instanceof ReadableStream ? await new Response(photo).arrayBuffer() : photo;
				} else {
					throw new Error(`Unexpected response format from AI: ${JSON.stringify(photo)}`);
				}

				if (imgUrl) {
					await bot.replyPhoto(imgUrl);
				} else if (imgData) {
					const photoFile = new File([imgData], 'photo');
					const id = crypto.randomUUID();
					await env.R2.put(id, photoFile);
					await bot.replyPhoto(`https://r2.seanbehan.ca/${id}`);
					ctx.waitUntil(wrapPromise(async () => { await env.R2.delete(id); }, 500));
				}
				break;
			}
		}
	} catch (e) {
		console.error('Error in processTask:', e);
		await bot.reply(`Error: ${e as string}`);
	}
}

async function getBalance(userId: number, env: Environment): Promise<number> {
	const balanceKey = `balance:${String(userId)}`;
	const balance = await env.CONVERSATION_HISTORY.get<number>(balanceKey, 'json');
	if (balance === null) {
		const defaultBalance = 200;
		await env.CONVERSATION_HISTORY.put(balanceKey, JSON.stringify(defaultBalance));
		return defaultBalance;
	}
	return balance;
}

async function chargeStars(bot: TelegramExecutionContext, env: Environment, task: Task, historyManager: HistoryManager, ctx: ExecutionContext, amountOverride?: number) {
	const userId = bot.update.message?.from.id ?? bot.update.business_message?.from.id ?? bot.update.guest_message?.from.id;
	if (!userId) return;

	task.userId = userId;
	const balanceKey = `balance:${String(userId)}`;
	const balance = await getBalance(userId, env);

	// Determine model and cost
	const modelPreference = await env.CONVERSATION_HISTORY.get<string>(`model:${String(userId)}`) ?? 'gemma4';
	const modelConfig = AVAILABLE_MODELS[modelPreference] ?? AVAILABLE_MODELS.gemma4;
	const amount = amountOverride ?? modelConfig.cost;
	task.modelId = modelConfig.id;

	if (balance >= amount) {
		await env.CONVERSATION_HISTORY.put(balanceKey, JSON.stringify(balance - amount));
		await processTask(bot, env, task, historyManager, ctx);
	} else {
		if (bot.update_type === 'business_message' || bot.update_type === 'guest_message') {
			await bot.reply('Insufficient balance. Please go to direct messages and use /load to top up your Stars.');
		} else {
			const taskId = crypto.randomUUID();
			await env.CONVERSATION_HISTORY.put(`task:${taskId}`, JSON.stringify(task), { expirationTtl: 3600 });
			await bot.sendStarsInvoice('AI Generation', 'Charge for AI message generation', taskId, amount);
		}
	}
}

export default {
	fetch: async (request: Request, env: Environment, ctx: ExecutionContext) => {
		const tuxrobot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		const duckduckbot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN2);
		const translatepartybot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN3);
		const historyManager = new HistoryManager(env.CONVERSATION_HISTORY);

		const url = new URL(request.url);
		const tokens = [env.SECRET_TELEGRAM_API_TOKEN, env.SECRET_TELEGRAM_API_TOKEN2, env.SECRET_TELEGRAM_API_TOKEN3];
		const token = tokens.find(t => url.pathname.startsWith(`/${t}`));

		if (token && url.pathname.endsWith('/add-credits')) {
			const userId = parseInt(url.searchParams.get('userId') ?? '0');
			const amount = parseInt(url.searchParams.get('amount') ?? '0');
			if (userId && !isNaN(amount)) {
				const balanceKey = `balance:${String(userId)}`;
				const balance = await getBalance(userId, env);
				await env.CONVERSATION_HISTORY.put(balanceKey, JSON.stringify(balance + amount));
				return new Response(JSON.stringify({ success: true, userId, newBalance: balance + amount }), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('Invalid params. Usage: /<token>/add-credits?userId=<id>&amount=<amount>', { status: 400 });
		}
		if (request.method === 'POST') {
			const clonedRequest = request.clone();
			try {
				const update: TelegramUpdate = await clonedRequest.json();
				if (update.message?.sender_chat || update.business_message?.sender_chat || update.channel_post || update.edited_channel_post) {
					return new Response('ok');
				}
			} catch {
				// Ignore non-JSON or malformed requests
			}
		}

		await Promise.all([
			tuxrobot
				.on(':document', async (bot: TelegramExecutionContext) => {
					const fileId: string = bot.update.message?.document?.file_id ?? '';
					const fileResponse = await bot.getFile(fileId);
					const id = crypto.randomUUID().slice(0, 5);
					await env.R2.put(id, await fileResponse.arrayBuffer());
					await bot.reply(`https://r2.seanbehan.ca/${id}`);
					return new Response('ok');
				})
				.on('epoch', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await bot.reply(Math.floor(Date.now() / 1000).toString());
					}
					return new Response('ok');
				})
				.on('start', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await bot.reply(
							'Welcome! Here are my commands:\n' +
							'/balance - Check your current Star balance\n' +
							'/load <amount> - Top up your balance with Telegram Stars\n' +
							'/photo <prompt> - Generate an image (100 Stars)\n' +
							'/model <name> - Switch AI model and see costs\n' +
							'/code <prompt> - Generate code snippets\n' +
							'<prompt> - Generate text\n' +
							'/clear - Clear your conversation history\n\n' +
							'New users start with 200 free credits!',
						);
					}
					return new Response('ok');
				})
				.on('code', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						const prompt = bot.update.message?.text?.toString().split(' ').slice(1).join(' ') ?? '';
						await chargeStars(bot, env, { type: 'code', prompt }, historyManager, ctx);
					}
					return new Response('ok');
				})
				.on('balance', async (bot: TelegramExecutionContext) => {
					const userId = bot.update.message?.from.id ?? bot.update.business_message?.from.id ?? bot.update.guest_message?.from.id;
					if (userId) {
						const balance = await getBalance(userId, env);
						await bot.reply(`Your current balance is ${String(balance)} Stars.`);
					}
					return new Response('ok');
				})
				.on('load', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						const amountStr = bot.update.message?.text?.toString().split(' ')[1];
						const amount = parseInt(amountStr ?? '0');
						if (isNaN(amount) || amount <= 0 || amount > 1000) {
							await bot.reply('Please specify an amount between 1 and 1000 Stars. Example: /load 100');
						} else {
							await bot.sendStarsInvoice('Stars Top-up', `Purchase ${String(amount)} Stars`, `load:${String(amount)}`, amount);
						}
					}
					return new Response('ok');
				})
				.on('clear', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						const userId = bot.update.message?.from.id;
						if (userId) {
							await historyManager.clearHistory(userId);
							await bot.reply('History cleared');
						}
					}
					return new Response('ok');
				})
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message': {
							let prompt = bot.update.message?.text?.toString() ?? '';
							if (bot.update.message?.reply_to_message) {
								const reply = bot.update.message.reply_to_message;
								const replyText = reply.text ?? reply.caption ?? '';
								if (replyText) {
									prompt = `Context of the message I am replying to: "${replyText}"\n\nMy message: ${prompt}`;
								}
							}
							const userId = bot.update.message?.from.id;
							if (userId) {
								const history = await historyManager.getHistory(userId);
								await chargeStars(bot, env, { type: 'message', prompt, history }, historyManager, ctx);
							}
							break;
						}

						case 'photo': {
							const photo = bot.update.message?.photo;
							const fileId: string = photo ? photo[photo.length - 1]?.file_id ?? '' : '';
							let prompt = bot.update.message?.caption ?? 'Please describe this image';
							if (bot.update.message?.reply_to_message) {
								const reply = bot.update.message.reply_to_message;
								const replyText = reply.text ?? reply.caption ?? '';
								if (replyText) {
									prompt = `Context of the message I am replying to: "${replyText}"\n\nMy message: ${prompt}`;
								}
							}
							const userId = bot.update.message?.from.id;
							if (userId) {
								const history = await historyManager.getHistory(userId);
								await chargeStars(bot, env, { type: 'photo', prompt, history, fileId }, historyManager, ctx, 10);
							}
							break;
						}

						case 'inline': {
							const query = bot.update.inline_query?.query.toString() ?? '';

							// Check if query ends with proper punctuation
							if (!query.endsWith('.') && !query.endsWith('?')) {
								await bot.replyInline(
									"Please complete your sentence",
									"End your sentence with a period (.) or question mark (?) to get an AI response",
									'HTML'
								);
								break;
							}

							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								{ role: 'user', content: query },
							];

							try {
								const rawResponse = await env.AI.run(AI_MODELS.LLAMA, { messages, max_completion_tokens: 100 });
								const aiResponse = rawResponse as AiResponse;

								if (aiResponse.response) {
									await bot.replyInline(
										aiResponse.response,
										await markdownToHtml(aiResponse.response),
										'HTML'
									);
								}
							} catch (e) {
								console.error('Error in inline handler:', e);
								await bot.reply(`Error: ${e as string}`);
							}
							break;
						}

						case 'guest_message': {
							let prompt = bot.update.guest_message?.text?.toString() ?? '';
							if (bot.update.guest_message?.reply_to_message) {
								const reply = bot.update.guest_message.reply_to_message;
								const replyText = reply.text ?? reply.caption ?? '';
								if (replyText) {
									prompt = `Context of the message I am replying to: "${replyText}"\n\nMy message: ${prompt}`;
								}
							}
							const userId = bot.update.guest_message?.from.id;
							if (userId) {
								const history = await historyManager.getHistory(userId);
								await chargeStars(bot, env, { type: 'message', prompt, history }, historyManager, ctx);
							}
							break;
						}

						case 'business_message': {
							await bot.sendTyping();
							const photo = bot.update.business_message?.photo;
							const fileId: string = photo ? photo[photo.length - 1]?.file_id ?? '' : '';
							let prompt = bot.update.business_message?.text?.toString() ?? bot.update.business_message?.caption ?? '';

							if (bot.update.business_message?.reply_to_message) {
								const reply = bot.update.business_message.reply_to_message;
								const replyText = reply.text ?? reply.caption ?? '';
								if (replyText) {
									prompt = `Context of the message I am replying to: "${replyText}"\n\nMy message: ${prompt}`;
								}
							}

							const userId = bot.update.business_message?.from.id;
							if (userId && userId !== 69148517) {
								const history = await historyManager.getHistory(userId);
								await chargeStars(bot, env, { type: 'business_message', prompt, history, fileId, systemPrompt: SYSTEM_PROMPTS.SEAN }, historyManager, ctx);
							}
							break;
						}
						default:
							try {
								console.log(JSON.stringify(bot.update));
							}
							catch {
								console.log("couldn't json.stringify update...", bot.update)
							}
							break;
					}
					return new Response('ok');
				})
				.on('model', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						const userId = bot.update.message?.from.id;
						if (userId) {
							const modelKey = `model:${String(userId)}`;
							const args = bot.update.message?.text?.toString().split(' ') ?? [];

						if (args.length > 1) {
							const selectedModel = args[1].toLowerCase();
							if (selectedModel in AVAILABLE_MODELS) {
								await env.CONVERSATION_HISTORY.put(modelKey, selectedModel);
								await bot.reply(`Model updated to <b>${selectedModel}</b>.`, 'HTML');
							} else {
								await bot.reply(`Invalid model. Available models:\n${Object.keys(AVAILABLE_MODELS).join('\n')}`);
							}
						} else {
							const currentModel = (await env.CONVERSATION_HISTORY.get<string>(modelKey)) ?? 'gemma4';
							await bot.reply(
								`Current model: <b>${currentModel}</b>\n\n` +
								`Available models:\n` +
								Object.entries(AVAILABLE_MODELS).map(([name, cfg]) => `- <code>${name}</code> (${String(cfg.cost)} Stars)`).join('\n'),
								'HTML'
							);
						}
					}
					}
					return new Response('ok');
				})
				.on('photo', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						const prompt = bot.update.message?.text?.toString() ?? '';
						await chargeStars(bot, env, { type: 'gen_photo', prompt }, historyManager, ctx, 100);
					}
					return new Response('ok');
				})
				.on(':pre_checkout_query', async (bot: TelegramExecutionContext) => {
					await bot.answerPreCheckoutQuery(true);
					return new Response('ok');
				})
				.on(':successful_payment', async (bot: TelegramExecutionContext) => {
					const payment = bot.update.message?.successful_payment;
					if (!payment) return new Response('ok');

					const payload = payment.invoice_payload;
					const userId = bot.update.message?.from.id;
					if (!userId) return new Response('ok');

					if (payload.startsWith('load:')) {
						const amount = parseInt(payload.split(':')[1]);
						const balanceKey = `balance:${String(userId)}`;
						const balance = await env.CONVERSATION_HISTORY.get<number>(balanceKey, 'json') ?? 0;
						await env.CONVERSATION_HISTORY.put(balanceKey, JSON.stringify(balance + amount));
						await bot.reply(`Successfully loaded ${String(amount)} Stars! New balance: ${String(balance + amount)} Stars.`);
						return new Response('ok');
					}

					const taskId = payload;
					const task = await env.CONVERSATION_HISTORY.get<Task>(`task:${taskId}`, 'json');
					if (!task) {
						await bot.reply('Error: Task not found');
						return new Response('ok');
					}

					await processTask(bot, env, task, historyManager, ctx);

					await env.CONVERSATION_HISTORY.delete(`task:${taskId}`);
					return new Response('ok');
				})
				.handle(request.clone()),

			duckduckbot
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message': {
							await bot.reply('https://duckduckgo.com/?q=' + encodeURIComponent(bot.update.message?.text?.toString() ?? ''));
							break;
						}
						case 'inline': {
							await bot.reply('https://duckduckgo.com/?q=' + encodeURIComponent(bot.update.inline_query?.query ?? ''));
							break;
						}
					}
					return new Response('ok');
				})
				.handle(request.clone()),

			translatepartybot
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'inline': {
							try {
								const query = encodeURIComponent(bot.update.inline_query?.query.toString() ?? '');
								const response = await fetch(
									`https://translate.googleapis.com/translate_a/single?sl=auto&tl=en&dt=t&dj=1&prev=input&ie=utf-8&oe=utf-8&client=gtx&q=${query}`,
								);

								const json = await response.json();
								const translatedText = (json as { sentences: [{ trans: string; orig: string; backend: number }] }).sentences[0].trans;

								await bot.reply(translatedText);
							} catch (e) {
								console.error('Error in translate handler:', e);
								await bot.reply(`Translation error: ${e as string}`);
							}
							break;
						}
						case 'message':
							await bot.reply('Use me in inline mode by typing @TranslatePartyBot and the text you want to translate.');
							break;
					}
					return new Response('ok');
				})
				.handle(request.clone()),
		]);

		return new Response('ok');
	},
};
