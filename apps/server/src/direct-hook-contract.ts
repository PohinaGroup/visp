import {
	type HostResolver,
	resolveHost,
	validateCustomDestinationForStorage,
} from "@VISP/api/direct-custom-destination";
import { validateDirectDestination } from "@VISP/api/direct-destination";
import type {
	DirectHookV3Destination,
	DirectProvider,
} from "@VISP/api/direct-model";

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

export async function formatV3DirectDestinations(
	destinations: DirectHookV3Destination[],
	resolver: HostResolver = resolveHost,
) {
	const validated = await Promise.all(
		destinations.map(async (destination) => {
			if (!/^[A-Za-z0-9_-]{1,128}$/.test(destination.outputId)) {
				throw new Error("Invalid Direct output identity");
			}
			if (destination.kind === "managed") {
				const provider = destination.outputId.match(
					/^managed-(twitch|kick|youtube)-(?:landscape|portrait)$/,
				)?.[1] as DirectProvider | undefined;
				if (!provider) throw new Error("Invalid managed Direct output");
				return {
					...destination,
					url: validateDirectDestination(provider, destination.url),
				};
			}
			try {
				const policy = await validateCustomDestinationForStorage(
					destination.url,
					resolver,
				);
				if (
					policy.protocol !== destination.protocol ||
					destination.muxer !==
						(destination.protocol === "srt" ? "mpegts" : "flv")
				) {
					throw new Error("mismatch");
				}
				return destination;
			} catch {
				throw new Error("Invalid custom Direct destination");
			}
		}),
	);
	return JSON.stringify({ destinations: validated });
}

export function directDestinationJsonResponse(body: string) {
	return new Response(body, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}
