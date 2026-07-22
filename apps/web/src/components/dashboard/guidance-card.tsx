import { env } from "@VISP/env/web";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { docs } from "@/lib/docs";
import { useT } from "@/lib/i18n";
import { probeRelayRtt } from "@/lib/relay";
import { useTRPC } from "@/utils/trpc";
import { AdvancedSection } from "./advanced-section";
import {
	type Guidance,
	NETWORK_PROFILE_OPTIONS,
	type NetworkProfile,
} from "./types";

function isNetworkProfile(value: string): value is NetworkProfile {
	return value === "wired" || value === "wifi" || value === "cellular";
}

export function GuidanceCard() {
	const t = useT();
	const trpc = useTRPC();
	const [profile, setProfile] = useState<NetworkProfile>("wifi");
	const [rtt, setRtt] = useState<number | null>(null);
	const [measuring, setMeasuring] = useState(false);
	const [guidance, setGuidance] = useState<Guidance | null>(null);
	const submit = useMutation(
		trpc.rtt.submit.mutationOptions({
			onSuccess: setGuidance,
			onError: (error) => toast.error(error.message),
		}),
	);

	const measure = async () => {
		setMeasuring(true);
		try {
			const measured = await probeRelayRtt(env.VITE_RELAY_PING_URL);
			setRtt(measured);
			await submit.mutateAsync({
				rttMs: measured,
				profile,
				method: "browser-probe",
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Relay probe failed",
			);
		} finally {
			setMeasuring(false);
		}
	};

	const canSubmitManual =
		rtt !== null && Number.isInteger(rtt) && rtt >= 1 && !submit.isPending;

	return (
		<AdvancedSection
			docsHref={docs.broadcasterSetup}
			docsLabel="See how to tune SRT latency"
			id="dashboard-tuning"
			tag="Advanced · Tuning"
			title={t("Connection guidance")}
			value="tuning"
		>
			<Text color="secondary" type="supporting">
				The browser estimate includes HTTPS overhead and deliberately rounds
				upward.
			</Text>
			<Selector
				label={t("Network profile")}
				options={[...NETWORK_PROFILE_OPTIONS]}
				value={profile}
				onChange={(value) => {
					if (isNetworkProfile(value)) setProfile(value);
				}}
			/>
			<NumberInput
				description={t("Use the relay probe or enter a measured value.")}
				label={t("Estimated RTT (ms)")}
				value={rtt}
				onChange={setRtt}
			/>
			{guidance ? (
				<Card padding={3} variant="muted">
					<VStack gap={1}>
						<Text type="label">Recommended SRT latency: {guidance.ms} ms</Text>
						<Text type="supporting">
							OBS/FFmpeg query value: {guidance.micros} µs
						</Text>
						<Text type="supporting">Larix setting: {guidance.larixMs} ms</Text>
						<Text type="supporting">
							Suggested 1080p30 bitrate: {guidance.bitrateKbps["1080p30"]} kbps
						</Text>
						{guidance.note ? (
							<Text color="secondary" type="supporting">
								{guidance.note}
							</Text>
						) : null}
					</VStack>
				</Card>
			) : null}
			<HStack gap={2} wrap="wrap">
				<Button
					isLoading={measuring || submit.isPending}
					label={t("Measure relay RTT")}
					variant="primary"
					onClick={measure}
				/>
				<Button
					isDisabled={!canSubmitManual}
					label={t("Use manual RTT")}
					onClick={() => {
						if (rtt === null) return;
						submit.mutate({ rttMs: rtt, profile, method: "manual" });
					}}
				/>
			</HStack>
		</AdvancedSection>
	);
}
