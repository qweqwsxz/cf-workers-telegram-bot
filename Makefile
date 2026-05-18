.PHONY: build clean deploy

build:
	npm run build

clean:
	rm -rf consumer/dist
	rm -rf webapp/.svelte-kit
	rm -rf bot/dist

deploy:
	cd bot && npm run deploy
	cd consumer && wrangler deploy
	cd webapp && npm run build && wrangler pages deploy .svelte-kit/cloudflare
