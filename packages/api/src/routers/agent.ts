import { db } from "@VISP/db";
import { agent, agentAction, agentActivity } from "@VISP/db/schema/index";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { agentActionInput, executeAgentAction } from "../agent-actions";
import { protectedProcedure, router } from "../index";

export const agentRouter = router({
	pendingActions: protectedProcedure.query(({ ctx }) =>
		db
			.select({
				id: agentAction.id,
				agentName: agent.name,
				capability: agentAction.capability,
				input: agentAction.input,
				expiresAt: agentAction.expiresAt,
			})
			.from(agentAction)
			.innerJoin(agent, eq(agent.id, agentAction.agentId))
			.where(
				and(
					eq(agentAction.userId, ctx.session.user.id),
					eq(agentAction.status, "pending"),
					gt(agentAction.expiresAt, new Date()),
				),
			)
			.orderBy(desc(agentAction.createdAt)),
	),
	resolveAction: protectedProcedure
		.input(z.object({ id: z.uuid(), approve: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const [request] = await db
				.update(agentAction)
				.set({
					status: input.approve ? "executing" : "rejected",
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(agentAction.id, input.id),
						eq(agentAction.userId, ctx.session.user.id),
						eq(agentAction.status, "pending"),
						gt(agentAction.expiresAt, new Date()),
					),
				)
				.returning();
			if (!request) throw new Error("Action is no longer pending");
			if (!input.approve) {
				await db.insert(agentActivity).values({
					id: crypto.randomUUID(),
					agentId: request.agentId,
					userId: ctx.session.user.id,
					capability: request.capability,
					target: "action",
					result: "rejected",
				});
				return { status: "rejected" };
			}
			const parsed = agentActionInput.safeParse(JSON.parse(request.input));
			if (!parsed.success) throw new Error("Stored agent action is invalid");
			try {
				const result = await executeAgentAction(
					ctx.session.user.id,
					parsed.data,
				);
				await db
					.update(agentAction)
					.set({
						status: "succeeded",
						result: JSON.stringify(result),
						updatedAt: new Date(),
					})
					.where(eq(agentAction.id, request.id));
				await db.insert(agentActivity).values({
					id: crypto.randomUUID(),
					agentId: request.agentId,
					userId: ctx.session.user.id,
					capability: request.capability,
					target: "action",
					result: "succeeded",
				});
				return { status: "succeeded", result };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Action failed";
				await db
					.update(agentAction)
					.set({
						status: "failed",
						result: JSON.stringify({ error: message }),
						updatedAt: new Date(),
					})
					.where(eq(agentAction.id, request.id));
				await db.insert(agentActivity).values({
					id: crypto.randomUUID(),
					agentId: request.agentId,
					userId: ctx.session.user.id,
					capability: request.capability,
					target: "action",
					result: "failed",
				});
				throw new Error(message);
			}
		}),
	activity: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(20) })
				.optional(),
		)
		.query(async ({ ctx, input }) =>
			db
				.select({
					id: agentActivity.id,
					agentName: agent.name,
					capability: agentActivity.capability,
					target: agentActivity.target,
					result: agentActivity.result,
					createdAt: agentActivity.createdAt,
				})
				.from(agentActivity)
				.innerJoin(agent, eq(agent.id, agentActivity.agentId))
				.where(eq(agentActivity.userId, ctx.session.user.id))
				.orderBy(desc(agentActivity.createdAt))
				.limit(input?.limit ?? 20),
		),
});
