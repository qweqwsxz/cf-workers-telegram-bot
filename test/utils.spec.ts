import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../src/utils';

describe('markdownToHtml', () => {
	it('escapes inline code', async () => {
		const input = '`command1 < hello`';
		const output = await markdownToHtml(input);
		expect(output).toContain('<code>command1 &lt; hello</code>');
	});

	it('escapes multiple < in inline code', async () => {
		const input = '`command1 <<< hello`';
		const output = await markdownToHtml(input);
		expect(output).toContain('<code>command1 &lt;&lt;&lt; hello</code>');
	});

	it('escapes href in links', async () => {
		const input = '[link](https://example.com?a=1&b=2)';
		const output = await markdownToHtml(input);
		expect(output).toContain('<a href="https://example.com?a=1&amp;b=2">link</a>');
	});

	it('escapes image alt text and href', async () => {
		const input = '![image <tag>](https://example.com/img.png?x=1&y=2)';
		const output = await markdownToHtml(input);
		expect(output).toContain('<a href="https://example.com/img.png?x=1&amp;y=2">image &lt;tag&gt;</a>');
	});

	it('escapes unsupported HTML tags', async () => {
		const input = 'Testing <unsupported> tag';
		const output = await markdownToHtml(input);
		expect(output).toContain('Testing &lt;unsupported&gt; tag');
	});

	it('allows supported HTML tags', async () => {
		const input = 'Testing <b>supported</b> tag';
		const output = await markdownToHtml(input);
		expect(output).toContain('Testing <b>supported</b> tag');
	});

	it('escapes ampersands in text', async () => {
		const input = 'Rock & Roll';
		const output = await markdownToHtml(input);
		expect(output).toContain('Rock &amp; Roll');
	});

	it('escapes special characters in headings', async () => {
		const input = '# Heading <with> & symbols';
		const output = await markdownToHtml(input);
		expect(output).toContain('<b>Heading &lt;with&gt; &amp; symbols</b>');
	});
});
