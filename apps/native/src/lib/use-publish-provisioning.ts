import { fastestRelay } from "@VISP/api/relay-probe";
import * as Device from "expo-device";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "./backend";
import {
	claimNativeDevice,
	describeProvisionError,
	syncNativePublishUrl,
} from "./native-publish-url";
import { confirmDestructive } from "./platform";
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
	const optimizeRelay = async () => {
		if (!userId || !installationId || provisioning) return;
		setProvisioning(true);
		try {
			const devices = await apiClient.paths.list.query();
			const device = devices.find(
				(path) => path.nativeInstallationId === installationId,
			);
			if (!device) throw new Error("Refresh this device's destination first.");
			const fastest = await fastestRelay(await apiClient.relays.list.query());
			if (!fastest)
				throw new Error(
					"No relay responded. Check your connection and try again.",
				);
			if (fastest.id === device.relay.id) {
				await provisionDestination(true);
				setMessage(`Already on the fastest relay: ${device.relay.region}.`);
				return;
			}
			confirmDestructive(
				"Change relay region?",
				"Stop all sources, OBS readers and Direct/BRB outputs first. Your sending and receiving URLs will change. Update OBS afterward. Devices used for Direct handover must use the same relay.",
				"Change region",
				async () => {
					setProvisioning(true);
					try {
						const moved = await apiClient.paths.moveRelay.mutate({
							pathId: device.id,
							relayId: fastest.id,
						});
						if (!moved)
							throw new Error("Could not load the updated destination.");
						const url = selectPublishUrl([moved.urls]);
						await saveStreamUrl(url, userId);
						setStreamUrl(url);
						await refreshPublishDevices();
						setMessage(
							`Relay changed to ${moved.path.relay.region}. Update your OBS receiving URL.`,
						);
					} catch (error) {
						setMessage(describeProvisionError(error));
					} finally {
						setProvisioning(false);
					}
				},
			);
		} catch (error) {
			setMessage(describeProvisionError(error));
		} finally {
			setProvisioning(false);
		}
	};

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
						claimNativeDevice(apiClient, {
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
		optimizeRelay,
		awaitingAutoProvision,
		provisionDestination,
		provisionPhase,
		provisioning,
	};
}
