import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
	isPublicAddress,
	validateBrowserSourceUrl,
} from "../../packages/api/src/studio-browser-url";
import { validateBrowserRequest } from "./browser-security";

export type BrowserLayer = {
	id: string;
	url?: string | null;
	width: number;
	height: number;
};

export async function openBrowser(work: string, layer: BrowserLayer) {
	const url = new URL(validateBrowserSourceUrl(layer.url ?? ""));
	const addresses = await lookup(url.hostname, { all: true, verbatim: true });
	if (
		!addresses.length ||
		addresses.some(({ address }) => !isPublicAddress(address))
	)
		throw new Error("browser hostname did not resolve publicly");
	const id = layer.id.replace(/[^a-zA-Z0-9_-]/g, "");
	const file = `${work}/${id}.png`;
	const profile = `${work}/chrome-${id}`;
	await rm(profile, { recursive: true, force: true });
	await mkdir(profile, { mode: 0o700 });
	const chrome = Bun.spawn(
		[
			process.env.CHROMIUM_BIN ?? "chromium",
			"--headless",
			"--disable-background-networking",
			"--disable-extensions",
			"--disable-sync",
			"--enable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests",
			`--host-resolver-rules=MAP ${url.hostname} ${addresses[0]?.address}, MAP * ~NOTFOUND`,
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdout: "ignore", stderr: "ignore" },
	);
	let socket: WebSocket | undefined;
	const close = async () => {
		socket?.close();
		chrome.kill();
		await chrome.exited;
	};
	try {
		let port = "";
		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				port =
					(await readFile(`${profile}/DevToolsActivePort`, "utf8")).split(
						"\n",
					)[0] ?? "";
				if (port) break;
			} catch {}
			await Bun.sleep(50);
		}
		if (!port) throw new Error("browser debugging endpoint unavailable");
		const targetResponse = await fetch(
			`http://127.0.0.1:${port}/json/new?about:blank`,
			{ method: "PUT" },
		);
		if (!targetResponse.ok) throw new Error("browser target unavailable");
		const target = (await targetResponse.json()) as {
			webSocketDebuggerUrl: string;
		};
		const cdp = new WebSocket(target.webSocketDebuggerUrl);
		socket = cdp;
		await new Promise<void>((resolve, reject) => {
			cdp.addEventListener("open", () => resolve(), { once: true });
			cdp.addEventListener(
				"error",
				() => reject(new Error("browser CDP unavailable")),
				{ once: true },
			);
		});
		let commandId = 0;
		const pending = new Map<
			number,
			{
				resolve: (value: unknown) => void;
				reject: (error: Error) => void;
				timer: ReturnType<typeof setTimeout>;
			}
		>();
		let blocked: Error | undefined;
		const command = (method: string, params: object = {}) =>
			new Promise<unknown>((resolve, reject) => {
				const id = ++commandId;
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(new Error(`browser CDP command timed out: ${method}`));
				}, 5_000);
				pending.set(id, { resolve, reject, timer });
				cdp.send(JSON.stringify({ id, method, params }));
			});
		const rejectPending = () => {
			for (const { reject, timer } of pending.values()) {
				clearTimeout(timer);
				reject(new Error("browser CDP disconnected"));
			}
			pending.clear();
		};
		cdp.addEventListener("error", rejectPending);
		cdp.addEventListener("close", rejectPending);
		cdp.addEventListener("message", (message) => {
			const payload = JSON.parse(String(message.data)) as {
				id?: number;
				method?: string;
				params?: { requestId: string; request: { url: string } };
				result?: unknown;
				error?: { message: string };
			};
			if (payload.id) {
				const command = pending.get(payload.id);
				if (command) {
					clearTimeout(command.timer);
					if (payload.error) command.reject(new Error(payload.error.message));
					else command.resolve(payload.result);
				}
				pending.delete(payload.id);
			}
			if (payload.method === "Fetch.requestPaused" && payload.params) {
				const { requestId, request } = payload.params;
				void validateBrowserRequest(request.url, url.hostname)
					.then(() => command("Fetch.continueRequest", { requestId }))
					.catch((error) => {
						blocked =
							error instanceof Error
								? error
								: new Error("browser request blocked");
						return command("Fetch.failRequest", {
							requestId,
							errorReason: "BlockedByClient",
						}).catch(() => undefined);
					});
			}
		});
		await command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
		await command("Page.enable");
		await command("Emulation.setDeviceMetricsOverride", {
			width: layer.width,
			height: layer.height,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await command("Page.navigate", { url: url.toString() });
		await Bun.sleep(1_500);
		return {
			close,
			async capture() {
				if (blocked) throw blocked;
				if (chrome.exitCode !== null || cdp.readyState !== WebSocket.OPEN)
					throw new Error("browser exited");
				const capture = (await command("Page.captureScreenshot", {
					format: "png",
				})) as { data?: string };
				if (blocked) throw blocked;
				if (!capture.data) throw new Error("browser capture unavailable");
				await writeFile(`${file}.next`, Buffer.from(capture.data, "base64"), {
					mode: 0o600,
				});
				await rename(`${file}.next`, file);
				return file;
			},
		};
	} catch (error) {
		await close();
		throw error;
	}
}
