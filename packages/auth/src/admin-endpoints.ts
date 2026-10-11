import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * Better Auth admin endpoints that change who may sign in or what a session
 * may do. The tRPC admin router owns these changes: it writes the audit log,
 * clears cached sessions (packages/auth/src/sessions.ts) and ends the
 * credentials a session does not cover (OBS control tokens, cached media
 * auth, Direct outputs). Better Auth's versions do none of that, so they are
 * refused for every caller, server-side `auth.api.*` calls included.
 */
export const ROUTER_OWNED_ADMIN_PATHS: ReadonlySet<string> = new Set([
	"/admin/ban-user",
	"/admin/unban-user",
	"/admin/set-role",
	"/admin/revoke-user-session",
	"/admin/revoke-user-sessions",
]);

export function routerOwnedAdminEndpoints() {
	return {
		id: "visp-router-owned-admin-endpoints",
		hooks: {
			before: [
				{
					matcher: (ctx) => ROUTER_OWNED_ADMIN_PATHS.has(ctx.path ?? ""),
					handler: createAuthMiddleware(async () => {
						throw new APIError("FORBIDDEN", {
							code: "USE_ADMIN_CONSOLE",
							message: "Use the VISP admin console for this change.",
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
