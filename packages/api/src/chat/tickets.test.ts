import { describe, expect, test } from "bun:test";
import { LiveTicketStore } from "../live-tickets";

describe("chat live tickets", () => {
	test("are single use and isolated to their owner", () => {
		const store = new LiveTicketStore<string>((userId) => userId);
		const { ticket } = store.issue("user-a", 1_000);
		expect(store.consume(ticket, 2_000)).toBe("user-a");
		expect(store.consume(ticket, 2_001)).toBeNull();
	});

	test("expire after thirty seconds", () => {
		const store = new LiveTicketStore<string>((userId) => userId);
		const { ticket } = store.issue("user-a", 1_000);
		expect(store.consume(ticket, 31_000)).toBeNull();
	});

	test("bounds unused tickets without blocking concurrent clients", () => {
		const store = new LiveTicketStore<string>((userId) => userId);
		const tickets = Array.from({ length: 9 }, (_, index) =>
			store.issue("user-a", 1_000 + index),
		);
		const first = tickets[0];
		const second = tickets[1];
		if (!first || !second) throw new Error("tickets were not issued");
		expect(store.consume(first.ticket, 2_000)).toBeNull();
		expect(store.consume(second.ticket, 2_000)).toBe("user-a");
	});
});
