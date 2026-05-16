import { describe, it, expect, vi, beforeEach } from 'vitest';
import TelegramBot from '../src/telegram_bot';

describe('bot-to-bot TTL', () => {
  let bot: TelegramBot;

  beforeEach(() => {
    bot = new TelegramBot('123456789:ABC');
  });

  it('should allow self-responses up to TTL', async () => {
    const handler = vi.fn().mockImplementation(() => Promise.resolve(new Response('handler_called')));
    bot.on(':message', handler);

    const chatId = 123;
    const botId = 123456789;

    const request = () => new Request('http://example.com/123456789:ABC', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          from: { id: botId },
          chat: { id: chatId, type: 'private' },
          text: 'Hello from myself',
          message_id: 1
        }
      }),
    });

    // First response
    let response = await bot.handle(request());
    expect(await response.text()).toBe('handler_called');
    expect(handler).toHaveBeenCalledTimes(1);

    // Second response
    response = await bot.handle(request());
    expect(await response.text()).toBe('handler_called');
    expect(handler).toHaveBeenCalledTimes(2);

    // Third response (TTL is 2 by default)
    response = await bot.handle(request());
    expect(await response.text()).toBe('ok');
    expect(handler).toHaveBeenCalledTimes(2); // Should not have been called
  });

  it('should allow configuring TTL via command', async () => {
    const chatId = 123;
    const botId = 123456789;

    // Register TTL command manually as it would be in the app
    bot.command('ttl', async (ctx) => {
      const newTtl = parseInt(ctx.args[1]);
      if (newTtl >= 1 && newTtl <= 5) {
        ctx.bot.ttl = newTtl;
        await ctx.reply(`TTL set to ${ctx.bot.ttl}`);
      } else {
        await ctx.reply(`Invalid TTL. Please use a value between 1 and 5. Current TTL: ${ctx.bot.ttl}`);
      }
    });

    // Send /ttl 3
    const ttlRequest = new Request('http://example.com/123456789:ABC', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          from: { id: 456 }, // From someone else
          chat: { id: chatId, type: 'private' },
          text: '/ttl 3',
          entities: [{ type: 'bot_command', offset: 0, length: 4 }],
          message_id: 1
        }
      }),
    });

    // Mock fetch for ctx.reply
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    await bot.handle(ttlRequest);
    expect(bot.ttl).toBe(3);

    const handler = vi.fn().mockImplementation(() => Promise.resolve(new Response('handler_called')));
    bot.on(':message', handler);

    const selfRequest = () => new Request('http://example.com/123456789:ABC', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          from: { id: botId },
          chat: { id: chatId, type: 'private' },
          text: 'Hello',
          message_id: 2
        }
      }),
    });

    // 1
    await bot.handle(selfRequest());
    // 2
    await bot.handle(selfRequest());
    // 3
    await bot.handle(selfRequest());
    // 4 (fail)
    const response = await bot.handle(selfRequest());
    expect(await response.text()).toBe('ok');
    expect(handler).toHaveBeenCalledTimes(3);

    globalThis.fetch = originalFetch;
  });

  it('should reset TTL when someone else speaks', async () => {
     const bot2 = new TelegramBot('123456789:DEF');
     const handler = vi.fn().mockImplementation(() => Promise.resolve(new Response('handler_called')));
     bot2.on(':message', handler);

     const chatId = 124;
     const botId = 123456789;

     const selfRequest = () => new Request('http://example.com/123456789:DEF', {
       method: 'POST',
       body: JSON.stringify({
         message: {
           from: { id: botId },
           chat: { id: chatId, type: 'private' },
           text: 'Hello',
           message_id: 1
         }
       }),
     });

     const otherRequest = () => new Request('http://example.com/123456789:DEF', {
       method: 'POST',
       body: JSON.stringify({
         message: {
           from: { id: 456 },
           chat: { id: chatId, type: 'private' },
           text: 'Hi',
           message_id: 2
         }
       }),
     });

     // Bot speaks twice
     await bot2.handle(selfRequest());
     await bot2.handle(selfRequest());
     
     // Third time should fail
     let response = await bot2.handle(selfRequest());
     expect(await response.text()).toBe('ok');
     expect(handler).toHaveBeenCalledTimes(2);

     // Other person speaks
     await bot2.handle(otherRequest());
     expect(handler).toHaveBeenCalledTimes(3);

     // Bot can speak again
     await bot2.handle(selfRequest());
     expect(handler).toHaveBeenCalledTimes(4);
  });
});
