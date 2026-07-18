#!/bin/sh
set -eu

compose_file="compose.test.yml"
database_url="postgresql://visp:visp@127.0.0.1:55432/visp_test"

cleanup() {
	docker compose -f "$compose_file" down --volumes
}
trap cleanup EXIT INT TERM

docker compose -f "$compose_file" up --detach --wait

(
	cd packages/db
	DATABASE_URL="$database_url" bun run db:migrate
)

DATABASE_URL="$database_url" \
	TEST_DATABASE_URL="$database_url" \
	BETTER_AUTH_SECRET="integration-secret-that-is-at-least-32-characters" \
	BETTER_AUTH_URL="http://127.0.0.1:3000" \
	CORS_ORIGIN="http://127.0.0.1:3001" \
HOOK_SECRET="integration-hook-secret-at-least-32-characters" \
KICK_CLIENT_ID="integration-kick-client" \
KICK_CLIENT_SECRET="integration-kick-secret" \
MEDIAMTX_API_URL="http://127.0.0.1:9997" \
	NATIVE_WEB_ORIGIN="http://127.0.0.1:8081" \
	RELAY_HOST="relay.test" \
	RELAY_PING_URL="https://relay.test/ping" \
	TWITCH_CLIENT_ID="integration-client" \
	TWITCH_CLIENT_SECRET="integration-secret" \
	NODE_ENV="test" \
	bun test apps/server/src/machine.integration.test.ts
