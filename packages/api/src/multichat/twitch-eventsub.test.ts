import { describe, expect, test } from "bun:test";
import {
	type EventSubListener,
	type EventSubSocket,
	SharedTwitchEventSub,
} from "./twitch-eventsub";

class FakeSocket implements EventSubSocket {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	constructor(readonly url: string) {}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.onclose?.();
	}
	send(message: unknown) {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
	welcome(id: string) {
		this.send({
			metadata: { message_type: "session_welcome" },
			payload: { session: { id, keepalive_timeout_seconds: 30 } },
		});
	}
}

function harness() {
	const sockets: FakeSocket[] = [];
	const subscribed: Array<{ broadcasterId: string; sessionId: string }> = [];
	const unsubscribed: string[] = [];
	let nextId = 0;
	let fail = false;
	const eventSub = new SharedTwitchEventSub({
		connect: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket;
		},
		subscribe: async (broadcasterId, sessionId) => {
			if (fail) throw new Error("nope");
			subscribed.push({ broadcasterId, sessionId });
			nextId += 1;
			return `sub-${nextId}`;
		},
		unsubscribe: async (id) => {
			unsubscribed.push(id);
		},
	});
	return {
		eventSub,
		sockets,
		subscribed,
		unsubscribed,
		failSubscribe(value: boolean) {
			fail = value;
		},
	};
}

function listener() {
	const statuses: string[] = [];
	const messages: unknown[] = [];
	const value: EventSubListener = {
		onStatus: (state) => statuses.push(state),
		onMessage: (event) => messages.push(event),
	};
	return { value, statuses, messages };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function chat(broadcasterId: string, text: string) {
	return {
		metadata: {
			message_type: "notification",
			subscription_type: "channel.chat.message",
		},
		payload: { event: { broadcaster_user_id: broadcasterId, text } },
	};
}

describe("shared Twitch EventSub session", () => {
	test("uses one socket for many broadcasters and routes by broadcaster", async () => {
		const h = harness();
		const a = listener();
		const b = listener();
		const releaseA = h.eventSub.add("100", a.value);
		const releaseB = h.eventSub.add("200", b.value);
		expect(h.sockets).toHaveLength(1);
		h.sockets[0]?.welcome("session-1");
		await flush();
		expect(h.subscribed).toEqual([
			{ broadcasterId: "100", sessionId: "session-1" },
			{ broadcasterId: "200", sessionId: "session-1" },
		]);
		expect(a.statuses.at(-1)).toBe("connected");
		h.sockets[0]?.send(chat("200", "hi"));
		expect(a.messages).toHaveLength(0);
		expect(b.messages).toHaveLength(1);
		releaseA();
		releaseB();
		await flush();
		expect(h.unsubscribed.sort()).toEqual(["sub-1", "sub-2"]);
		expect(h.sockets[0]?.closed).toBe(true);
		expect(h.eventSub.size).toBe(0);
	});

	test("refcounts listeners on the same broadcaster", async () => {
		const h = harness();
		const first = listener();
		const second = listener();
		const releaseFirst = h.eventSub.add("100", first.value);
		h.sockets[0]?.welcome("session-1");
		await flush();
		const releaseSecond = h.eventSub.add("100", second.value);
		await flush();
		expect(h.subscribed).toHaveLength(1);
		expect(second.statuses).toEqual(["connected"]);
		releaseFirst();
		await flush();
		expect(h.unsubscribed).toEqual([]);
		h.sockets[0]?.send(chat("100", "still here"));
		expect(second.messages).toHaveLength(1);
		releaseSecond();
		await flush();
		expect(h.unsubscribed).toEqual(["sub-1"]);
	});

	test("keeps subscriptions across a reconnect handoff", async () => {
		const h = harness();
		const a = listener();
		h.eventSub.add("100", a.value);
		h.sockets[0]?.welcome("session-1");
		await flush();
		h.sockets[0]?.send({
			metadata: { message_type: "session_reconnect" },
			payload: {
				session: {
					id: "session-1",
					reconnect_url: "wss://eventsub.wss.twitch.tv/ws?r=1",
				},
			},
		});
		expect(h.sockets).toHaveLength(2);
		h.sockets[1]?.welcome("session-2");
		await flush();
		expect(h.sockets[0]?.closed).toBe(true);
		expect(h.subscribed).toHaveLength(1);
		h.sockets[1]?.send(chat("100", "after handoff"));
		expect(a.messages).toHaveLength(1);
		expect(a.statuses).not.toContain("disconnected");
	});

	test("resubscribes everything on a fresh session after a drop", async () => {
		const h = harness();
		const a = listener();
		h.eventSub.add("100", a.value);
		h.sockets[0]?.welcome("session-1");
		await flush();
		h.sockets[0]?.close();
		expect(a.statuses.at(-1)).toBe("disconnected");
		await new Promise((resolve) => setTimeout(resolve, 1_050));
		expect(h.sockets).toHaveLength(2);
		h.sockets[1]?.welcome("session-2");
		await flush();
		expect(h.subscribed.at(-1)).toEqual({
			broadcasterId: "100",
			sessionId: "session-2",
		});
		expect(a.statuses.at(-1)).toBe("connected");
	});

	test("a failed subscription errors only that broadcaster", async () => {
		const h = harness();
		const a = listener();
		h.failSubscribe(true);
		const release = h.eventSub.add("100", a.value);
		h.sockets[0]?.welcome("session-1");
		await flush();
		expect(a.statuses.at(-1)).toBe("error");
		expect(h.sockets[0]?.closed).toBe(false);
		release();
	});

	test("drops a subscription that finished after its last listener left", async () => {
		const h = harness();
		const a = listener();
		const keep = listener();
		h.eventSub.add("999", keep.value);
		h.sockets[0]?.welcome("session-1");
		await flush();
		const release = h.eventSub.add("100", a.value);
		release();
		await flush();
		expect(h.unsubscribed).toEqual(["sub-2"]);
	});
});
