import { db } from "@VISP/db";
import { auth } from "./index";

/** Better Auth 1.7 selects OAuth accounts by their database ID. */
export async function getProviderAccessToken(providerId: string, userId: string) {
	const accounts = await db.query.account.findMany({
		columns: { id: true },
		where: (account, { and, eq }) => and(eq(account.userId, userId), eq(account.providerId, providerId)),
		limit: 2,
	});
	if (accounts.length !== 1 || !accounts[0]) throw new Error("A single linked provider account is required");
	return auth.api.getAccessToken({ body: { accountId: accounts[0].id, userId } });
}
