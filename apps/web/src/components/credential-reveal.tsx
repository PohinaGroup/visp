import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DocsHelpLink } from "@/components/docs-help-link";

async function copyToClipboard(value: string | (() => Promise<string>)) {
	try {
		await navigator.clipboard.writeText(
			typeof value === "function" ? await value() : value,
		);
		toast.success("Copied");
	} catch (error) {
		toast.error(
			error instanceof Error
				? error.message
				: "Could not copy to the clipboard",
		);
	}
}

export function CopyButton({
	value,
	label = "Copy",
	variant = "secondary",
	size = "sm",
}: {
	value: string | (() => Promise<string>);
	label?: string;
	variant?: "primary" | "secondary" | "ghost";
	size?: "sm" | "md";
}) {
	const [isLoading, setIsLoading] = useState(false);
	const copy = async () => {
		setIsLoading(true);
		try {
			await copyToClipboard(value);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Button
			icon={<Icon color="inherit" icon={CopyIcon} size="sm" />}
			isLoading={isLoading}
			label={label}
			size={size}
			variant={variant}
			onClick={copy}
		/>
	);
}

export function MaskedUrlWithFallback({
	label,
	srt,
	rtmp,
	srtla,
	getSrt,
	getRtmp,
	getSrtla,
	docsHref,
	docsLabel,
}: {
	label: string;
	srt: string;
	rtmp: string;
	srtla?: string;
	getSrt: () => Promise<string>;
	getRtmp: () => Promise<string>;
	getSrtla?: () => Promise<string>;
	docsHref?: string;
	docsLabel?: string;
}) {
	return (
		<VStack gap={2}>
			<Card padding={3} variant="muted">
				<VStack gap={2}>
					<HStack gap={3} hAlign="between" vAlign="center">
						<HStack gap={1.5} vAlign="center">
							<Text type="label">{label}</Text>
							{docsHref && docsLabel ? (
								<DocsHelpLink href={docsHref} label={docsLabel} />
							) : null}
						</HStack>
						<CopyButton label="Copy URL" value={getSrt} />
					</HStack>
					<Text size="xsm" color="placeholder" wordBreak="break-all">
						{srt}
					</Text>
				</VStack>
			</Card>
			<Collapsible
				defaultIsOpen={false}
				trigger={
					<Text color="secondary" type="supporting">
						App doesn't accept SRT? Show the RTMP URL
					</Text>
				}
			>
				<Card padding={3} variant="muted">
					<VStack gap={2}>
						<HStack gap={3} hAlign="between" vAlign="center">
							<Text type="label">RTMP fallback</Text>
							<CopyButton label="Copy URL" value={getRtmp} />
						</HStack>
						<Text type="code" wordBreak="break-all">
							{rtmp}
						</Text>
					</VStack>
				</Card>
			</Collapsible>
			{srtla && getSrtla ? (
				<Collapsible
					defaultIsOpen={false}
					trigger={
						<Text color="secondary" type="supporting">
							Bonding two connections with BELABOX or Moblin? Show the SRTLA URL
						</Text>
					}
				>
					<Card padding={3} variant="muted">
						<VStack gap={2}>
							<HStack gap={3} hAlign="between" vAlign="center">
								<Text type="label">SRTLA</Text>
								<CopyButton label="Copy URL" value={getSrtla} />
							</HStack>
							<Text type="code" wordBreak="break-all">
								{srtla}
							</Text>
						</VStack>
					</Card>
				</Collapsible>
			) : null}
		</VStack>
	);
}

export function SimpleUrl({
	label,
	url,
	copyValue,
	docsHref,
	docsLabel,
}: {
	label: string;
	url: string;
	copyValue: string | (() => Promise<string>);
	docsHref?: string;
	docsLabel?: string;
}) {
	return (
		// rr-block keeps secrets out of session replay
		<div className="rr-block" data-rybbit-block>
			<VStack gap={1}>
				<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
					<HStack gap={1.5} vAlign="center">
						<Text size="2xl" weight="bold">
							{label}
						</Text>
						{docsHref && docsLabel ? (
							<DocsHelpLink href={docsHref} label={docsLabel} />
						) : null}
					</HStack>
					<CopyButton label="Copy" value={copyValue} />
				</HStack>
				<Link
					color="placeholder"
					label="Copy"
					size="xsm"
					style={{ wordBreak: "break-all", textAlign: "start" }}
					tooltip="Copy"
					onClick={() => {
						void copyToClipboard(copyValue);
					}}
				>
					{url}
				</Link>
			</VStack>
		</div>
	);
}

export function RevealedValue({
	label,
	value,
	docsHref,
	docsLabel,
}: {
	label: string;
	value: string;
	docsHref?: string;
	docsLabel?: string;
}) {
	return (
		// rr-block keeps secrets out of session replay
		<div className="rr-block" data-rybbit-block>
			<Card padding={3} variant="muted">
				<VStack gap={2}>
					<HStack gap={3} hAlign="between" vAlign="center">
						<HStack gap={1.5} vAlign="center">
							<Text type="label">{label}</Text>
							{docsHref && docsLabel ? (
								<DocsHelpLink href={docsHref} label={docsLabel} />
							) : null}
						</HStack>
						<CopyButton value={value} />
					</HStack>
					<Text type="code" wordBreak="break-all">
						{value}
					</Text>
				</VStack>
			</Card>
		</div>
	);
}

export function UrlWithFallback({
	label = "Stream URL",
	srt,
	rtmp,
	docsHref,
	docsLabel,
}: {
	label?: string;
	srt: string;
	rtmp: string;
	docsHref?: string;
	docsLabel?: string;
}) {
	return (
		<VStack gap={2}>
			<RevealedValue
				docsHref={docsHref}
				docsLabel={docsLabel}
				label={label}
				value={srt}
			/>
			<Collapsible
				defaultIsOpen={false}
				trigger={
					<Text color="secondary" type="supporting">
						App doesn't accept SRT? Show the RTMP URL
					</Text>
				}
			>
				<RevealedValue label="RTMP fallback" value={rtmp} />
			</Collapsible>
		</VStack>
	);
}

export function downloadSceneCollection(sceneCollection: {
	filename: string;
	json: unknown;
}) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(sceneCollection.json, null, 2)], {
			type: "application/json",
		}),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = sceneCollection.filename;
	link.click();
	URL.revokeObjectURL(url);
}
