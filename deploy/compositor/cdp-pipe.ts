import { closeSync, writeSync } from "node:fs";

export type CdpEvent = {
	method: string;
	params?: unknown;
	sessionId?: string;
};

/**
 * Chrome DevTools Protocol over `--remote-debugging-pipe`: Chromium reads
 * NUL-terminated JSON commands on fd 3 and writes replies and events on fd 4.
 * Spawn with `stdio: [..., "pipe", "pipe"]` so those are the 4th and 5th entries.
 */
export function openCdpPipe(
	process: { stdio: readonly unknown[] },
	timeoutMs = 5_000,
) {
	const input = process.stdio[3];
	const output = process.stdio[4];
	if (typeof input !== "number" || typeof output !== "number")
		throw new Error("browser CDP pipe unavailable");
	let commandId = 0;
	let closed = false;
	let released = false;
	const pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	const listeners: ((event: CdpEvent) => void)[] = [];
	const rejectPending = () => {
		closed = true;
		for (const { reject, timer } of pending.values()) {
			clearTimeout(timer);
			reject(new Error("browser CDP disconnected"));
		}
		pending.clear();
	};
	const dispatch = (text: string) => {
		const payload = JSON.parse(text) as {
			id?: number;
			method?: string;
			params?: unknown;
			sessionId?: string;
			result?: unknown;
			error?: { message: string };
		};
		if (payload.id) {
			const command = pending.get(payload.id);
			pending.delete(payload.id);
			if (command) {
				clearTimeout(command.timer);
				if (payload.error) command.reject(new Error(payload.error.message));
				else command.resolve(payload.result);
			}
			return;
		}
		if (payload.method)
			for (const listener of listeners)
				listener({
					method: payload.method,
					params: payload.params,
					sessionId: payload.sessionId,
				});
	};
	const reader = Bun.file(output).stream().getReader();
	const reading = (async () => {
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let end = buffer.indexOf("\0");
				while (end >= 0) {
					const message = buffer.slice(0, end);
					buffer = buffer.slice(end + 1);
					try {
						dispatch(message);
					} catch {
						// A malformed message only affects the command waiting for it.
					}
					end = buffer.indexOf("\0");
				}
			}
		} catch {
			// The browser went away; pending commands are rejected below.
		}
		rejectPending();
	})();

	return {
		get closed() {
			return closed;
		},
		onEvent(listener: (event: CdpEvent) => void) {
			listeners.push(listener);
		},
		send(method: string, params: object = {}, sessionId = "") {
			return new Promise<unknown>((resolve, reject) => {
				if (closed) {
					reject(new Error("browser CDP disconnected"));
					return;
				}
				const id = ++commandId;
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(new Error(`browser CDP command timed out: ${method}`));
				}, timeoutMs);
				pending.set(id, { resolve, reject, timer });
				try {
					const message = Buffer.from(
						`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
					);
					let written = 0;
					while (written < message.length)
						written += writeSync(input, message, written);
				} catch {
					clearTimeout(timer);
					pending.delete(id);
					reject(new Error("browser CDP disconnected"));
				}
			});
		},
		/** Stops reading and releases both descriptors. Idempotent. */
		async close() {
			if (released) return;
			released = true;
			await reader.cancel().catch(() => undefined);
			await reading;
			closeSync(input);
			closeSync(output);
		},
	};
}
