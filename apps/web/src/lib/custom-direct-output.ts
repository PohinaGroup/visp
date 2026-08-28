export type CustomDirectOutput = {
	id: string;
	destinationId: string;
	pathId: number;
	role: "landscape" | "portrait";
	crop?: { x: number; y: number; w: number; h: number; aspect: string } | null;
	state: string | null;
	error: string | null;
};

export function customOutputsForPath(
	outputs: readonly CustomDirectOutput[],
	destinationId: string,
	pathId: number,
) {
	const matching = outputs.filter(
		(output) =>
			output.destinationId === destinationId && output.pathId === pathId,
	);
	return {
		landscape: matching.find((output) => output.role === "landscape"),
		portrait: matching.find((output) => output.role === "portrait"),
	};
}

export function customOutputStatus(output?: CustomDirectOutput) {
	return output?.error ?? output?.state ?? "Configured";
}
