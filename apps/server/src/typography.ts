import { betterFeatures } from "@VISP/api/better-features";
import { fixedWindow } from "@VISP/api/rate-limit";
import {
	createTypographyProject,
	finalizeTypographyUpload,
	listTypographyProjects,
	requestTypographyExport,
	saveTypographyProject,
	TypographyError,
	typographyDocumentSchema,
	typographyExportUrl,
	typographyVideoUrl,
} from "@VISP/api/typography";
import { getUserSession } from "@VISP/auth";
import { Elysia } from "elysia";
import { z } from "zod";

const projectId = z.object({ id: z.uuid() });
const createInput = z.object({
	filename: z.string().trim().min(1).max(255),
	language: z.enum(["en", "fi"]),
	contentType: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
	byteSize: z
		.number()
		.int()
		.positive()
		.max(1024 * 1024 * 1024),
});
const saveInput = z.object({ document: typographyDocumentSchema });

/**
 * Per-user ceilings on the calls that spend: create reserves up to 1 GB of
 * storage, finalize bills a Scribe transcription, export takes the single
 * render worker. Generous for someone editing by hand.
 */
const createRequests = fixedWindow(10, 60 * 60_000);
const finalizeRequests = fixedWindow(10, 60 * 60_000);
const exportRequests = fixedWindow(30, 60 * 60_000);

export function resetTypographyRateLimits() {
	createRequests.reset();
	finalizeRequests.reset();
	exportRequests.reset();
}

async function userId(headers: Headers) {
	const session = await getUserSession(headers);
	return session?.user.id ?? null;
}

/**
 * Typography transcribes with the same ElevenLabs Scribe account as hosted
 * subtitles, so the same admin switch admits it.
 */
async function typographyEnabled(id: string) {
	return (await betterFeatures(id)).betterSubtitles;
}

function failure(error: unknown, fallback: string) {
	if (error instanceof TypographyError)
		return { code: error.status, error: error.message };
	return {
		code: 400 as const,
		error: error instanceof Error ? error.message : fallback,
	};
}

export const typographyRoutes = new Elysia({ name: "typography-routes" })
	.get("/api/typography/projects", async ({ request, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		return await listTypographyProjects(id);
	})
	.get("/api/typography/projects/:id", async ({ request, params, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		const project = projectId.safeParse(params);
		if (!project.success) return status(400, { error: "Invalid project" });
		const projects = await listTypographyProjects(id);
		const result = projects.find((item) => item.id === project.data.id);
		return result ?? status(404, { error: "Project not found" });
	})
	.post("/api/typography/projects", async ({ request, body, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		if (!(await typographyEnabled(id)))
			return status(403, { error: "Typography is not enabled" });
		const parsed = createInput.safeParse(body);
		if (!parsed.success) return status(400, { error: "Invalid project" });
		if (!createRequests.take(id))
			return status(429, { error: "Too many requests" });
		try {
			return await createTypographyProject(id, parsed.data);
		} catch (error) {
			const { code, error: message } = failure(error, "Project failed");
			return status(code, { error: message });
		}
	})
	.put(
		"/api/typography/projects/:id",
		async ({ request, params, body, status }) => {
			const id = await userId(request.headers);
			if (!id) return status(401, { error: "Authentication required" });
			const project = projectId.safeParse(params);
			const input = saveInput.safeParse(body);
			if (!project.success || !input.success)
				return status(400, { error: "Invalid project" });
			try {
				await saveTypographyProject(id, project.data.id, input.data.document);
				return { ok: true };
			} catch {
				return status(404, { error: "Project not found" });
			}
		},
	)
	.post(
		"/api/typography/projects/:id/finalize",
		async ({ request, params, status }) => {
			const id = await userId(request.headers);
			if (!id) return status(401, { error: "Authentication required" });
			if (!(await typographyEnabled(id)))
				return status(403, { error: "Typography is not enabled" });
			const project = projectId.safeParse(params);
			if (!project.success) return status(400, { error: "Invalid project" });
			if (!finalizeRequests.take(id))
				return status(429, { error: "Too many requests" });
			try {
				await finalizeTypographyUpload(id, project.data.id);
				return { ok: true };
			} catch (error) {
				const { code, error: message } = failure(error, "Upload failed");
				return status(code, { error: message });
			}
		},
	)
	.post(
		"/api/typography/projects/:id/export",
		async ({ request, params, status }) => {
			const id = await userId(request.headers);
			if (!id) return status(401, { error: "Authentication required" });
			if (!(await typographyEnabled(id)))
				return status(403, { error: "Typography is not enabled" });
			const project = projectId.safeParse(params);
			if (!project.success) return status(400, { error: "Invalid project" });
			if (!exportRequests.take(id))
				return status(429, { error: "Too many requests" });
			try {
				return await requestTypographyExport(id, project.data.id);
			} catch (error) {
				const { code, error: message } = failure(error, "Export failed");
				return status(code, { error: message });
			}
		},
	)
	.get(
		"/api/typography/projects/:id/video",
		async ({ request, params, status }) => {
			const id = await userId(request.headers);
			if (!id) return status(401, { error: "Authentication required" });
			const project = projectId.safeParse(params);
			if (!project.success) return status(400, { error: "Invalid project" });
			try {
				return { url: await typographyVideoUrl(id, project.data.id) };
			} catch {
				return status(404, { error: "Project not found" });
			}
		},
	)
	.get(
		"/api/typography/projects/:id/export",
		async ({ request, params, status }) => {
			const id = await userId(request.headers);
			if (!id) return status(401, { error: "Authentication required" });
			const project = projectId.safeParse(params);
			if (!project.success) return status(400, { error: "Invalid project" });
			try {
				const url = await typographyExportUrl(id, project.data.id);
				return url ? { url } : status(202, { url: null });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Export failed";
				if (message === "Project not found" || message === "Export not found")
					return status(404, { error: message });
				return status(500, { error: "Export failed. Please try again." });
			}
		},
	);
