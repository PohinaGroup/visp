import type { AppRouter } from "@VISP/api/routers/index";
import type { TRPCClient } from "@trpc/client";

import { saveStreamUrl, selectPublishUrl } from "./stream-url";

export function describeProvisionError(error: unknown): string {
	if (!(error instanceof Error)) {
		return "The publish URL could not be created.";
	}
	if (
		error.message.includes("Unexpected end of input") ||
		error.message.includes("JSON Parse")
	) {
		return "Could not reach the VISP server. Check your connection and sign in again.";
	}
	return error.message;
}

export async function syncNativePublishUrl(
	apiClient: TRPCClient<AppRouter>,
	input: {
		installationId: string;
		label: string;
		userId: string;
	},
): Promise<string> {
	const device = await apiClient.paths.claimNative.mutate({
		installationId: input.installationId,
		label: input.label,
	});
	const url = selectPublishUrl([device.urls]);
	await saveStreamUrl(url, input.userId);
	return url;
}
