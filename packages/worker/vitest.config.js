import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: '../../vitest.toml' },
			},
		},
	},
	plugins: [
		cloudflareTest({
			wrangler: { configPath: '../../vitest.toml' },
		}),
	],
});
