import { randomBytes } from "node:crypto";

const TICKET_TTL_MS = 30_000;
const MAX_TICKETS_PER_OWNER = 8;

export class LiveTicketStore<T> {
	private readonly tickets = new Map<
		string,
		{ expiresAt: number; key: string; value: T }
	>();
	private readonly ticketsByOwner = new Map<string, Set<string>>();

	constructor(private readonly keyFor: (value: T) => string) {}

	issue(value: T, now = Date.now()) {
		this.prune(now);
		const key = this.keyFor(value);
		const ownerTickets = this.ticketsByOwner.get(key) ?? new Set<string>();
		while (ownerTickets.size >= MAX_TICKETS_PER_OWNER) {
			const oldest = ownerTickets.values().next().value;
			if (!oldest) break;
			ownerTickets.delete(oldest);
			this.tickets.delete(oldest);
		}
		const ticket = randomBytes(32).toString("base64url");
		const expiresAt = now + TICKET_TTL_MS;
		this.tickets.set(ticket, { expiresAt, key, value });
		ownerTickets.add(ticket);
		this.ticketsByOwner.set(key, ownerTickets);
		return { ticket, expiresAt: new Date(expiresAt).toISOString() };
	}

	consume(ticket: string, now = Date.now()) {
		const entry = this.tickets.get(ticket);
		this.tickets.delete(ticket);
		if (entry) this.removeOwnerTicket(entry.key, ticket);
		if (!entry || entry.expiresAt <= now) return null;
		return entry.value;
	}

	private prune(now: number) {
		for (const [ticket, entry] of this.tickets) {
			if (entry.expiresAt <= now) {
				this.tickets.delete(ticket);
				this.removeOwnerTicket(entry.key, ticket);
			}
		}
	}

	private removeOwnerTicket(key: string, ticket: string) {
		const ownerTickets = this.ticketsByOwner.get(key);
		ownerTickets?.delete(ticket);
		if (ownerTickets?.size === 0) this.ticketsByOwner.delete(key);
	}
}
