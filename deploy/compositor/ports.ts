// Loopback UDP ports for the worker's internal MPEG-TS feeds. The range sits
// below Linux's default ephemeral range (32768-60999) and away from tailscaled
// (41641), so the kernel never hands one of these ports to an unrelated socket.
export const STUDIO_PORT_MIN = 20_000;
export const STUDIO_PORT_MAX = 29_999;

type Claim = (port: number) => { release(): void };
type Probe = (port: number) => Promise<void>;

// Feed ports are unbound between renderer swaps, so the UDP socket itself
// cannot hold the reservation. An abstract Unix listener named after the port
// is an exclusive lock that the kernel drops when the worker dies.
const claimLock: Claim = (port) => {
	const listener = Bun.listen({
		unix: `\0visp-compositor-udp-${port}`,
		socket: {
			open(socket) {
				socket.end();
			},
			data() {},
		},
	});
	return { release: () => listener.stop(true) };
};

const probeUdp: Probe = async (port) => {
	const socket = await Bun.udpSocket({ hostname: "127.0.0.1", port });
	socket.close();
};

/**
 * Reserves `count` distinct loopback UDP ports for this worker's lifetime.
 * No other worker can hold the same port, and FFmpeg binds without `reuse`,
 * so a collision with anything else fails closed instead of interleaving.
 */
export async function reserveStudioPorts(
	count: number,
	options: {
		claim?: Claim;
		probe?: Probe;
		random?: () => number;
		attempts?: number;
	} = {},
) {
	const {
		claim = claimLock,
		probe = probeUdp,
		random = Math.random,
		attempts = 500,
	} = options;
	const held: { port: number; release(): void }[] = [];
	const release = () => {
		for (const lock of held.splice(0)) lock.release();
	};
	for (let attempt = 0; attempt < attempts && held.length < count; attempt++) {
		const port =
			STUDIO_PORT_MIN +
			Math.floor(random() * (STUDIO_PORT_MAX - STUDIO_PORT_MIN + 1));
		if (held.some((lock) => lock.port === port)) continue;
		let lock: { release(): void };
		try {
			lock = claim(port);
		} catch {
			continue;
		}
		try {
			await probe(port);
		} catch {
			lock.release();
			continue;
		}
		held.push({ port, release: lock.release });
	}
	if (held.length < count) {
		release();
		throw new Error("no free Studio loopback ports");
	}
	return { ports: held.map(({ port }) => port), release };
}

/** Sender and receiver URLs for one reserved port. Receivers bind loopback only. */
export function studioLoopbackUrls(port: number) {
	return {
		input: `udp://127.0.0.1:${port}?localaddr=127.0.0.1`,
		output: `udp://127.0.0.1:${port}?localaddr=127.0.0.1&pkt_size=1316`,
	};
}
