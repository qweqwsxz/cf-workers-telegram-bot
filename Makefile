.PHONY: build test lint format clean deploy

build:
	npm run build:all

test:
	npm run test:all

lint:
	npm run lint:all

format:
	npm run format:all

clean:
	rm -rf dist
	rm -rf ai-workflow/dist
	rm -rf consumer/dist
	rm -rf webapp/.svelte-kit

deploy:
	wrangler deploy
	cd ai-workflow && wrangler deploy
	cd consumer && wrangler deploy
	cd webapp && npm run build && wrangler pages deploy .svelte-kit/cloudflare
