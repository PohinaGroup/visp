import {
	formatBondedBitrates,
	formatMbps,
	type LinkHealth,
	linkHealth,
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
	live,
}: {
	linkStats: StreamStatsEvent | undefined;
	live: boolean;
}) {
	if (!live || !linkStats) return null;

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

	return (
		<View
			accessible
			accessibilityLabel={`Bitrate ${bitrate} of ${target} megabits per second, latency ${rtt} milliseconds, packet loss ${loss} percent`}
			style={styles.statBlock}
		>
			<View style={styles.statRow}>
				<Stat
					caption="Bitrate"
					color={
						LINK_HEALTH_COLORS[
							linkHealth(linkStats.packetLossPct, linkStats.rttMs)
						]
					}
					value={`${bitrate} / ${target} Mb/s`}
				/>
				<Stat caption="Latency" value={`${rtt} ms`} />
				<Stat caption="Loss" value={`${loss} %`} />
			</View>
			{bonded ? <Text style={styles.bondedLine}>{bonded}</Text> : null}
		</View>
	);
}
