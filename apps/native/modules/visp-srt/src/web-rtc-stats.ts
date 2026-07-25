import { type LinkMetrics, nextVideoBitrateKbps } from "@VISP/api/link-stats";

export type WebRtcStatsSample = {
	bytesSent: number;
	packetsLost: number;
	packetsSent: number;
	rttMs: number;
};

export function readOutboundStats(
	report: RTCStatsReport,
): WebRtcStatsSample | null {
	let bytesSent = 0;
	let packetsLost = 0;
	let packetsSent = 0;
	let rttMs = 0;
	let foundOutbound = false;

	for (const stat of report.values()) {
		if (stat.type === "outbound-rtp" && stat.kind === "video") {
			foundOutbound = true;
			bytesSent = Number(stat.bytesSent ?? 0);
			packetsSent = Number(stat.packetsSent ?? 0);
			packetsLost = Number(stat.packetsLost ?? 0);
		}
		if (stat.type === "candidate-pair" && stat.state === "succeeded") {
			const pairRtt = Number(stat.currentRoundTripTime ?? 0) * 1000;
			if (pairRtt > 0) rttMs = pairRtt;
		}
		if (stat.type === "remote-inbound-rtp" && stat.kind === "video") {
			const remoteRtt = Number(stat.roundTripTime ?? 0) * 1000;
			if (remoteRtt > 0) rttMs = remoteRtt;
			if (typeof stat.packetsLost === "number") {
				packetsLost = Math.max(packetsLost, Number(stat.packetsLost));
			}
		}
	}

	if (!foundOutbound) return null;
	return { bytesSent, packetsLost, packetsSent, rttMs };
}

export function deriveWebStats(input: {
	ceilingKbps: number;
	elapsedMs: number;
	previous: WebRtcStatsSample | null;
	sample: WebRtcStatsSample;
	targetBitrateKbps: number;
}): { nextTargetKbps: number; stats: LinkMetrics } {
	const { ceilingKbps, elapsedMs, previous, sample, targetBitrateKbps } = input;
	const seconds = Math.max(elapsedMs, 1) / 1000;
	const bytesDelta = previous
		? Math.max(0, sample.bytesSent - previous.bytesSent)
		: 0;
	const bitrateKbps = previous
		? Math.round((bytesDelta * 8) / seconds / 1000)
		: targetBitrateKbps;
	const sentDelta = previous
		? Math.max(0, sample.packetsSent - previous.packetsSent)
		: 0;
	const lostDelta = previous
		? Math.max(0, sample.packetsLost - previous.packetsLost)
		: 0;
	const packetLossPct =
		sentDelta + lostDelta > 0 ? (100 * lostDelta) / (sentDelta + lostDelta) : 0;
	const rttMs = Math.round(sample.rttMs);
	const nextTargetKbps = nextVideoBitrateKbps({
		ceilingKbps,
		currentTargetKbps: targetBitrateKbps,
		packetLossPct,
		rttMs,
	});
	return {
		nextTargetKbps,
		stats: {
			bitrateKbps,
			packetLossPct,
			rttMs,
			targetBitrateKbps: nextTargetKbps,
		},
	};
}

export async function applyVideoMaxBitrate(
	pc: RTCPeerConnection,
	maxBitrateKbps: number,
): Promise<void> {
	const sender = pc
		.getSenders()
		.find((candidate) => candidate.track?.kind === "video");
	if (!sender) return;
	const parameters = sender.getParameters();
	if (!parameters.encodings?.length) {
		parameters.encodings = [{}];
	}
	for (const encoding of parameters.encodings) {
		encoding.maxBitrate = maxBitrateKbps * 1000;
	}
	await sender.setParameters(parameters);
}

/** MediaMTX WHIP publisher exposes the RTCPeerConnection as `.pc`. */
export function publisherPeerConnection(
	publisher: { pc?: RTCPeerConnection | null } | undefined,
): RTCPeerConnection | null {
	const pc = publisher?.pc;
	return pc instanceof RTCPeerConnection ? pc : null;
}
