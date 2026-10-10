import { probeRelayRtt } from "@VISP/api/relay-probe";
import {
	lowLatencyPublishMs,
	type NetworkProfile,
	withPublishLatency,
} from "@VISP/api/srt-latency";
import * as Network from "expo-network";

export function networkProfile(
	type: Network.NetworkStateType | undefined,
): NetworkProfile {
	if (type === Network.NetworkStateType.ETHERNET) return "wired";
	if (type === Network.NetworkStateType.CELLULAR) return "cellular";
	// Wi-Fi, VPN and unknown links all get Wi-Fi headroom: a VPN usually rides
	// on Wi-Fi, and guessing "wired" for an unknown link would be too tight.
	return "wifi";
}

async function currentProfile(): Promise<NetworkProfile> {
	try {
		return networkProfile((await Network.getNetworkStateAsync()).type);
	} catch {
		return "wifi";
	}
}

async function relayRtt(pingUrl: string | undefined) {
	if (!pingUrl) return undefined;
	try {
		return await probeRelayRtt(pingUrl, 4, 2_000);
	} catch {
		return undefined;
	}
}

/**
 * The publish URL for a low-latency session. SRT latency is fixed for the
 * whole connection, so it is sized once, just before going live, from the
 * round trip to this device's relay and the link the phone is on now.
 */
export async function lowLatencyStreamUrl(
	streamUrl: string,
	pingUrl: string | undefined,
) {
	const [rttMs, profile] = await Promise.all([
		relayRtt(pingUrl),
		currentProfile(),
	]);
	const latencyMs = lowLatencyPublishMs(rttMs, profile);
	return {
		latencyMs,
		profile,
		rttMs,
		url: withPublishLatency(streamUrl, latencyMs),
	};
}
