/**
 * Better Auth's admin plugin treats a ban whose expiry has passed as lifted
 * (it clears it on the next sign-in), so access checks do the same.
 *
 * Dependency-free so hot paths (media auth, OBS control) can use it without
 * loading the Better Auth instance.
 */
export function isBanActive(user: {
	banned?: boolean | null;
	banExpires?: Date | string | number | null;
}) {
	if (!user.banned) return false;
	if (user.banExpires == null) return true;
	return new Date(user.banExpires).getTime() > Date.now();
}
