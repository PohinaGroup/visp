import "./test-env";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Elysia } from "elysia";
import { machineRoutes } from "./machine";
import { subtitlesRoutes } from "./subtitles";

// Run the committed portal routes against real anonymous API handlers.
const app = new Elysia().use(subtitlesRoutes).use(machineRoutes);
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
		// Exercise both trusted relay and untrusted public clients without real hosts.
		for (const [allow, expected] of [
			[true, 401],
			[false, 403],
		] as const) {
			await Bun.write(
				join(directory, "Caddyfile"),
				"{\n admin off\n}\n" +
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
				assert.equal(await (await fetch(base)).text(), "portal");
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
			} finally {
				await docker("stop", container);
			}
		}
	}
	console.log(
		"ok: production and staging proxy route captions and protect machine endpoints",
	);
} finally {
	api.stop(true);
	portal.stop(true);
	await rm(directory, { recursive: true, force: true });
}
