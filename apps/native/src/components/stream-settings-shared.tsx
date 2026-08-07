import * as UI from "@expo/ui";
import type { ReactNode } from "react";
import { IS_IOS, IS_WEB } from "../lib/platform";
import { describeStreamUrl } from "../lib/stream-url";

export { IS_IOS, IS_WEB };
export const SUBTLE = "#8a919c";
export const DESTRUCTIVE = "#e5484d";
export const SUBTLE_TEXT = { color: SUBTLE, fontSize: 13 } as const;

export type DestinationSettings = {
	onEdit: () => void;
	onRemove: () => void;
	streamUrl: string | null;
};

export type DirectProvider = "twitch" | "kick" | "youtube";
export const DIRECT_PROVIDERS = ["twitch", "kick", "youtube"] as const;

export function providerLabel(provider: DirectProvider) {
	return provider === "twitch"
		? "Twitch"
		: provider === "kick"
			? "Kick"
			: "YouTube";
}

// ponytail: iOS Forms put picker labels inline; Material dropdowns read better with the label above.
export function SettingRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	if (IS_IOS) {
		return (
			<UI.Row alignment="center">
				<UI.Text>{label}</UI.Text>
				<UI.Spacer flexible />
				{children}
			</UI.Row>
		);
	}
	return (
		<UI.Column spacing={4}>
			<UI.Text textStyle={SUBTLE_TEXT}>{label}</UI.Text>
			{children}
		</UI.Column>
	);
}

// ponytail: SwiftUI compresses trailing buttons into vertical letter-stacks when a long
// label shares the row, so: one control on the row, extra actions on a line of their own.
export function ProviderRow({
	label,
	status,
	actions,
	children,
}: {
	label: string;
	status?: string;
	actions?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<UI.Column spacing={4}>
			<UI.Row alignment="center" spacing={12}>
				<UI.Column spacing={2}>
					<UI.Text numberOfLines={1}>{label}</UI.Text>
					{status ? (
						<UI.Text numberOfLines={2} textStyle={SUBTLE_TEXT}>
							{status}
						</UI.Text>
					) : null}
				</UI.Column>
				<UI.Spacer flexible />
				{children}
			</UI.Row>
			{actions ? (
				<UI.Row alignment="center" spacing={16}>
					{actions}
					<UI.Spacer flexible />
				</UI.Row>
			) : null}
		</UI.Column>
	);
}

export function ExpanderRow({
	label,
	open,
	onToggle,
}: {
	label: string;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<UI.FieldGroup.Section>
			<UI.Row alignment="center" onPress={onToggle}>
				<UI.Text>{label}</UI.Text>
				<UI.Spacer flexible />
				<UI.Text textStyle={SUBTLE_TEXT}>{open ? "Hide" : "Show"}</UI.Text>
			</UI.Row>
		</UI.FieldGroup.Section>
	);
}

export function DestinationSection({
	destination,
	settingsDisabled,
}: {
	destination: DestinationSettings;
	settingsDisabled: boolean;
}) {
	return (
		<UI.FieldGroup.Section title="Destination">
			<UI.Row alignment="center" spacing={12}>
				<UI.Text numberOfLines={1}>
					{destination.streamUrl
						? describeStreamUrl(destination.streamUrl)
						: "No SRT destination"}
				</UI.Text>
				<UI.Spacer flexible />
				<UI.Button
					disabled={settingsDisabled}
					label={destination.streamUrl ? "Replace" : "Add"}
					onPress={destination.onEdit}
					variant="text"
				/>
				{destination.streamUrl ? (
					<UI.Button
						disabled={settingsDisabled}
						onPress={destination.onRemove}
						variant="text"
					>
						<UI.Text textStyle={{ color: DESTRUCTIVE }}>Delete</UI.Text>
					</UI.Button>
				) : null}
			</UI.Row>
		</UI.FieldGroup.Section>
	);
}
