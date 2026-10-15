import "./test-env";
import {
	claimTypographyUpload,
	createTypographyProject,
	finalizeTypographyUpload,
	JOB_LEASE_MS,
	MAX_TYPOGRAPHY_PROJECTS,
	requestTypographyExport,
	requeueStaleTypographyJobs,
	TypographyError,
} from "@VISP/api/typography";
import { db } from "@VISP/db";
import {
	appUser,
	typographyJob,
	typographyProject,
	user,
} from "@VISP/db/schema/index";
import {
	afterAll,
	beforeEach,
	test as bunTest,
	describe,
	expect,
	spyOn,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

const PREFIX = "typography-limits-test-";
const OWNER = `${PREFIX}owner`;
const input = {
	filename: "clip.mp4",
	language: "en" as const,
	contentType: "video/mp4",
	byteSize: 1024,
};

async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof TypographyError) return error.status;
		throw error;
	}
	throw new Error("expected a refusal");
}

async function addProject(state: "uploading" | "processing" | "ready") {
	const id = randomUUID();
	await db.insert(typographyProject).values({
		id,
		userId: OWNER,
		title: "clip",
		language: "en",
		state,
		sourceKey: `typography/${OWNER}/${id}/source`,
		document: { version: 1, words: [] },
		expiresAt: new Date(Date.now() + 60 * 60_000),
	});
	return id;
}

integration("typography limits", () => {
	beforeEach(async () => {
		await db.delete(user).where(like(user.id, `${PREFIX}%`));
		await db.insert(user).values({
			id: OWNER,
			name: OWNER,
			email: `${OWNER}@typography.test`,
		});
		await db.insert(appUser).values({ id: OWNER, handle: OWNER, plan: "plus" });
	});

	afterAll(async () => {
		await db.delete(user).where(like(user.id, `${PREFIX}%`));
	});

	test("caps live projects per user, even under concurrent creates", async () => {
		for (let index = 0; index < MAX_TYPOGRAPHY_PROJECTS - 1; index += 1)
			await createTypographyProject(OWNER, input);
		const results = await Promise.allSettled(
			Array.from({ length: 5 }, () => createTypographyProject(OWNER, input)),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		for (const result of results) {
			if (result.status === "rejected")
				expect((result.reason as TypographyError).status).toBe(429);
		}
		expect(await refusal(createTypographyProject(OWNER, input))).toBe(429);

		// Expired projects no longer count.
		await db
			.update(typographyProject)
			.set({ expiresAt: new Date(Date.now() - 1_000) })
			.where(eq(typographyProject.userId, OWNER));
		const { project } = await createTypographyProject(OWNER, input);
		expect(project?.state).toBe("uploading");
	});

	test("finalize starts one transcription per upload", async () => {
		const id = await addProject("uploading");
		const claims = await Promise.all(
			Array.from({ length: 5 }, () => claimTypographyUpload(OWNER, id)),
		);
		expect(claims.filter(Boolean)).toHaveLength(1);
		// Refused before the object store is touched.
		expect(await refusal(finalizeTypographyUpload(OWNER, id))).toBe(409);
		const ready = await addProject("ready");
		expect(await refusal(finalizeTypographyUpload(OWNER, ready))).toBe(409);
		expect(await claimTypographyUpload("someone-else", ready)).toBe(false);
		expect(await refusal(finalizeTypographyUpload(OWNER, randomUUID()))).toBe(
			404,
		);
	});

	test("a failed job insert leaves the upload claimable again", async () => {
		const id = await addProject("uploading");
		// The source object's HEAD, so finalize gets as far as the claim.
		const head = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { headers: { "content-type": "video/mp4" } }),
		);
		const real = db.transaction.bind(db);
		const transaction = spyOn(db, "transaction").mockImplementation(((
			callback: (tx: unknown) => Promise<unknown>,
		) =>
			real((tx) =>
				callback(
					Object.create(tx, {
						insert: {
							value: () => {
								throw new Error("insert failed");
							},
						},
					}),
				),
			)) as never);
		try {
			await expect(finalizeTypographyUpload(OWNER, id)).rejects.toThrow(
				"insert failed",
			);
			const state = async () =>
				(
					await db
						.select()
						.from(typographyProject)
						.where(eq(typographyProject.id, id))
				)[0]?.state;
			expect(await state()).toBe("uploading");
			transaction.mockRestore();
			await finalizeTypographyUpload(OWNER, id);
			expect(await state()).toBe("processing");
			const [job] = await db
				.select()
				.from(typographyJob)
				.where(eq(typographyJob.projectId, id));
			expect(job?.state).toBe("queued");
		} finally {
			transaction.mockRestore();
			head.mockRestore();
		}
	});

	test("export refuses while a render is queued or running", async () => {
		const id = await addProject("ready");
		expect(await requestTypographyExport(OWNER, id)).toEqual({ ok: true });
		expect(await refusal(requestTypographyExport(OWNER, id))).toBe(409);
		const jobWhere = and(
			eq(typographyJob.projectId, id),
			eq(typographyJob.kind, "export"),
		);
		await db.update(typographyJob).set({ state: "processing" }).where(jobWhere);
		expect(await refusal(requestTypographyExport(OWNER, id))).toBe(409);
		for (const state of ["completed", "failed"] as const) {
			await db.update(typographyJob).set({ state }).where(jobWhere);
			expect(await requestTypographyExport(OWNER, id)).toEqual({ ok: true });
			const [job] = await db.select().from(typographyJob).where(jobWhere);
			expect(job?.state).toBe("queued");
		}
		const uploading = await addProject("uploading");
		expect(await refusal(requestTypographyExport(OWNER, uploading))).toBe(409);
	});

	test("startup requeues only jobs whose lease ran out", async () => {
		const now = new Date();
		const stale = randomUUID();
		const live = randomUUID();
		await db.insert(typographyJob).values([
			{
				id: stale,
				projectId: await addProject("processing"),
				kind: "transcription",
				state: "processing",
				updatedAt: new Date(now.getTime() - JOB_LEASE_MS - 1_000),
			},
			{
				id: live,
				projectId: await addProject("processing"),
				kind: "transcription",
				state: "processing",
				updatedAt: new Date(now.getTime() - 60_000),
			},
		]);
		expect(await requeueStaleTypographyJobs(now)).toBeGreaterThanOrEqual(1);
		const state = async (id: string) =>
			(await db.select().from(typographyJob).where(eq(typographyJob.id, id)))[0]
				?.state;
		expect(await state(stale)).toBe("queued");
		expect(await state(live)).toBe("processing");
	});
});
