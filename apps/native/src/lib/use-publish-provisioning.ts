import * as Device from "expo-device";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "./backend";
import {
	describeProvisionError,
	syncNativePublishUrl,
} from "./native-publish-url";
import { deleteStreamUrl, saveStreamUrl, selectPublishUrl } from "./stream-url";

export type ProvisionPhase = "idle" | "pending" | "done";

export function usePublishProvisioning({
	installationId,
	refreshPublishDevices,
	sessionPending,
	setMessage,
	setStreamUrl,
	streamOwner,
	streamUrl,
	userId,
}: {
	installationId?: string;
	refreshPublishDevices: () => Promise<void>;
	sessionPending: boolean;
	setMessage: Dispatch<SetStateAction<string | undefined>>;
	setStreamUrl: Dispatch<SetStateAction<string | null | undefined>>;
	streamOwner: string;
	streamUrl: string | null | undefined;
	userId?: string;
}) {
	const [provisionPhase, setProvisionPhase] = useState<ProvisionPhase>("idle");
	const [provisioning, setProvisioning] = useState(false);

	useEffect(() => {
		if (!sessionPending && streamOwner) setProvisionPhase("idle");
	}, [sessionPending, streamOwner]);

	const provisionDestination = useCallback(
		async (refresh = false) => {
			if (!userId || !installationId || streamUrl === undefined) {
				if (refresh && userId && !installationId) {
					setMessage(
						"Still preparing this device. Wait a moment and try again.",
					);
				}
				return;
			}
			setProvisioning(true);
			setProvisionPhase("pending");
			setMessage(undefined);
			// Staging builds tag their publishing devices so test paths are
			// distinguishable from production ones in the portal device list.
			const testSuffix =
				process.env.EXPO_PUBLIC_VISP_ENV === "staging" ? " (TEST)" : "";
			const label = `${Device.deviceName ?? Device.modelName ?? "VISP Native"}${testSuffix}`;
			try {
				let url: string;
				if (refresh) {
					url = await syncNativePublishUrl(apiClient, {
						installationId,
						label,
						userId,
					});
				} else {
					const claimDevice = (legacyUrl?: string) =>
						apiClient.paths.claimNative.mutate({
							installationId,
							label,
							...(legacyUrl ? { legacyUrl } : {}),
						});
					let device: Awaited<ReturnType<typeof claimDevice>>;
					try {
						device = await claimDevice(streamUrl ?? undefined);
					} catch (error) {
						if (!streamUrl) throw error;
						await deleteStreamUrl();
						setStreamUrl(null);
						device = await claimDevice();
					}
					url = selectPublishUrl([device.urls]);
					await saveStreamUrl(url, userId);
				}
				setStreamUrl(url);
				await refreshPublishDevices();
			} catch (error) {
				setMessage(describeProvisionError(error));
			} finally {
				setProvisioning(false);
				setProvisionPhase("done");
			}
		},
		[
			installationId,
			refreshPublishDevices,
			setMessage,
			setStreamUrl,
			streamUrl,
			userId,
		],
	);

	const awaitingAutoProvision = Boolean(
		userId && installationId && streamUrl === null && provisionPhase === "idle",
	);

	useEffect(() => {
		if (!awaitingAutoProvision) return;
		void provisionDestination();
	}, [awaitingAutoProvision, provisionDestination]);

	return {
		awaitingAutoProvision,
		provisionDestination,
		provisionPhase,
		provisioning,
	};
}
