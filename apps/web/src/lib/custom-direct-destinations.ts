export type CustomDestinationMetadata = {
	id: string;
	name: string;
	protocol: "rtmp" | "rtmps" | "srt";
	endpointSummary: string;
};

export type CustomDestinationDraft = { name: string; url: string };

export function customDestinationDraft(
	destination?: CustomDestinationMetadata,
): CustomDestinationDraft {
	return { name: destination?.name ?? "", url: "" };
}

export function customDestinationUpdateInput(
	destinationId: string,
	draft: CustomDestinationDraft,
) {
	const url = draft.url.trim();
	return {
		destinationId,
		name: draft.name.trim(),
		...(url ? { url } : {}),
	};
}
