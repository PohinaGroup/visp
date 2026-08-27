export {
	emptySavedStudioNeedsWarning,
	emptyStudioNeedsWarning,
	emptyStudioWarningDecision,
} from "@VISP/api/studio-warning";

export function studioEditUrl(origin: string, locale: "en" | "fi" = "en") {
	const url = new URL("/studio", origin);
	if (locale === "fi") url.searchParams.set("lang", "fi");
	return url.toString();
}
