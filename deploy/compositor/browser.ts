import { lookup } from "node:dns/promises";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import {
	isPublicAddress,
	validateBrowserSourceUrl,
} from "../../packages/api/src/studio-browser-url";
import { gateBrowserRequest, type PausedRequest } from "./browser-security";
import { openCdpPipe } from "./cdp-pipe";

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
	// CDP over inherited pipes: no debugging port that other local processes
	// (including sibling workers under the same uid) could connect to.
	const chrome = Bun.spawn(
		[
			process.env.CHROMIUM_BIN ?? "chromium",
			"--headless",
			"--disable-background-networking",
			"--disable-extensions",
			"--disable-sync",
			"--enable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests",
			`--host-resolver-rules=MAP ${url.hostname} ${addresses[0]?.address}, MAP * ~NOTFOUND`,
			"--remote-debugging-pipe",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
	);
	let cdp: ReturnType<typeof openCdpPipe>;
	try {
		cdp = openCdpPipe(chrome);
	} catch (error) {
		chrome.kill();
		await chrome.exited;
		throw error;
	}
	const close = async () => {
		chrome.kill();
		await chrome.exited;
		cdp.close();
	};
	try {
		let sessionId = "";
		let mainFrameId = "";
		// Set only when the top-level navigation itself is blocked. Blocked
		// subresources are failed in the page and never reach capture().
		let blocked: Error | undefined;
		const command = (method: string, params: object = {}) =>
			cdp.send(method, params, sessionId);
		cdp.onEvent((event) => {
			if (
				event.sessionId === sessionId &&
				event.method === "Fetch.requestPaused" &&
				event.params
			)
				void gateBrowserRequest(
					event.params as PausedRequest,
					url.hostname,
					mainFrameId,
					command,
				).then((fatal) => {
					blocked ??= fatal;
				});
		});
		const { targetId } = (await cdp.send("Target.createTarget", {
			url: "about:blank",
		})) as { targetId: string };
		({ sessionId } = (await cdp.send("Target.attachToTarget", {
			targetId,
			flatten: true,
		})) as { sessionId: string });
		await command("Page.enable");
		({
			frameTree: {
				frame: { id: mainFrameId },
			},
		} = (await command("Page.getFrameTree")) as {
			frameTree: { frame: { id: string } };
		});
		await command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
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
			command,
			async capture() {
				if (blocked) throw blocked;
				if (chrome.exitCode !== null || cdp.closed)
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
