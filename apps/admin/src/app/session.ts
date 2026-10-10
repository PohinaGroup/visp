import { createContext, useContext } from "react";
import type { authClient } from "../lib";

export type AdminSession = NonNullable<
	ReturnType<typeof authClient.useSession>["data"]
>;

/**
 * The verified administrator session, provided once the auth gate has passed.
 * Pages read it instead of re-querying because they only render after access
 * was confirmed.
 */
export const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
	const session = useContext(AdminSessionContext);
	if (!session) throw new Error("useAdminSession used outside the auth gate");
	return session;
}
