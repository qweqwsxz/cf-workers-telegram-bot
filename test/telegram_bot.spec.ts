import { describe, it, expect, vi } from 'vitest';
import TelegramBot from '../src/telegram_bot';
import TelegramApi from '../src/telegram_api';
import Webhook from '../src/webhook';

describe('telegram bot', () => {
  // Test for inline query handling
  it('inline response', async () => {
    const bot = new TelegramBot('123456789').on(':message', async () => {
      return Promise.resolve(new Response('ok'));
    });
    const request = new Request('http://example.com/123456789', {
      method: 'POST',
      body: JSON.stringify({ inline_query: { query: 'hello' } }),
    });
    expect(await (await bot.handle(request)).text()).toBe('ok');
    expect(bot.currentContext.update_type).toBe('inline');
  });

  // Test for message handling
  it('message response', async () => {
    const bot = new TelegramBot('123456789').on(':message', async () => {
      return Promise.resolve(new Response('ok'));
    });
    const request = new Request('http://example.com/123456789', {
      method: 'POST',
      body: JSON.stringify({ message: { text: 'hello' } }),
    });
    expect(await (await bot.handle(request)).text()).toBe('ok');
    expect(bot.currentContext.update_type).toBe('message');
  });

  // Test for guest message handling
  it('guest message response', async () => {
    const bot = new TelegramBot('123456789').on(':guest_message', async () => {
      return Promise.resolve(new Response('ok'));
    });
    const request = new Request('http://example.com/123456789', {
      method: 'POST',
      body: JSON.stringify({ guest_message: { text: 'hello', guest_query_id: 'guest123', chat: { id: 123, type: 'private' } } }),
    });
    expect(await (await bot.handle(request)).text()).toBe('ok');
    expect(bot.currentContext.update_type).toBe('guest_message');
  });

  it('throws error on non-200 telegram api response', async () => {
    const api = new TelegramApi();

    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 400, statusText: 'Bad Request' }));

    try {
      await api.sendMessage('https://api.telegram.org/bot123456789', { chat_id: 123, text: 'hello', parse_mode: 'HTML' });
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect((e as Error).message).toContain('Telegram API error: 400 Bad Request');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws error on non-200 telegram file api response', async () => {
    const api = new TelegramApi();
    const originalFetch = globalThis.fetch;
    
    // First fetch for getFile (returns file path)
    // Second fetch for the actual file
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'foo/bar.jpg' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Error', { status: 404, statusText: 'Not Found' }));

    try {
      await api.getFile('https://api.telegram.org/bot123456789', { file_id: '123' }, '123456789');
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect((e as Error).message).toContain('Telegram File API error: 404 Not Found');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws error on non-200 webhook set response', async () => {
    const webhook = new Webhook('123456789', new Request('https://example.com/123456789'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 500, statusText: 'Internal Server Error' }));

    try {
      await webhook.set();
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect((e as Error).message).toContain('Telegram API error (setWebhook): 500 Internal Server Error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws error on non-200 webhook delete response', async () => {
    const webhook = new Webhook('123456789', new Request('https://example.com/123456789'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 403, statusText: 'Forbidden' }));

    try {
      await webhook.delete();
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect((e as Error).message).toContain('Telegram API error (deleteWebhook): 403 Forbidden');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
