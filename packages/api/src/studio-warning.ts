export type EmptyStudioWarningChoice = "cancel" | "continue" | "dismiss";

export function emptyStudioNeedsWarning(
	mode: "cloud_studio" | "obs",
	sourceCount: number,
	dismissed: boolean,
) {
	return mode === "cloud_studio" && sourceCount === 0 && !dismissed;
}

export function emptySavedStudioNeedsWarning(
	mode: "cloud_studio" | "obs",
	graph: { scenes: ReadonlyArray<{ layers: readonly unknown[] }> },
	dismissed: boolean,
) {
	return emptyStudioNeedsWarning(
		mode,
		graph.scenes.reduce((count, scene) => count + scene.layers.length, 0),
		dismissed,
	);
}

export function emptyStudioWarningDecision(choice: EmptyStudioWarningChoice) {
	return {
		continue: choice !== "cancel",
		dismiss: choice === "dismiss",
	};
}
