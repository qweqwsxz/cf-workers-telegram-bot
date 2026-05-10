import TelegramBot, { TelegramExecutionContext } from '../../main/src/main.js';
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
	const parsedString = typeof parsed === 'string' ? parsed : parsed.toString();
	const tagsToRemove = ['p', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'];
	const tagPattern = new RegExp(tagsToRemove.map((tag) => `<${tag}[^>]*>|</${tag}>`).join('|'), 'g');
	return parsedString.replace(tagPattern, '');
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
}

class HistoryManager {
	constructor(private kv: KVNamespace) {}

	async getHistory(userId: number): Promise<{ role: string; content: string }[]> {
		const history = await this.kv.get(`history:${userId}`, 'json');
		return (history as { role: string; content: string }[]) || [];
	}

	async addMessage(userId: number, prompt: string, response: string) {
		const history = await this.getHistory(userId);
		history.push({ role: 'system', content: `[INST] ${prompt} [/INST] \n ${response}` });
		const trimmedHistory = history.slice(-10);
		await this.kv.put(`history:${userId}`, JSON.stringify(trimmedHistory), { expirationTtl: 86400 });
	}

	async clearHistory(userId: number) {
		await this.kv.delete(`history:${userId}`);
	}
}

async function streamAiResponseGemma(
	bot: TelegramExecutionContext,
	env: Environment,
	model: string,
	messages: { role: string; content: string }[],
	max_completion_tokens?: number,
): Promise<string> {
	// @ts-expect-error broken bindings
	const response = (await env.AI.run(model, {
		messages,
		stream: true,
		max_completion_tokens
	})) as ReadableStream<Uint8Array>;

	const reader = response.getReader();
	const decoder = new TextDecoder();
	const draft_id = Math.floor(Math.random() * 1000000) + 1;
	let fullResponse = '';
	let lastUpdate = 0;
	let buffer = '';

	for (;;) {
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
					
					// Use the new OpenAI-style path or the legacy response key
					const content = data.choices?.[0]?.delta?.content ?? data.response ?? '';

					if (content) {
						fullResponse += content;

						// Throttle updates to Telegram (1000ms is sensible to avoid rate limits)
						if (Date.now() - lastUpdate > 1000) {
							await bot.streamReply(await markdownToHtml(fullResponse), draft_id, 'HTML');
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

// AI model constants
const AI_MODELS = {
	LLAMA: '@cf/meta/llama-3.2-11b-vision-instruct',
	CODER: '@hf/thebloke/deepseek-coder-6.7b-instruct-awq',
	FLUX: '@cf/black-forest-labs/flux-1-schnell',
	STABLE_DIFFUSION: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
	GEMMA: '@cf/google/gemma-4-26b-a4b-it',
};

export default {
	fetch: async (request: Request, env: Environment, ctx: ExecutionContext) => {
		const tuxrobot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		const duckduckbot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN2);
		const translatepartybot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN3);
		const historyManager = new HistoryManager(env.CONVERSATION_HISTORY);

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
							'Send me a message to talk to llama3. Use /clear to wipe history. Use /photo to generate a photo. Use /code to generate code.',
						);
					}
					return new Response('ok');
				})
				.on('code', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await bot.sendTyping();
						const prompt = bot.update.message?.text?.toString().split(' ').slice(1).join(' ') ?? '';
						const messages = [{ role: 'user', content: prompt }];

						try {
							// @ts-expect-error broken bindings
							const response = await env.AI.run(AI_MODELS.CODER, { messages });

								// @ts-expect-error broken bindings
							if ('response' in response) {
								await bot.reply(
									await markdownToHtml(
										typeof response.response === 'string' 
											? response.response 
											: JSON.stringify(response.response)
									), 
									'HTML'
								);
							}
						} catch (e) {
							console.error('Error in code handler:', e);
							await bot.reply(`Error: ${e as string}`);
						}
					}
					return new Response('ok');
				})
				.on('clear', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await historyManager.clearHistory(bot.update.message!.from.id);
						await bot.reply('History cleared');
					}
					return new Response('ok');
				})
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message': {
							// await bot.sendTyping();
							let prompt = bot.update.message?.text?.toString() ?? '';

							if (bot.update.message?.reply_to_message) {
								const reply = bot.update.message.reply_to_message;
								const replyText = reply.text ?? reply.caption ?? '';
								if (replyText) {
									prompt = `Context of the message I am replying to: "${replyText}"\n\nMy message: ${prompt}`;
								}
							}

							const messageHistory = await historyManager.getHistory(bot.update.message!.from.id);

							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								...messageHistory,
								{ role: 'user', content: prompt },
							];

							try {
								console.log('Processing text message:', prompt);
								const response = await streamAiResponseGemma(bot, env, AI_MODELS.GEMMA, messages, 50000);

								if (response) {
									await bot.reply(await markdownToHtml(response), 'HTML');
									await historyManager.addMessage(bot.update.message!.from.id, prompt, response);
								}
							} catch (e) {
								console.error('Error in message handler:', e);
								await bot.reply(`Error: ${e as string}`);
							}
							break;
						}

						case 'photo': {
							await bot.sendTyping();
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

							console.log('Processing photo:', { fileId, prompt });

							const messageHistory = await historyManager.getHistory(bot.update.message!.from.id);

							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								...messageHistory,
								{ role: 'user', content: prompt },
							];

							try {
								const fileResponse = await bot.getFile(fileId);
								const blob = await fileResponse.arrayBuffer();
								// @ts-expect-error broken bindings
								const response = await env.AI.run(AI_MODELS.GEMMA, { 
									messages, 
									image: [...new Uint8Array(blob)] 
								});

								// @ts-expect-error broken bindings
								if ('response' in response && response.response) {
									const aiResponse = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
									await bot.reply(
										await markdownToHtml(aiResponse), 
										'HTML'
									);

									await historyManager.addMessage(bot.update.message!.from.id, prompt, aiResponse);
								}
							} catch (e) {
								console.error('Error in photo handler:', e);
								await bot.reply(`Error processing image: ${e as string}`);
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
								// @ts-expect-error broken bindings
								const response = await env.AI.run(AI_MODELS.LLAMA, { messages, max_completion_tokens: 100 });

								// @ts-expect-error broken bindings
								if ('response' in response) {
									await bot.replyInline(
										(typeof response.response === 'string' ? response.response : ''),
										await markdownToHtml(typeof response.response === 'string' ? response.response : ''),
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
							const messageHistory = await historyManager.getHistory(bot.update.guest_message!.from.id);
							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								...messageHistory,
								{ role: 'user', content: prompt },
							];

							try {
								await bot.sendTyping();
								// @ts-expect-error broken bindings
								const response = (await env.AI.run(AI_MODELS.GEMMA, { messages })) as AiResponse;

								const content = response.choices?.[0]?.message?.content ?? response.response ?? '';

								if (content) {
									await bot.reply(await markdownToHtml(content), 'HTML');
									await historyManager.addMessage(bot.update.guest_message!.from.id, prompt, content);
								}
							} catch (e) {
								console.error('Error in guest message handler:', e);
								await bot.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
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

							if (bot.update.business_message?.from.id !== 69148517) {
								const messageHistory = await historyManager.getHistory(bot.update.business_message!.from.id);
								const messages = [{ role: 'system', content: SYSTEM_PROMPTS.SEAN }, ...messageHistory, { role: 'user', content: prompt }];

								try {
									let response: AiResponse;
									
									if (fileId) {
										const fileResponse = await bot.getFile(fileId);
										const blob = await fileResponse.arrayBuffer();
										// @ts-expect-error broken bindings
										response = (await env.AI.run(AI_MODELS.LLAMA, { messages, image: [...new Uint8Array(blob)] }));
									} else {
										// @ts-expect-error broken bindings
										response = (await env.AI.run(AI_MODELS.LLAMA, { messages }));
									}

									if (response.response) {
										const aiResponse = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
										await bot.reply(
											await markdownToHtml(aiResponse), 
											'HTML'
										);

										await historyManager.addMessage(bot.update.business_message!.from.id, prompt, aiResponse);
									}
								} catch (e) {
									console.error('Error in business message handler:', e);
									await bot.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
								}
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
				.on('photo', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await bot.sendTyping();
						const prompt = bot.update.message?.text?.toString() ?? '';

						try {
							// @ts-expect-error broken bindings
							const photo = (await env.AI.run(AI_MODELS.FLUX, { prompt, steps: 8 })) as { image: string };

							const binaryString = atob(photo.image);
							// @ts-expect-error broken bindings
							const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
							const photoFile = new File([await new Response(img).blob()], 'photo');
							const id = crypto.randomUUID();

							await env.R2.put(id, photoFile);
							console.log(`https://r2.seanbehan.ca/${id}`);
							await bot.replyPhoto(`https://r2.seanbehan.ca/${id}`);

							ctx.waitUntil(
								wrapPromise(async () => {
									await env.R2.delete(id);
								}, 500),
							);
						} catch (e) {
							console.error('Error in photo handler:', e);
							await bot.reply(`Error: ${e as string}`);
						}
					}
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
