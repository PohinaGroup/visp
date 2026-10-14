import { z } from "zod";

/**
 * What the admin saw when they clicked: the relay table has no updatedAt, so
 * the fields an action flips stand in for one. An update carrying this is
 * refused when the row no longer matches, instead of acting on stale state.
 */
export const relayExpectedState = z
	.object({
		enabled: z.boolean().optional(),
		drained: z.boolean().optional(),
		capacityPaths: z.number().int().optional(),
		maxForwarders: z.number().int().optional(),
	})
	.optional();

export type RelayExpectedState = z.infer<typeof relayExpectedState>;

type RelayCurrentState = {
	enabled: boolean;
	drainedAt: Date | null;
	capacityPaths: number;
	maxForwarders: number;
};

/** Names of the expected fields that no longer match the stored relay. */
export function relayPreconditionMismatches(
	current: RelayCurrentState,
	expected: RelayExpectedState,
) {
	if (!expected) return [];
	const actual = {
		enabled: current.enabled,
		drained: current.drainedAt !== null,
		capacityPaths: current.capacityPaths,
		maxForwarders: current.maxForwarders,
	};
	return (Object.keys(actual) as (keyof typeof actual)[]).filter(
		(key) => expected[key] !== undefined && expected[key] !== actual[key],
	);
}
