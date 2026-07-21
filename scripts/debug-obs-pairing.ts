/**
 * Temporary debug helper: exercise production OBS pairing like the plugin.
 * Usage: bun scripts/debug-obs-pairing.ts [baseUrl]
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = (process.argv[2] ?? "https://visp-stream.com").replace(/\/$/, "");
const LOG = "/Users/joni/koodaus/VISP/.cursor/debug-b39b08.log";
const INGEST =
	"http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c";

function tokenMeta(token: string) {
	const [id = "", secret = "", ...rest] = token.split(".");
	return {
		len: token.length,
		parts: 1 + (secret ? 1 : 0) + rest.length,
		idLen: id.length,
		secretLen: secret.length,
		idPrefix: id.slice(0, 6),
	};
}

function urlMeta(value: string) {
	try {
		const url = new URL(value);
		return {
			scheme: url.protocol.replace(":", ""),
			host: url.host,
			path: url.pathname,
		};
	} catch {
		return { scheme: null, host: null, path: null, raw: value };
	}
}

async function dbg(
	hypothesisId: string,
	location: string,
	message: string,
	data: Record<string, unknown>,
) {
	const payload = {
		sessionId: "b39b08",
		runId: "post-fix",
		hypothesisId,
		location,
		message,
		data,
		timestamp: Date.now(),
	};
	const line = `${JSON.stringify(payload)}\n`;
	try {
		mkdirSync(dirname(LOG), { recursive: true });
		appendFileSync(LOG, line);
	} catch {
		/* ignore local log failures */
	}
	fetch(INGEST, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Debug-Session-Id": "b39b08",
		},
		body: JSON.stringify(payload),
	}).catch(() => {});
	console.log(`[dbg:${hypothesisId}] ${message}`, data);
}

async function main() {
	console.log(`Base URL: ${BASE}`);
	const codeRes = await fetch(`${BASE}/api/auth/device/code`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ client_id: "visp-obs", scope: "obs" }),
	});
	const codeBody = await codeRes.text();
	await dbg("E", "debug-obs-pairing.ts:code", "device code response", {
		status: codeRes.status,
		bodyPrefix: codeBody.slice(0, 200),
	});
	if (!codeRes.ok) {
		console.error("Could not start device auth", codeRes.status, codeBody);
		process.exit(1);
	}
	const code = JSON.parse(codeBody) as {
		device_code: string;
		user_code: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};
	console.log(`\nApprove in browser: ${code.verification_uri_complete}`);
	console.log(`User code: ${code.user_code}\n`);

	const deadline = Date.now() + code.expires_in * 1000;
	let interval = Math.max(code.interval, 2) * 1000;
	let accessToken = "";

	while (Date.now() < deadline) {
		await Bun.sleep(interval);
		const tokenRes = await fetch(`${BASE}/api/auth/device/token`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: code.device_code,
				client_id: "visp-obs",
			}),
		});
		const tokenBody = await tokenRes.text();
		let parsed: { access_token?: string; error?: string } = {};
		try {
			parsed = JSON.parse(tokenBody) as typeof parsed;
		} catch {
			/* ignore */
		}
		if (tokenRes.ok && parsed.access_token) {
			accessToken = parsed.access_token;
			await dbg("E", "debug-obs-pairing.ts:token", "got device access token", {
				status: tokenRes.status,
				accessTokenLen: accessToken.length,
			});
			break;
		}
		if (parsed.error === "authorization_pending") continue;
		if (parsed.error === "slow_down") {
			interval += 5000;
			continue;
		}
		await dbg("E", "debug-obs-pairing.ts:token", "device token failed", {
			status: tokenRes.status,
			bodyPrefix: tokenBody.slice(0, 200),
		});
		console.error("Device token failed", tokenRes.status, tokenBody);
		process.exit(1);
	}
	if (!accessToken) {
		console.error("Timed out waiting for approval");
		process.exit(1);
	}

	const connectRes = await fetch(`${BASE}/api/obs/connect`, {
		method: "POST",
		headers: { authorization: `Bearer ${accessToken}` },
	});
	const connectBody = await connectRes.text();
	let connected: { controlUrl?: string; token?: string } = {};
	try {
		connected = JSON.parse(connectBody) as typeof connected;
	} catch {
		/* ignore */
	}
	await dbg("A", "debug-obs-pairing.ts:connect", "connect response", {
		status: connectRes.status,
		control: connected.controlUrl ? urlMeta(connected.controlUrl) : null,
		token: connected.token ? tokenMeta(connected.token) : null,
		bodyPrefix: connectBody.slice(0, 160),
	});
	if (!connectRes.ok || !connected.controlUrl || !connected.token) {
		console.error("Connect failed", connectRes.status, connectBody);
		process.exit(1);
	}
	console.log("controlUrl:", connected.controlUrl);
	console.log("token meta:", tokenMeta(connected.token));

	async function tryDevices(label: string, devicesUrl: string) {
		await dbg("A", "debug-obs-pairing.ts:devices", `requesting devices (${label})`, {
			control: urlMeta(connected.controlUrl ?? ""),
			endpoint: urlMeta(devicesUrl),
			token: tokenMeta(connected.token ?? ""),
		});
		const devicesRes = await fetch(devicesUrl, {
			headers: { authorization: `Bearer ${connected.token}` },
			redirect: "manual",
		});
		const devicesBody = await devicesRes.text();
		await dbg("C", "debug-obs-pairing.ts:devices:response", `devices response (${label})`, {
			status: devicesRes.status,
			bodyLen: devicesBody.length,
			bodyPrefix: devicesBody.slice(0, 160),
			location: devicesRes.headers.get("location"),
		});
		console.log(`devices (${label}) status:`, devicesRes.status);
		console.log(`devices (${label}) body:`, devicesBody.slice(0, 300));
		return devicesRes.status;
	}

	const devicesBase = new URL(connected.controlUrl);
	devicesBase.pathname = "/api/obs/devices";
	devicesBase.search = "";
	devicesBase.hash = "";
	const fromControl = await tryDevices("from-controlUrl", devicesBase.toString());
	let httpsStatus = fromControl;
	if (devicesBase.protocol === "http:") {
		const httpsUrl = new URL(devicesBase.toString());
		httpsUrl.protocol = "https:";
		httpsStatus = await tryDevices("https-upgrade", httpsUrl.toString());
	}
	const controlIsHttps = new URL(connected.controlUrl).protocol === "https:";
	await dbg("A", "debug-obs-pairing.ts:summary", "pairing verification summary", {
		controlIsHttps,
		fromControlStatus: fromControl,
		httpsStatus,
	});
	if (!controlIsHttps || fromControl !== 200) {
		console.error(
			"Verification failed: controlUrl must be https and devices must return 200",
		);
		process.exit(1);
	}
	console.log("OK: https controlUrl and devices authorized");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
