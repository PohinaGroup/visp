import { expect, test } from "bun:test";
import {
	reserveStudioPorts,
	STUDIO_PORT_MAX,
	STUDIO_PORT_MIN,
	studioLoopbackUrls,
} from "./ports";
import { studioReceiveUrl } from "./state";

// The port lock is an abstract Unix socket, which only Linux has; the worker
// never runs anywhere else.
const linuxOnly = test.skipIf(process.platform !== "linux");

linuxOnly("concurrent workers never share a loopback feed port", async () => {
	const workers = await Promise.all(
		Array.from({ length: 40 }, () => reserveStudioPorts(3)),
	);
	try {
		const ports = workers.flatMap(({ ports }) => ports);
		expect(new Set(ports).size).toBe(ports.length);
		for (const port of ports) {
			expect(port).toBeGreaterThanOrEqual(STUDIO_PORT_MIN);
			expect(port).toBeLessThanOrEqual(STUDIO_PORT_MAX);
			// Out of the kernel's default ephemeral range and tailscaled's port.
			expect(port).toBeLessThan(32_768);
			expect(port).not.toBe(41_641);
		}
	} finally {
		for (const worker of workers) worker.release();
	}
});

linuxOnly(
	"a port held by another worker is skipped even while its UDP socket is unbound",
	async () => {
		// Force both workers onto the same candidate sequence.
		const sequence = () => {
			let call = 0;
			return () => [0.5, 0.5, 0.25, 0.75][call++ % 4] ?? 0;
		};
		const first = await reserveStudioPorts(1, { random: sequence() });
		try {
			const second = await reserveStudioPorts(1, { random: sequence() });
			try {
				expect(second.ports[0]).not.toBe(first.ports[0]);
			} finally {
				second.release();
			}
		} finally {
			first.release();
		}
	},
);

linuxOnly("a port bound by an unrelated process is not reserved", async () => {
	const first = await reserveStudioPorts(1, { random: () => 0.5 });
	const port = first.ports[0] ?? 0;
	first.release();
	const squatter = await Bun.udpSocket({ hostname: "127.0.0.1", port });
	try {
		await expect(
			reserveStudioPorts(1, { random: () => 0.5, attempts: 5 }),
		).rejects.toThrow("no free Studio loopback ports");
	} finally {
		squatter.close();
	}
});

test("releases partial reservations when the range is exhausted", async () => {
	const released: number[] = [];
	await expect(
		reserveStudioPorts(2, {
			random: () => 0,
			attempts: 3,
			claim: (port) => ({ release: () => released.push(port) }),
			probe: async () => {},
		}),
	).rejects.toThrow();
	expect(released).toEqual([STUDIO_PORT_MIN]);
});

linuxOnly(
	"receivers bind loopback only and refuse a port already in use",
	async () => {
		const { ports, release } = await reserveStudioPorts(1);
		const port = ports[0];
		expect(studioLoopbackUrls(port ?? 0).input).not.toContain("reuse");
		const listen = () =>
			Bun.spawn(
				[
					"ffmpeg",
					"-nostdin",
					"-v",
					"error",
					"-i",
					studioReceiveUrl(studioLoopbackUrls(port ?? 0).input, "8192"),
					"-f",
					"null",
					"-",
				],
				{ stdout: "ignore", stderr: "ignore" },
			);
		if (!Bun.which("ffmpeg")) {
			release();
			return;
		}
		const first = listen();
		try {
			const hex = (port ?? 0).toString(16).toUpperCase().padStart(4, "0");
			let bound = "";
			for (let attempt = 0; attempt < 50 && !bound; attempt++) {
				await Bun.sleep(50);
				bound =
					(await Bun.file("/proc/net/udp").text())
						.split("\n")
						.map((line) => line.trim().split(/\s+/)[1] ?? "")
						.find((address) => address.endsWith(`:${hex}`)) ?? "";
			}
			expect(bound).toBe(`0100007F:${hex}`);
			const second = listen();
			const timer = setTimeout(() => second.kill(), 5_000);
			expect(await second.exited).not.toBe(0);
			clearTimeout(timer);
			expect(first.exitCode).toBeNull();
		} finally {
			first.kill();
			await first.exited;
			release();
		}
	},
);
