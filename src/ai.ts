import { ParseMode } from '@grammyjs/types';
import TelegramExecutionContext from './telegram_execution_context';
import TelegramApi from './telegram_api';
import { markdownToHtml } from './utils';

/**
 * Robustly extract text from various AI response formats.
 * Handles OpenAI, Cloudflare, and Google Gemini structures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractText(obj: any): string {
	if (typeof obj === 'string') {
		return obj;
	}
	if (typeof obj !== 'object' || obj === null) {
		return '';
	}

	// Direct fields
	if (typeof obj.response === 'string') {
		return obj.response;
	}
	if (typeof obj.text === 'string') {
		return obj.text;
	}
	if (typeof obj.content === 'string') {
		return obj.content;
	}
	if (typeof obj.delta === 'string') {
		return obj.delta;
	}

	// Nested fields
	if (obj.choices && Array.isArray(obj.choices) && obj.choices.length > 0) {
		return extractText(obj.choices[0]);
	}
	if (obj.message) {
		return extractText(obj.message);
	}
	if (obj.delta) {
		return extractText(obj.delta);
	}
	if (obj.candidates && Array.isArray(obj.candidates) && obj.candidates.length > 0) {
		return extractText(obj.candidates[0]);
	}
	if (obj.content) {
		return extractText(obj.content);
	}
	if (obj.parts && Array.isArray(obj.parts) && obj.parts.length > 0) {
		return extractText(obj.parts[0]);
	}

	return '';
}

/**
 * Custom runner that supports tool calls across different AI models.
 */
export async function customRunWithTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ai: any,
	model: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	input: { messages: any[]; tools?: any[] },
	config: { streamFinalResponse: boolean },
) {
	const messages = [...input.messages];
	const tools = input.tools || [];
	const isGemini = model.includes('google/gemini');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const cfTools = tools.map((t: any) => ({
		type: 'function',
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const runModel = async (msgs: any[], stream: boolean) => {
		if (isGemini) {
			const systemMessage = msgs.find((m) => m.role === 'system');
			const otherMessages = msgs.filter((m) => m.role !== 'system');
			const geminiInput: Record<string, unknown> = {
				contents: otherMessages.map((m) => ({
					role: m.role === 'assistant' ? 'model' : 'user',
					parts: [{ text: m.content as string }],
				})),
				stream,
			};
			if (systemMessage) {
				geminiInput.system_instruction = {
					parts: [{ text: systemMessage.content as string }],
				};
			}
			return await ai.run(model, geminiInput);
		}
		return await ai.run(model, { messages: msgs, tools: cfTools.length > 0 ? cfTools : undefined, stream });
	};

	if (cfTools.length === 0 || isGemini) {
		return await runModel(messages, config.streamFinalResponse);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const response = (await runModel(messages, false)) as any;

	// FIX: Robustly extract from BOTH Cloudflare formats (Standard and OpenAI-compatible)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let toolCalls: any[] = [];
	if (response?.tool_calls) {
		toolCalls = [...response.tool_calls];
	} else if (response?.choices?.[0]?.message?.tool_calls) {
		toolCalls = [...response.choices[0].message.tool_calls];
	}

	let responseText = response?.response || response?.choices?.[0]?.message?.content || '';

	// GEMMA/LLAMA FALLBACK: Catch raw tokens if native interception fails
	if (toolCalls.length === 0) {
		const gemmaRegex = /<\|tool_call>\s*call:\s*([a-zA-Z0-9_]+)([\s\S]*?)<tool_call\|>/g;
		const standardRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

		let match;
		while ((match = gemmaRegex.exec(responseText)) !== null) {
			let name = match[1].trim();
			if (name === 'http_fetch' || name === 'api_fetch') {
				name = 'fetch';
			}

			let argsString = match[2].trim();
			// Sanitize malformed JSON syntax
			argsString = argsString.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ': "$1"');

			toolCalls.push({
				id: `call_${Math.random().toString(36).substring(2, 9)}`,
				type: 'function',
				function: { name, arguments: argsString },
			});
		}

		while ((match = standardRegex.exec(responseText)) !== null) {
			const content = match[1].trim();
			try {
				// Handle both raw JSON and name/args format
				const parsed = JSON.parse(content.replace(/'/g, '"'));
				const name = parsed.name || 'fetch';
				const args = parsed.arguments || parsed;
				toolCalls.push({
					id: `call_${Math.random().toString(36).substring(2, 9)}`,
					type: 'function',
					function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
				});
			} catch (e) {
				console.error('Failed to parse tool call:', content, e);
			}
		}

		// Strip the raw tokens from the visible response
		responseText = responseText
			.replace(/<\|tool_call>[\s\S]*?<tool_call\|>/g, '')
			.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
			.trim();
	}

	if (toolCalls.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const normalizedToolCalls = toolCalls.map((call: any, index: number) => {
			const name = call.name || (call.function && call.function.name);
			let args = call.arguments || (call.function && call.function.arguments);
			if (typeof args !== 'string') {
				try {
					args = JSON.stringify(args);
				} catch {
					args = '{}';
				}
			}
			return {
				id: call.id || `call_${Math.random().toString(36).substring(2, 9)}_${index}`,
				type: 'function',
				function: { name, arguments: args },
			};
		});

		messages.push({
			role: 'assistant',
			content: responseText,
			tool_calls: normalizedToolCalls,
		});

		for (const call of normalizedToolCalls) {
			const toolName = call.function.name;
			const toolId = call.id;
			const toolArgsString = call.function.arguments;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const tool = tools.find((t: any) => t.name === toolName);

			if (tool && tool.function) {
				try {
					let parsedArgs;
					try {
						parsedArgs = JSON.parse(toolArgsString);
					} catch {
						parsedArgs = toolArgsString;
					}
					const result = await tool.function(parsedArgs);
					messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: String(result) });
				} catch (e) {
					messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: String(e) });
				}
			} else {
				messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: 'Tool not found' });
			}
		}

		return await runModel(messages, true);
	}

	return response;
}

/**
 * Stream AI response to Telegram, with periodic updates to avoid rate limits.
 */
export async function streamAiResponseToTelegram(
	bot: TelegramExecutionContext,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ai: any,
	modelId: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	messages: any[],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	task: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tools: any[] = [],
): Promise<string> {
	const botApi = new TelegramApi();

	// Use updateId as a stable draftId if available, otherwise generate one
	const draftId = task.updateId || Date.now();

	// Skip Thinking message for guest messages and business messages as they only support one response or don't support drafts
	if (task.updateType !== 'guest_message' && task.updateType !== 'business_message') {
		await botApi.sendMessageDraft(`https://api.telegram.org/bot${task.telegramToken || task.token}`, {
			chat_id: task.chatId,
			text: 'Thinking...',
			parse_mode: 'HTML',
			message_thread_id: task.threadId,
			business_connection_id: task.businessConnectionId,
			draft_id: draftId,
		});
	}

	let streamContent = '';
	let lastUpdate = Date.now();

	try {
		const aiResponse = await customRunWithTools(
			ai,
			modelId,
			{
				messages,
				tools,
			},
			{ streamFinalResponse: true },
		);

		if (typeof aiResponse === 'object' && aiResponse !== null && 'getReader' in aiResponse) {
			const stream = aiResponse as ReadableStream;
			const reader = stream.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') {
							break;
						}
						try {
							const parsed = JSON.parse(data);
							const text = extractText(parsed);
							streamContent += text;
						} catch {
							// Ignore malformed JSON chunks
						}
					}
				}

				// Update Telegram every 2 seconds to avoid rate limits
				if (
					task.updateType !== 'guest_message' &&
					task.updateType !== 'business_message' &&
					Date.now() - lastUpdate > 2000 &&
					streamContent.trim()
				) {
					const currentContent = streamContent;
					bot
						.streamReply(await markdownToHtml(currentContent + '...'), draftId, 'HTML')
						.catch((e: Error) => console.error('Streaming error:', e));
					lastUpdate = Date.now();
				}
			}
		} else {
			// Handle static response
			streamContent = extractText(aiResponse);
		}
	} catch (e) {
		console.error('Error reading AI stream:', e);
	}

	// Send final response (blocking)
	if (streamContent.trim()) {
		await bot.streamReply(await markdownToHtml(streamContent), draftId, 'HTML', {}, true);
	}
	return streamContent;
}

/**
 * Creates a mock TelegramExecutionContext for use in environments where the full context isn't available (e.g., Workflows).
 */
export function createMockTelegramExecutionContext(task: Record<string, unknown>): TelegramExecutionContext {
	return {
		chat: { id: task.chatId as string },
		from: { id: task.userId as number },
		update_type: task.updateType as string,
		reply: async (text: string, options: Record<string, unknown> = {}) => {
			const api = new TelegramApi();
			if (task.updateType === 'guest_message' && task.guestQueryId) {
				return await api.answerGuestQuery(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
					guest_query_id: task.guestQueryId as string,
					result: {
						type: 'article',
						id: crypto.randomUUID(),
						title: 'Response',
						input_message_content: { message_text: text, parse_mode: (options.parse_mode || 'HTML') as ParseMode },
					},
				});
			}
			return await api.sendMessage(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
				chat_id: task.chatId as string | number,
				text,
				parse_mode: (options.parse_mode || 'HTML') as ParseMode,
				reply_markup: options.reply_markup as object,
				message_thread_id: task.threadId as number,
				business_connection_id: task.businessConnectionId as string | number,
				reply_to_message_id: task.messageId as string | number,
			});
		},
		streamReply: async (text: string, draft_id: number, parse_mode = '', options: Record<string, unknown> = {}, finish = false) => {
			const api = new TelegramApi();
			if (task.updateType === 'guest_message' || task.updateType === 'business_message') {
				if (finish) {
					if (task.updateType === 'guest_message' && task.guestQueryId) {
						return await api.answerGuestQuery(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
							guest_query_id: task.guestQueryId as string,
							result: {
								type: 'article',
								id: crypto.randomUUID(),
								title: 'Response',
								input_message_content: { message_text: text, parse_mode: (parse_mode || 'HTML') as ParseMode },
							},
						});
					}
					return await api.sendMessage(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
						chat_id: task.chatId as string | number,
						text,
						parse_mode: (parse_mode || 'HTML') as ParseMode,
						reply_markup: options.reply_markup as object,
						message_thread_id: task.threadId as number,
						business_connection_id: task.businessConnectionId as string | number,
						reply_to_message_id: task.messageId as string | number,
					});
				}
				return null;
			}

			if (finish) {
				// Send a final message draft to signal the end of animation
				await api.sendMessageDraft(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
					chat_id: task.chatId as string | number,
					text,
					parse_mode: (parse_mode || 'HTML') as ParseMode,
					draft_id,
					message_thread_id: task.threadId as number,
					business_connection_id: task.businessConnectionId as string | number,
					finish: true,
					...options,
				});

				// Then send the actual final message as a reply
				return await api.sendMessage(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
					chat_id: task.chatId as string | number,
					text,
					parse_mode: (parse_mode || 'HTML') as ParseMode,
					reply_markup: options.reply_markup as object,
					message_thread_id: task.threadId as number,
					business_connection_id: task.businessConnectionId as string | number,
					reply_to_message_id: task.messageId as string | number,
				});
			}

			return await api.sendMessageDraft(`https://api.telegram.org/bot${(task.telegramToken as string) || (task.token as string)}`, {
				chat_id: task.chatId as string | number,
				text,
				parse_mode: (parse_mode || 'HTML') as ParseMode,
				draft_id,
				message_thread_id: task.threadId as number,
				business_connection_id: task.businessConnectionId as string | number,
				finish: false,
				...options,
			});
		},
	} as unknown as TelegramExecutionContext;
}
