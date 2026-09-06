import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/utils/trpc";
import type { PathView } from "./types";

export function RelayRegion({ path }: { path: PathView }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const relays = useQuery(trpc.relays.list.queryOptions());
	const move = useMutation(
		trpc.paths.moveRelay.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(
					"Region changed. Refresh the VISP app destination and update external publisher and OBS URLs.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	return (
		<VStack gap={2}>
			<Text type="supporting">
				Relay: {path.relay.region} · {path.relay.name}
			</Text>
			{relays.data?.some((relay) => relay.id !== path.relay.id) ? (
				<>
					<Text color="secondary" type="supporting">
						Stop all sources, OBS readers and Direct/BRB outputs before changing
						region. Keep devices used for Direct handover on the same relay.
					</Text>
					<HStack gap={2} wrap="wrap">
						{relays.data
							?.filter((relay) => relay.id !== path.relay.id)
							.map((relay) => (
								<Button
									key={relay.id}
									label={`Move to ${relay.region} · ${relay.name}`}
									size="sm"
									variant="secondary"
									isDisabled={Boolean(path.publishing) || move.isPending}
									onClick={() => {
										if (
											window.confirm(
												`Move ${path.label} to ${relay.region}? Its sending and receiving URLs will change. Update external publishers and OBS, and refresh the destination in the VISP app.`,
											)
										) {
											move.mutate({ pathId: path.id, relayId: relay.id });
										}
									}}
								/>
							))}
					</HStack>
				</>
			) : null}
		</VStack>
	);
}
