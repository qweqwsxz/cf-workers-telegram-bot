.PHONY: build clean deploy deploy-bot deploy-webapp release typecheck lint

build:
	npm run build

clean:
	rm -rf webapp/.svelte-kit
	rm -rf bot/dist

typecheck:
	npm run typecheck

lint:
	npm run lint

# Production release: tags the current commit and pushes (see scripts/release.sh).
# Usage: make release ARGS="both"  /  make release ARGS="bot -m 'fix reason'"
release:
	./scripts/release.sh $(ARGS)

deploy-bot:
	npm run deploy --workspace bot

deploy-webapp:
	npm run build --workspace webapp
	npm run deploy --workspace webapp

deploy: deploy-bot deploy-webapp
