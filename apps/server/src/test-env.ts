process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	process.env.DATABASE_URL ??
	"postgresql://visp:visp@127.0.0.1:55432/visp_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-that-is-at-least-32-characters";
process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3000";
process.env.CORS_ORIGIN ??= "http://127.0.0.1:3001";
process.env.HOOK_SECRET ??= "test-hook-secret-that-is-at-least-32-characters";
process.env.KICK_CLIENT_ID ??= "test-kick-client";
process.env.KICK_CLIENT_SECRET ??= "test-kick-secret";
process.env.MEDIAMTX_API_URL ??= "http://100.64.0.10:9997";
process.env.NATIVE_WEB_ORIGIN ??= "http://127.0.0.1:8081";
process.env.PUBLISH_URL_ENCRYPTION_KEY ??=
	"dGVzdC1wdWJsaXNoLXVybC1rZXktMzItYnl0ZXMhISE=";
process.env.RELAY_HOST ??= "relay.test";
process.env.RELAY_PING_URL ??= "https://relay.test/ping";
process.env.S3_ACCESS_KEY_ID ??= "test-access-key";
process.env.S3_BUCKET ??= "test-snapshots";
process.env.S3_ENDPOINT ??= "https://objects.test";
process.env.S3_REGION ??= "test-region";
process.env.S3_SECRET_ACCESS_KEY ??= "test-secret-key";
process.env.TWITCH_CLIENT_ID ??= "test-twitch-client";
process.env.TWITCH_CLIENT_SECRET ??= "test-twitch-secret";
process.env.NODE_ENV ??= "test";
