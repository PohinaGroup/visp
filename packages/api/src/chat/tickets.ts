import { LiveTicketStore } from "../live-tickets";

export const chatTickets = new LiveTicketStore<string>((userId) => userId);
