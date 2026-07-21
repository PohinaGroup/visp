export type KickProfile = {
	email?: string | null;
	name?: string | null;
	profile_picture?: string | null;
	user_id?: number | string | null;
};

export type KickAuthUser = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string;
};

/** Stable placeholder when Kick omits email (common for some accounts). */
export function kickPlaceholderEmail(userId: string) {
	return `kick-${userId}@users.noreply.visp-stream.com`;
}

export function mapKickProfileToAuthUser(
	profile: KickProfile | undefined,
): KickAuthUser | null {
	if (profile?.user_id === undefined || profile.user_id === null) return null;
	const id = String(profile.user_id).trim();
	if (!id) return null;

	const email = profile.email?.trim();
	const name = profile.name?.trim() || `Kick ${id}`;

	return {
		id,
		email: email || kickPlaceholderEmail(id),
		emailVerified: false,
		name,
		image: profile.profile_picture ?? undefined,
	};
}

type FetchLike = (
	input: string,
	init?: RequestInit,
) => Promise<Response>;

export async function fetchKickAuthUser(
	accessToken: string,
	fetchImpl: FetchLike = fetch,
): Promise<KickAuthUser | null> {
	const response = await fetchImpl("https://api.kick.com/public/v1/users", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) {
		console.error(
			`Kick user info failed (${response.status}): ${await response.text().catch(() => "")}`,
		);
		return null;
	}
	const payload = (await response.json()) as { data?: KickProfile[] };
	return mapKickProfileToAuthUser(payload.data?.[0]);
}
