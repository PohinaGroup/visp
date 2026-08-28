import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import "./test-env";

const {
	STUDIO_CAPS,
	compositorIsHealthy,
	activeStudioAlert,
	studioAlertKind,
	studioGraphSchema,
	studioLayerRuntimeState,
	studioIsConfigured,
	studioRelayPlan,
	renderStudioAlertLabel,
	promoteStudioPng,
	validateStudioPng,
	validateBrowserSourceUrl,
} = await import("./studio");

const SCENE_ID = "11111111-1111-4111-8111-111111111111";
const textLayer = (id = "22222222-2222-4222-8222-222222222222") => ({
	id,
	type: "text" as const,
	name: "Title",
	visible: true,
	x: 0,
	y: 0,
	width: 640,
	height: 120,
	zIndex: 0,
	text: "Hello",
});

const graph = {
	activeSceneId: SCENE_ID,
	scenes: [
		{
			id: SCENE_ID,
			name: "Main",
			order: 0,
			transition: "cut" as const,
			layers: [textLayer()],
		},
	],
};

function crc32(bytes: Uint8Array) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++)
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
	const chunk = new Uint8Array(data.length + 12);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, data.length);
	chunk.set(Buffer.from(type), 4);
	chunk.set(data, 8);
	view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
	return chunk;
}

function pngFixture(input: {
	bitDepth?: number;
	colorType?: number;
	width?: number;
	height?: number;
	decoded?: Uint8Array;
	compressed?: Uint8Array;
}) {
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, input.width ?? 1);
	view.setUint32(4, input.height ?? 1);
	header[8] = input.bitDepth ?? 8;
	header[9] = input.colorType ?? 0;
	const data =
		input.compressed ?? deflateSync(input.decoded ?? Uint8Array.from([0, 255]));
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		pngChunk("IHDR", header),
		pngChunk("IDAT", data),
		pngChunk("IEND", new Uint8Array()),
	]);
}

function pngWithChunks(chunks: ReadonlyArray<readonly [string, Uint8Array]>) {
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		...chunks.map(([type, data]) => pngChunk(type, data)),
	]);
}

function pngHeader(bitDepth = 8, colorType = 0) {
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, 1);
	view.setUint32(4, 1);
	header[8] = bitDepth;
	header[9] = colorType;
	return header;
}

describe("Studio graph contract", () => {
	test("accepts the saved normalized graph and publishes the documented caps", () => {
		expect(studioGraphSchema.parse(graph)).toEqual(graph);
		expect(STUDIO_CAPS).toEqual({
			scenes: 3,
			layersPerScene: 8,
			browsers: 2,
			alerts: 1,
		});
	});

	test("rejects duplicate scene orders and layer z-indexes", () => {
		expect(() =>
			studioGraphSchema.parse({
				...graph,
				scenes: [
					graph.scenes[0],
					{ ...graph.scenes[0], id: crypto.randomUUID() },
				],
			}),
		).toThrow("Scene orders must be unique");
		expect(() =>
			studioGraphSchema.parse({
				...graph,
				scenes: [
					{
						...graph.scenes[0],
						layers: [
							textLayer(),
							{ ...textLayer(crypto.randomUUID()), zIndex: 0 },
						],
					},
				],
			}),
		).toThrow("Layer z-indexes must be unique within a scene");
	});

	test("maps provider alerts to configured Studio kinds and expires them", () => {
		expect(studioAlertKind("follow")).toBe("follow");
		expect(studioAlertKind("gift")).toBe("sub");
		expect(studioAlertKind("cheer")).toBe("donation");
		expect(studioAlertKind("raid")).toBeNull();
		const now = new Date("2026-08-26T12:00:10.000Z");
		expect(
			activeStudioAlert(
				"follow",
				"Ada followed",
				new Date("2026-08-26T12:00:05.000Z"),
				now,
			),
		).toEqual({
			event: "follow",
			label: "Ada followed",
			at: "2026-08-26T12:00:05.000Z",
		});
		expect(
			activeStudioAlert(
				"follow",
				"Ada followed",
				new Date("2026-08-26T11:59:59.000Z"),
				now,
			),
		).toBeNull();
		expect(activeStudioAlert(null, "Alert", new Date(), now)).toBeNull();
	});

	test("falls back only when an actual alert label render fails", () => {
		const alert = {
			id: "follow-1",
			provider: "twitch",
			kind: "follow",
			sentAt: "2026-08-26T12:00:00.000Z",
			name: "Ada",
		} as const;
		expect(renderStudioAlertLabel(alert, () => "Ada followed")).toBe(
			"Ada followed",
		);
		expect(renderStudioAlertLabel(alert, () => "   ")).toBe("Alert");
		expect(
			renderStudioAlertLabel(alert, () => {
				throw new Error("widget failed");
			}),
		).toBe("Alert");
		const now = new Date("2026-08-26T12:00:10.000Z");
		expect(
			activeStudioAlert(
				"follow",
				"Alert",
				new Date("2026-08-26T12:00:05.000Z"),
				now,
			),
		).toMatchObject({ event: "follow", label: "Alert" });
		expect(
			activeStudioAlert(
				"follow",
				"Alert",
				new Date("2026-08-26T11:59:59.000Z"),
				now,
			),
		).toBeNull();
	});

	test("uses an event-only fallback for missing labels and expires it", () => {
		const at = new Date("2026-08-26T12:00:00.000Z");
		const now = new Date("2026-08-26T12:00:09.999Z");
		expect(activeStudioAlert("follow", null, at, now)).toEqual({
			event: "follow",
			label: "Alert",
			at: at.toISOString(),
		});
		expect(activeStudioAlert("sub", "   ", at, now)?.label).toBe("Alert");
		expect(activeStudioAlert(null, null, at, now)).toBeNull();
		expect(
			activeStudioAlert("donation", null, at, new Date(at.getTime() + 10_001)),
		).toBeNull();
	});

	test("preserves runtime failures unless the user explicitly re-enables", () => {
		expect(studioLayerRuntimeState(true, undefined)).toBe(true);
		expect(studioLayerRuntimeState(true, true)).toBe(true);
		expect(studioLayerRuntimeState(true, false)).toBe(false);
		expect(studioLayerRuntimeState(false, undefined)).toBe(false);
	});

	test("accepts only bounded PNG bytes and dimensions", () => {
		const png = Uint8Array.from(
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
				"base64",
			),
		);
		expect(validateStudioPng(png)).toEqual({ width: 1, height: 1 });
		expect(() => validateStudioPng(new Uint8Array(24))).toThrow("valid PNG");
		expect(() => validateStudioPng(png.slice(0, -1))).toThrow("valid PNG");
		const corrupt = png.slice();
		corrupt[corrupt.length - 8] = (corrupt[corrupt.length - 8] ?? 0) ^ 1;
		expect(() => validateStudioPng(corrupt)).toThrow("valid PNG");
		expect(() =>
			validateStudioPng(new Uint8Array(10 * 1024 * 1024 + 1)),
		).toThrow("10 MB");
		expect(() =>
			validateStudioPng(
				pngFixture({
					width: 7680,
					height: 4320,
					bitDepth: 16,
					colorType: 6,
				}),
			),
		).toThrow("dimensions are unsupported");
	});

	test("promotes verified bytes away from the client-writable staging key", async () => {
		const png = Uint8Array.from(
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
				"base64",
			),
		);
		const objects = new Map<string, Uint8Array>([["staging/upload", png]]);
		const promoted = await promoteStudioPng(
			"staging/upload",
			"verified/user/asset",
			{
				read: async (key) => objects.get(key) ?? new Uint8Array(),
				write: async (key, bytes) => {
					objects.set(key, bytes.slice());
				},
				delete: async (key) => {
					objects.delete(key);
				},
			},
		);
		expect(promoted.key).toStartWith("verified/user/asset/");
		expect(objects.has("staging/upload")).toBe(false);
		objects.set("staging/upload", new Uint8Array([1, 2, 3]));
		expect(objects.get(promoted.key)).toEqual(png);
	});

	test("rejects undecodable PNG image data and invalid IHDR combinations", () => {
		expect(() =>
			validateStudioPng(pngFixture({ bitDepth: 1, colorType: 2 })),
		).toThrow("PNG format is unsupported");
		expect(() =>
			validateStudioPng(pngFixture({ compressed: Uint8Array.from([1, 2, 3]) })),
		).toThrow("valid PNG");
		expect(() =>
			validateStudioPng(pngFixture({ decoded: Uint8Array.from([0]) })),
		).toThrow("valid PNG");
		expect(() =>
			validateStudioPng(pngFixture({ decoded: Uint8Array.from([5, 255]) })),
		).toThrow("valid PNG");
	});

	test("enforces the PNG critical-chunk state machine", () => {
		const header = pngHeader();
		const data = deflateSync(Uint8Array.from([0, 255]));
		const end = ["IEND", new Uint8Array()] as const;
		for (const chunks of [
			[["IHDR", header], ["IHDR", header], ["IDAT", data], end],
			[["IHDR", header], ["ABCD", new Uint8Array()], ["IDAT", data], end],
			[
				["IHDR", header],
				["PLTE", Uint8Array.from([0, 0, 0])],
				["IDAT", data],
				end,
			],
			[["IHDR", header], end],
		] as const) {
			expect(() => validateStudioPng(pngWithChunks(chunks))).toThrow(
				"valid PNG",
			);
		}

		const paletteHeader = pngHeader(8, 3);
		const palette = Uint8Array.from([0, 0, 0]);
		const indexedData = deflateSync(Uint8Array.from([0, 0]));
		for (const chunks of [
			[
				["IHDR", paletteHeader],
				["PLTE", palette],
				["PLTE", palette],
				["IDAT", indexedData],
				end,
			],
			[["IHDR", paletteHeader], ["IDAT", indexedData], ["PLTE", palette], end],
			[["IHDR", paletteHeader], ["IDAT", indexedData], end],
		] as const) {
			expect(() => validateStudioPng(pngWithChunks(chunks))).toThrow(
				"valid PNG",
			);
		}

		const split = Math.floor(data.length / 2);
		expect(() =>
			validateStudioPng(
				pngWithChunks([
					["IHDR", header],
					["IDAT", data.subarray(0, split)],
					["tEXt", new Uint8Array()],
					["IDAT", data.subarray(split)],
					end,
				]),
			),
		).toThrow("valid PNG");
	});

	test("does not treat a compositor heartbeat as a configured Studio", () => {
		for (const healthy of [false, true]) {
			expect(
				studioIsConfigured({ version: 0, compositorHealthy: healthy }),
			).toBe(false);
		}
		expect(studioIsConfigured({ version: 1, compositorHealthy: false })).toBe(
			true,
		);
	});

	test("rejects every server-side cap", () => {
		expect(() =>
			studioGraphSchema.parse({
				...graph,
				scenes: Array.from({ length: 4 }, (_, index) => ({
					...graph.scenes[0],
					id: `${index + 1}1111111-1111-4111-8111-111111111111`,
					order: index,
				})),
			}),
		).toThrow("Scene limit reached (3)");
		expect(() =>
			studioGraphSchema.parse({
				...graph,
				scenes: [
					{
						...graph.scenes[0],
						layers: Array.from({ length: 9 }, (_, i) =>
							textLayer(`${i + 1}2222222-2222-4222-8222-222222222222`),
						),
					},
				],
			}),
		).toThrow("Layer limit reached (8)");
	});

	test("bounds the 1080p canvas and active render pixel budget", () => {
		const full = { ...textLayer(), width: 1920, height: 1080 };
		expect(
			studioGraphSchema.parse({
				...graph,
				scenes: [
					{
						...graph.scenes[0],
						layers: [full, { ...full, id: crypto.randomUUID(), zIndex: 1 }],
					},
				],
			}),
		).toBeTruthy();
		expect(() =>
			studioGraphSchema.parse({
				...graph,
				scenes: [
					{
						...graph.scenes[0],
						layers: [
							full,
							{ ...full, id: crypto.randomUUID(), zIndex: 1 },
							{ ...full, id: crypto.randomUUID(), zIndex: 2 },
						],
					},
				],
			}),
		).toThrow("pixel budget");
		expect(() =>
			studioGraphSchema.parse({
				...graph,
				scenes: [
					{
						...graph.scenes[0],
						layers: [{ ...full, x: 1 }],
					},
				],
			}),
		).toThrow("canvas");
	});

	test("rejects private, local, credentialed, and non-HTTPS browser URLs", () => {
		for (const url of [
			"http://example.com",
			"https://localhost/widget",
			"https://127.0.0.1/widget",
			"https://10.0.0.1/widget",
			"https://169.254.169.254/latest/meta-data",
			"https://100.64.0.1/widget",
			"https://[::1]/widget",
			"https://[fc00::1]/widget",
			"https://[::ffff:127.0.0.1]/widget",
			"https://user:secret@example.com/widget",
		]) {
			expect(() => validateBrowserSourceUrl(url)).toThrow();
		}
		expect(validateBrowserSourceUrl("https://widgets.example.com/alert")).toBe(
			"https://widgets.example.com/alert",
		);
	});

	test("uses composited program only for healthy enabled cloud mode", () => {
		expect(
			studioRelayPlan({
				cloudEnabled: true,
				compositorHealthy: true,
				mode: "cloud_studio",
				programUrl: "rtsp://127.0.0.1:8554/program/path-1",
			}),
		).toEqual({
			mode: "program",
			inputUrl: "rtsp://127.0.0.1:8554/program/path-1",
		});
		for (const input of [
			{
				cloudEnabled: false,
				compositorHealthy: true,
				mode: "cloud_studio" as const,
			},
			{
				cloudEnabled: true,
				compositorHealthy: false,
				mode: "cloud_studio" as const,
			},
			{ cloudEnabled: true, compositorHealthy: true, mode: "obs" as const },
		]) {
			expect(studioRelayPlan(input)).toEqual({ mode: "passthrough" });
		}
	});

	test("treats a silent compositor as unhealthy", () => {
		const now = new Date("2026-08-26T12:00:10.000Z");
		expect(
			compositorIsHealthy(true, new Date("2026-08-26T12:00:08.000Z"), now),
		).toBe(true);
		expect(
			compositorIsHealthy(true, new Date("2026-08-26T12:00:04.000Z"), now),
		).toBe(false);
		expect(compositorIsHealthy(false, now, now)).toBe(false);
	});
});
