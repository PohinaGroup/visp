import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * Domain of the addresses VISP synthesizes for provider accounts that have no
 * email (see kick-user-info.ts). Nobody receives mail there, so an address in
 * it can only ever belong to the provider account it was made for.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.noreply.visp-stream.com";

/**
 * Whether `email` is in the placeholder domain or one of its subdomains.
 * Normalised first (trim, NFKC, lowercase, trailing dot) so no spelling of the
 * domain slips past a check that Better Auth or Postgres would later treat as
 * the same address.
 */
export function isPlaceholderEmail(email: unknown) {
	if (typeof email !== "string") return false;
	const normalized = email.trim().normalize("NFKC").toLowerCase();
	const at = normalized.lastIndexOf("@");
	if (at === -1) return false;
	const domain = normalized
		.slice(at + 1)
		.trim()
		.replace(/\.+$/, "");
	return (
		domain === PLACEHOLDER_EMAIL_DOMAIN ||
		domain.endsWith(`.${PLACEHOLDER_EMAIL_DOMAIN}`)
	);
}

/** Endpoints that set a user's email from request input, and where it sits. */
const EMAIL_INPUTS = new Map<
	string,
	(body: Record<string, unknown>) => unknown
>([
	["/sign-up/email", (body) => body.email],
	["/change-email", (body) => body.newEmail],
	// Better Auth refuses email here today; kept so an upgrade cannot open it.
	["/update-user", (body) => body.email],
	["/admin/create-user", (body) => body.email],
	[
		"/admin/update-user",
		(body) =>
			body.data && typeof body.data === "object"
				? (body.data as Record<string, unknown>).email
				: undefined,
	],
]);

/**
 * Refuses placeholder addresses wherever a person chooses an email. Kick user
 * ids are public, so otherwise anyone could register `kick-<id>@…` first and
 * the streamer's own Kick sign-in would then fail with account_not_linked.
 * Provider sign-in creates these users through the OAuth callback, which never
 * passes through the endpoints above.
 *
 * The error matches Better Auth's own invalid-email response and covers the
 * whole domain, so it says nothing about whether such an account exists.
 */
export function reservedEmailDomains() {
	return {
		id: "visp-reserved-email-domains",
		hooks: {
			before: [
				{
					matcher: (ctx) => EMAIL_INPUTS.has(ctx.path ?? ""),
					handler: createAuthMiddleware(async (ctx) => {
						const read = EMAIL_INPUTS.get(ctx.path);
						const body = ctx.body;
						if (!read || !body || typeof body !== "object") return;
						if (!isPlaceholderEmail(read(body as Record<string, unknown>))) {
							return;
						}
						throw new APIError("BAD_REQUEST", {
							code: "INVALID_EMAIL",
							message: "Invalid email",
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
