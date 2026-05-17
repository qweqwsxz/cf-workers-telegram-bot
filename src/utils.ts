import { marked } from 'marked';

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
			const prefix = ordered ? `${start !== '' && start !== undefined ? Number(start) + i : i + 1}. ` : '• ';
			result += `${prefix}${renderer.listitem(item)}\n`;
		}
		return result;
	};

	renderer.listitem = (item) => {
		return renderer.parser.parse(item.tokens).trim();
	};

	renderer.strong = ({ tokens }) => `<b>${renderer.parser.parseInline(tokens)}</b>`;
	renderer.em = ({ tokens }) => `<i>${renderer.parser.parseInline(tokens)}</i>`;
	const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	renderer.codespan = ({ text }) => `<code>${escapeHtml(text)}</code>`;
	renderer.code = ({ text, lang }) => {
		const escapedText = escapeHtml(text);
		if (lang) {
			return `<pre><code class="language-${lang}">${escapedText}</code></pre>\n`;
		}
		return `<pre><code>${escapedText}</code></pre>\n`;
	};
	renderer.del = ({ tokens }) => `<s>${renderer.parser.parseInline(tokens)}</s>`;

	renderer.link = ({ href, tokens }) => `<a href="${escapeHtml(href)}">${renderer.parser.parseInline(tokens)}</a>`;
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
			'blockquote',
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
		breaks: true,
	});

	const parsed = await marked.parse(s, { renderer });

	// Trim multiple newlines
	return parsed.replace(/\n{3,}/g, '\n\n').trim();
}

export const fetchTool = {
	name: 'fetch',
	description:
		'Make an HTTP request to fetch a website or API, returning the HTML or JSON. You MUST use this tool when the user asks to fetch a URL, visit a website, or make a GET request, instead of writing code.',
	parameters: {
		type: 'object',
		properties: {
			url: { type: 'string', description: 'The URL to fetch' },
			method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
			headers: { type: 'object', description: 'HTTP headers to include in the request' },
			body: { type: 'string', description: 'The request body' },
		},
		required: ['url'],
	},
	function: async ({ url, method, headers, body }: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
		try {
			const res = await fetch(url, {
				method: method || 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Cloudflare Worker Telegram Bot)',
					...headers,
				},
				body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
			});
			const text = await res.text();
			return text.slice(0, 10000);
		} catch (e) {
			return `Error executing fetch: ${String(e)}`;
		}
	},
};

export const searchTool = {
	name: 'search',
	description:
		'Perform a web search using the SearXNG search engine to look up answers, facts, news, and find information from different websites.',
	parameters: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'The search query to search for' },
		},
		required: ['query'],
	},
	function: async (args: { query?: string; q?: string }) => {
		const query = args.query || args.q || '';
		const instances = [
			'https://searxng.site/',
			'https://priv.au/',
			'https://search.mdosch.de/',
			'https://ooglester.com/',
			'https://copp.gg/',
			'https://baresearch.org/',
		];

		const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

		for (const instance of instances) {
			try {
				const url = `${instance}search?q=${encodeURIComponent(query)}&format=json`;
				const res = await fetch(url, {
					method: 'GET',
					headers: {
						'User-Agent': userAgent,
						Accept: 'application/json',
					},
				});
				if (res.status === 200) {
					const text = await res.text();
					const parsed = JSON.parse(text);
					if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
						return text.slice(0, 15000);
					}
				}
			} catch {
				// Continue to next fallback
			}
		}

		// Fallback to Wikipedia Search if all SearXNG instances fail/are rate-limited
		try {
			const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
			const res = await fetch(wikiUrl, {
				headers: { 'User-Agent': userAgent },
			});
			if (res.status === 200) {
				const data = (await res.json()) as {
					query?: {
						search?: Array<{
							title: string;
							snippet: string;
						}>;
					};
				};
				if (data && data.query && Array.isArray(data.query.search)) {
					const wikiResults = data.query.search.map((item) => ({
						title: item.title,
						snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, ''), // strip HTML tags
						url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
					}));
					if (wikiResults.length > 0) {
						return JSON.stringify({ results: wikiResults });
					}
				}
			}
		} catch {
			// Continue to next fallback
		}

		// Final fallback to Google News RSS search for recent general web/news results
		try {
			const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
			const res = await fetch(googleNewsUrl, {
				headers: { 'User-Agent': userAgent },
			});
			if (res.status === 200) {
				const xml = await res.text();
				const items: Array<{ title: string; url: string; snippet: string }> = [];
				const itemRegex = /<item>([\s\S]*?)<\/item>/g;
				let match;
				while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
					const content = match[1];
					const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(content);
					const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(content);
					const descMatch = /<description>([\s\S]*?)<\/description>/.exec(content);

					const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : '';
					const link = linkMatch ? linkMatch[1] : '';
					const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : '';

					if (title && link) {
						items.push({ title, url: link, snippet: desc });
					}
				}
				if (items.length > 0) {
					return JSON.stringify({ results: items });
				}
			}
		} catch {
			// Continue
		}

		return 'Error executing search: All public search instances, Wikipedia fallback, and Google News fallback returned no results.';
	},
};
