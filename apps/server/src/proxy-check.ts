import "./test-env";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Elysia } from "elysia";
import { agentRoutes } from "./agent";
import { machineRoutes } from "./machine";
import { subtitlesRoutes } from "./subtitles";

// Run the committed portal routes against real anonymous API handlers.
const app = new Elysia()
	.use(subtitlesRoutes)
	.use(machineRoutes)
	.use(agentRoutes);
const api = Bun.serve({ hostname: "0.0.0.0", port: 0, fetch: app.handle });
const portal = Bun.serve({
	hostname: "0.0.0.0",
	port: 0,
	fetch: () => new Response("portal"),
});
const directory = await mkdtemp(join(tmpdir(), "visp-proxy-"));
const container = `visp-proxy-${process.pid}`;
async function docker(...args: string[]) {
	const result = Bun.spawn(["docker", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = await new Response(result.stdout).text();
	const error = await new Response(result.stderr).text();
	assert.equal(await result.exited, 0, error);
	return output.trim();
}
try {
	for (const file of ["deploy/app/Caddyfile", "deploy/staging/app.caddy"]) {
		const source = await Bun.file(file).text();
		const start = source.indexOf(
			file.includes("staging")
				? "staging.visp-stream.com {"
				: "{$APP_DOMAIN} {",
		);
		const routes = source
			.slice(start, source.indexOf("\n}\n", start) + 3)
			.replace(/^.*\{\n/, ":80 {\n")
			.replaceAll("{$MULTICHAT_DOMAIN}", "multichat.test")
			.replaceAll("multichat.staging.visp-stream.com", "multichat.test")
			.replace(/127\.0\.0\.1:3[01]00/g, `host.docker.internal:${api.port}`)
			.replace(/127\.0\.0\.1:3[01]01/g, `host.docker.internal:${portal.port}`);
		// The vhost imports the file's top-level snippets.
		const snippets = source.match(/^\([\w-]+\) \{\n[\s\S]*?^\}\n/gm) ?? [];
		// Exercise both trusted relay and untrusted public clients without real hosts.
		for (const [allow, expected] of [
			[true, 401],
			[false, 403],
		] as const) {
			await Bun.write(
				join(directory, "Caddyfile"),
				"{\n admin off\n}\n" +
					snippets.join("\n") +
					routes.replace(
						/remote_ip[^\n]+/,
						`remote_ip ${allow ? "0.0.0.0/0 ::/0" : "192.0.2.1"}`,
					),
			);
			await docker(
				"run",
				"--detach",
				"--rm",
				"--name",
				container,
				"--add-host",
				"host.docker.internal:host-gateway",
				"-p",
				"127.0.0.1::80",
				"-v",
				`${directory}:/etc/caddy:ro`,
				"caddy:2-alpine",
			);
			try {
				const address = await docker("port", container, "80/tcp");
				const base = `http://${address}`;
				await Bun.$`curl --fail --silent --retry 10 --retry-all-errors --retry-delay 1 ${base}`.quiet();
				const home = await fetch(base);
				assert.equal(await home.text(), "portal");
				assert.equal(home.headers.get("x-frame-options"), "DENY");
				assert.equal(
					home.headers.get("content-security-policy"),
					"frame-ancestors 'none'",
				);
				assert.equal(home.headers.get("x-content-type-options"), "nosniff");
				assert.match(
					home.headers.get("strict-transport-security") ?? "",
					/max-age=31536000/,
				);
				// Both browser sources must load inside the Studio editor.
				for (const path of ["/overlay?t=x", "/live", "/live/"]) {
					const overlay = await fetch(`${base}${path}`);
					assert.equal(
						overlay.headers.get("x-frame-options"),
						"SAMEORIGIN",
						path,
					);
					assert.equal(
						overlay.headers.get("content-security-policy"),
						"frame-ancestors 'self'",
						path,
					);
				}
				for (const path of ["/dashboard", "/studio", "/live/private"]) {
					const page = await fetch(`${base}${path}`);
					assert.equal(page.headers.get("x-frame-options"), "DENY", path);
				}
				const discovery = await fetch(
					`${base}/.well-known/agent-configuration`,
				);
				assert.equal(discovery.status, 200);
				assert.equal(
					((await discovery.json()) as { provider_name?: string })
						.provider_name,
					"VISP",
				);
				assert.equal(
					(await fetch(`${base}/api/agent/streams`, { method: "POST" })).status,
					401,
				);
				const chatRoot = await fetch(`${base}/chat`, { redirect: "manual" });
				assert.equal(chatRoot.status, 308);
				assert.equal(
					chatRoot.headers.get("location"),
					"https://multichat.test/",
				);
				const chat = await fetch(`${base}/chat/overlay`, {
					redirect: "manual",
				});
				assert.equal(chat.status, 308);
				assert.equal(
					chat.headers.get("location"),
					"https://multichat.test/overlay",
				);
				assert.equal(
					(await fetch(`${base}/api/subtitles/token`, { method: "POST" }))
						.status,
					401,
				);
				assert.equal(
					(
						await fetch(`${base}/api/hooks/ready`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ path: "test" }),
						})
					).status,
					expected,
				);
				if (allow) {
					// The hook handler parses its JSON body, so the edge cap is what answers.
					assert.equal(
						(
							await fetch(`${base}/api/hooks/ready`, {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({ path: "x".repeat(2 * 1024 * 1024) }),
							})
						).status,
						413,
					);
				}
			} finally {
				await docker("stop", container);
			}
		}
	}
	console.log(
		"ok: production and staging proxy routes, security headers, agent endpoints, body caps, and machine endpoint protection",
	);
} finally {
	api.stop(true);
	portal.stop(true);
	await rm(directory, { recursive: true, force: true });
}
