import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function renderStudioHtmlPng(input: {
	width: number;
	height: number;
	html: string;
}) {
	const work = await mkdtemp(join(tmpdir(), "visp-layer-"));
	try {
		await writeFile(join(work, "layer.html"), input.html, { mode: 0o600 });
		const chrome = Bun.spawn(
			[
				process.env.CHROMIUM_BIN ?? "chromium",
				"--headless",
				"--disable-background-networking",
				"--disable-extensions",
				"--disable-sync",
				"--no-first-run",
				"--no-default-browser-check",
				"--hide-scrollbars",
				"--no-pdf-header-footer",
				"--host-resolver-rules=MAP * ~NOTFOUND",
				"--default-background-color=00000000",
				"--force-device-scale-factor=1",
				"--run-all-compositor-stages-before-draw",
				"--virtual-time-budget=1000",
				`--user-data-dir=${work}/profile`,
				`--window-size=${input.width},${input.height}`,
				`--screenshot=${work}/layer.png`,
				`file://${work}/layer.html`,
			],
			{ stdin: "ignore", stdout: "ignore", stderr: "ignore" },
		);
		const timer = setTimeout(() => chrome.kill(), 8_000);
		try {
			if ((await chrome.exited) !== 0)
				throw new Error("Studio layer could not be rendered");
			return await readFile(join(work, "layer.png"));
		} finally {
			clearTimeout(timer);
		}
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}
