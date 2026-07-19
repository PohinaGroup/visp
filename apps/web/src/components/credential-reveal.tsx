import { Button } from "@VISP/ui/components/button";
import { CopyIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { toast } from "sonner";

export function CopyButton({
	value,
	size = "sm",
	variant = "outline",
	children,
}: {
	value: string;
	size?: ComponentProps<typeof Button>["size"];
	variant?: ComponentProps<typeof Button>["variant"];
	children?: React.ReactNode;
}) {
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success("Copied");
		} catch {
			toast.error("Could not copy to the clipboard");
		}
	};

	return (
		<Button size={size} variant={variant} onClick={copy}>
			<CopyIcon data-icon="inline-start" />
			{children ?? "Copy"}
		</Button>
	);
}

export function RevealedValue({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div
			className="rr-block flex flex-col gap-2 border p-3"
			data-rybbit-block
		>
			<div className="flex items-center justify-between gap-3">
				<strong>{label}</strong>
				<CopyButton value={value} />
			</div>
			<code className="break-all text-muted-foreground">{value}</code>
		</div>
	);
}

export function UrlWithFallback({
	label = "Stream URL",
	srt,
	rtmp,
}: {
	label?: string;
	srt: string;
	rtmp: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<RevealedValue label={label} value={srt} />
			<details>
				<summary className="cursor-pointer list-none text-muted-foreground text-sm hover:text-foreground [&::-webkit-details-marker]:hidden">
					App doesn't accept SRT? Show the RTMP URL
				</summary>
				<div className="pt-2">
					<RevealedValue label="RTMP fallback" value={rtmp} />
				</div>
			</details>
		</div>
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
