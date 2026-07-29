import { pool } from "@VISP/db";

export type AdvisoryLock = {
	release: () => Promise<void>;
};

export async function tryAdvisoryLock(
	key: string,
	onLost?: () => void,
): Promise<AdvisoryLock | null> {
	const client = await pool.connect();
	let released = false;
	const lost = () => {
		if (released) return;
		released = true;
		try {
			client.release(true);
		} catch {
			// The connection is already gone.
		}
		onLost?.();
	};
	client.once("error", lost);
	client.once("end", lost);
	try {
		const result = await client.query<{ locked: boolean }>(
			"select pg_try_advisory_lock(hashtext($1)) as locked",
			[key],
		);
		if (!result.rows[0]?.locked) {
			client.removeAllListeners("error");
			client.removeAllListeners("end");
			client.release();
			return null;
		}
		return {
			async release() {
				if (released) return;
				released = true;
				client.removeAllListeners("error");
				client.removeAllListeners("end");
				try {
					await client.query("select pg_advisory_unlock(hashtext($1))", [key]);
					client.release();
				} catch {
					client.release(true);
				}
			},
		};
	} catch (error) {
		client.removeAllListeners("error");
		client.removeAllListeners("end");
		client.release(true);
		throw error;
	}
}
