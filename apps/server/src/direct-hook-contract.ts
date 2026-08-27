import { validateDirectDestination } from "@VISP/api/direct-destination";
import type { DirectProvider } from "@VISP/api/direct-model";

type DirectHookDestination = {
	filter: string | null;
	provider: DirectProvider;
	role: "landscape" | "portrait";
	url: string;
};

export function formatLegacyDirectDestinations(
	destinations: DirectHookDestination[],
) {
	return destinations
		.filter(({ role }) => role === "landscape")
		.map(
			({ provider, url }) =>
				`${provider} ${validateDirectDestination(provider, url)}\n`,
		)
		.join("");
}

export function formatV2DirectDestinations(
	destinations: DirectHookDestination[],
) {
	return destinations
		.map(
			({ provider, role, filter, url }) =>
				`${provider} ${role} ${filter ?? "-"} ${validateDirectDestination(provider, url)}\n`,
		)
		.join("");
}

export function directDestinationResponse(body: string) {
	return new Response(body, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
