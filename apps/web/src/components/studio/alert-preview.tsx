import { studioAlertAppearance, studioAlertHtml } from "@VISP/api/studio-alert";
import { useQuery } from "@tanstack/react-query";
import type { StudioLayer } from "@/lib/studio-model";
import { useTRPC } from "@/utils/trpc";

export function AlertPreview({
	layer,
	scale = 1,
	label,
}: {
	layer: Extract<StudioLayer, { type: "alert" }>;
	scale?: number;
	label: string;
}) {
	const trpc = useTRPC();
	const asset = useQuery(
		trpc.studio.assetUrl.queryOptions(
			{ assetId: layer.assetId ?? "" },
			{ enabled: !!layer.assetId, staleTime: 60_000 },
		),
	);
	const appearance = studioAlertAppearance(layer);
	return (
		<iframe
			title="Alert preview"
			sandbox="allow-same-origin"
			srcDoc={studioAlertHtml({
				width: layer.width,
				height: layer.height,
				appearance,
				label,
				fontUrl: `/fonts/studio/${appearance.font}-${appearance.fontWeight}.woff2`,
				hasMedia: !!asset.data?.url,
				mediaUrl: asset.data?.url,
			})}
			style={{
				colorScheme: "normal",
				background: "transparent",
				position: "absolute",
				left: 0,
				top: 0,
				border: 0,
				width: layer.width,
				height: layer.height,
				transform: `scale(${scale})`,
				transformOrigin: "top left",
				pointerEvents: "none",
			}}
		/>
	);
}
