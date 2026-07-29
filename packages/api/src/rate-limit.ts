const MAX_KEYS = 10_000;

export function fixedWindow(limit: number, windowMs: number) {
	const requests = new Map<string, { count: number; resetAt: number }>();

	return {
		reset() {
			requests.clear();
		},
		take(key: string, now = Date.now()) {
			const current = requests.get(key);
			if (!current || current.resetAt <= now) {
				if (requests.size >= MAX_KEYS) {
					for (const [requestKey, value] of requests) {
						if (value.resetAt <= now) requests.delete(requestKey);
					}
					if (requests.size >= MAX_KEYS) {
						const oldest = requests.keys().next().value;
						if (oldest) requests.delete(oldest);
					}
				}
				requests.set(key, { count: 1, resetAt: now + windowMs });
				return true;
			}
			if (current.count >= limit) return false;
			current.count += 1;
			return true;
		},
	};
}
