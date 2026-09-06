import { LiveTicketStore } from "../live-tickets";

export const multiChatTickets = new LiveTicketStore<string>((userId) => userId);
