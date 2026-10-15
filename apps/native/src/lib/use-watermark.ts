import { useEffect, useState } from "react";
import { apiClient } from "./backend";

/**
 * Whether the native encoder burns the VISP mark into the stream. Free until
 * the server says otherwise, so a signed-out or offline phone still carries it.
 */
export function useWatermark(userId?: string) {
	const [watermark, setWatermark] = useState(true);

	useEffect(() => {
		if (!userId) {
			setWatermark(true);
			return;
		}
		let cancelled = false;
		apiClient.plan.me
			.query()
			.then((plan) => {
				if (!cancelled) setWatermark(plan.watermark);
			})
			.catch(() => {
				if (!cancelled) setWatermark(true);
			});
		return () => {
			cancelled = true;
		};
	}, [userId]);

	return watermark;
}
