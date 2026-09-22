import {
	deliveryHealth,
	formatBondedBitrates,
	formatMbps,
	type LinkHealth,
} from "@VISP/api/link-stats";
import { Text, View } from "react-native";
import type { StreamStatsEvent } from "../../modules/visp-srt";
import { streamScreenStyles as styles } from "./stream-screen.styles";

const LINK_HEALTH_COLORS: Record<LinkHealth, string> = {
	congested: "#ff354d",
	good: "#3fca5a",
	soft: "#f5c542",
};

function Stat({
	caption,
	color,
	value,
}: {
	caption: string;
	color?: string;
	value: string;
}) {
	return (
		<View style={styles.stat}>
			<Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
			<Text style={styles.statCaption}>{caption}</Text>
		</View>
	);
}

export function LinkStatsHud({
	linkStats,
	linkStatsFresh,
	live,
	videoBitrateCeilingKbps,
}: {
	linkStats: StreamStatsEvent | undefined;
	linkStatsFresh: boolean;
	live: boolean;
	videoBitrateCeilingKbps: number | undefined;
}) {
	if (!live) return null;
	if (!linkStats || !linkStatsFresh) {
		return (
			<View
				accessible
				accessibilityLabel="Network stats unavailable"
				style={styles.statBlock}
			>
				<Text style={styles.networkUnavailable}>Network stats unavailable</Text>
			</View>
		);
	}

	const bitrate = formatMbps(linkStats.bitrateKbps);
	const target = formatMbps(linkStats.targetBitrateKbps);
	const rtt = Math.round(linkStats.rttMs);
	const loss =
		linkStats.packetLossPct < 10
			? linkStats.packetLossPct.toFixed(1)
			: String(Math.round(linkStats.packetLossPct));
	const bonded =
		linkStats.links && linkStats.links.length > 1
			? formatBondedBitrates(linkStats.links)
			: "";
	const health = deliveryHealth(linkStats);
	const qualityReduced =
		videoBitrateCeilingKbps != null &&
		linkStats.targetBitrateKbps < videoBitrateCeilingKbps;
	const videoTelemetry =
		linkStats.encodedFps == null
			? undefined
			: `${linkStats.encodedFps} fps · ${linkStats.droppedVideoFrames ?? 0} drops`;

	return (
		<View
			accessible
			accessibilityLabel={`Bitrate ${bitrate} of ${target} megabits per second, network round trip time ${rtt} milliseconds, packet loss ${loss} percent`}
			style={styles.statBlock}
		>
			<View style={styles.statRow}>
				<Stat
					caption="Bitrate"
					color={LINK_HEALTH_COLORS[health]}
					value={`${bitrate} / ${target} Mb/s`}
				/>
				<Stat caption="Network RTT" value={`${rtt} ms`} />
				<Stat caption="Loss" value={`${loss} %`} />
			</View>
			{bonded ? <Text style={styles.bondedLine}>{bonded}</Text> : null}
			{videoTelemetry ? (
				<Text style={styles.bondedLine}>Video output {videoTelemetry}</Text>
			) : null}
			{qualityReduced ? (
				<Text style={styles.qualityReduced}>
					Quality reduced for this connection
				</Text>
			) : null}
		</View>
	);
}
