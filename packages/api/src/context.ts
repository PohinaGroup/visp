import { auth } from "@VISP/auth";
import type { Context as ElysiaContext } from "elysia";

export type CreateContextOptions = {
	context: ElysiaContext;
};

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.request.headers,
	});
	return {
		auth: null,
		headers: context.request.headers,
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
