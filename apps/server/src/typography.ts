import {
	createTypographyProject,
	finalizeTypographyUpload,
	listTypographyProjects,
	requestTypographyExport,
	saveTypographyProject,
	typographyDocumentSchema,
	typographyExportUrl,
	typographyVideoUrl,
} from "@VISP/api/typography";
import { auth } from "@VISP/auth";
import { Elysia } from "elysia";
import { z } from "zod";

const projectId = z.object({ id: z.uuid() });
const createInput = z.object({
	filename: z.string().trim().min(1).max(255),
	language: z.enum(["en", "fi"]),
	contentType: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
	byteSize: z.number().int().positive().max(1024 * 1024 * 1024),
});
const saveInput = z.object({ document: typographyDocumentSchema });

async function userId(headers: Headers) {
	const session = await auth.api.getSession({ headers });
	return session?.user.id ?? null;
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
		const parsed = createInput.safeParse(body);
		if (!parsed.success) return status(400, { error: "Invalid project" });
		try {
			return await createTypographyProject(id, parsed.data);
		} catch (error) {
			return status(400, { error: error instanceof Error ? error.message : "Project failed" });
		}
	})
	.put("/api/typography/projects/:id", async ({ request, params, body, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		const project = projectId.safeParse(params);
		const input = saveInput.safeParse(body);
		if (!project.success || !input.success) return status(400, { error: "Invalid project" });
		try {
			await saveTypographyProject(id, project.data.id, input.data.document);
			return { ok: true };
		} catch {
			return status(404, { error: "Project not found" });
		}
	})
	.post("/api/typography/projects/:id/finalize", async ({ request, params, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		const project = projectId.safeParse(params);
		if (!project.success) return status(400, { error: "Invalid project" });
		try {
			await finalizeTypographyUpload(id, project.data.id);
			return { ok: true };
		} catch (error) {
			return status(400, { error: error instanceof Error ? error.message : "Upload failed" });
		}
	})
	.post("/api/typography/projects/:id/export", async ({ request, params, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		const project = projectId.safeParse(params);
		if (!project.success) return status(400, { error: "Invalid project" });
		try {
			return await requestTypographyExport(id, project.data.id);
		} catch (error) {
			return status(400, { error: error instanceof Error ? error.message : "Export failed" });
		}
	})
	.get("/api/typography/projects/:id/video", async ({ request, params, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		const project = projectId.safeParse(params);
		if (!project.success) return status(400, { error: "Invalid project" });
		try {
			return { url: await typographyVideoUrl(id, project.data.id) };
		} catch {
			return status(404, { error: "Project not found" });
		}
	})
	.get("/api/typography/projects/:id/export", async ({ request, params, status }) => {
		const id = await userId(request.headers);
		if (!id) return status(401, { error: "Authentication required" });
		const project = projectId.safeParse(params);
		if (!project.success) return status(400, { error: "Invalid project" });
		try {
			const url = await typographyExportUrl(id, project.data.id);
			return url ? { url } : status(202, { url: null });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Export failed";
			if (message === "Project not found" || message === "Export not found")
				return status(404, { error: message });
			return status(500, { error: "Export failed. Please try again." });
		}
	});
