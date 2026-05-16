import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.toml' },
		}),
	],
	test: {
		include: ['test/**/*.spec.ts'],
		// In Vitest 4, poolOptions are top-level
	},
	poolOptions: {
		workers: {
			wrangler: { configPath: './wrangler.toml' },
		},
	},
});
