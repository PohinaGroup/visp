import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const contentDir = fileURLToPath(
	new URL("../../content/blog/", import.meta.url),
);

type Frontmatter = Record<string, string>;

function parseFrontmatter(source: string) {
	const match = source.match(/^---\n([\s\S]*?)\n---\n/);
	if (!match?.[1]) throw new Error("Missing frontmatter");
	return Object.fromEntries(
		match[1].split("\n").map((line) => {
			const separator = line.indexOf(":");
			if (separator < 1) throw new Error(`Invalid frontmatter line: ${line}`);
			return [
				line.slice(0, separator),
				line
					.slice(separator + 1)
					.trim()
					.replace(/^"|"$/g, ""),
			];
		}),
	) as Frontmatter;
}

async function loadPosts() {
	const slugs = (await readdir(contentDir, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	return Promise.all(
		slugs.map(async (slug) => {
			const source = await Bun.file(
				path.join(contentDir, slug, "index.mdx"),
			).text();
			return { frontmatter: parseFrontmatter(source), slug, source };
		}),
	);
}

describe("blog content", () => {
	test("ships six uniquely addressed, SEO-sized launch articles", async () => {
		const posts = await loadPosts();
		expect(posts).toHaveLength(6);
		expect(new Set(posts.map((post) => post.slug)).size).toBe(posts.length);

		for (const { frontmatter, slug, source } of posts) {
			expect(frontmatter.title).toBeTruthy();
			expect(frontmatter.description?.length).toBeGreaterThanOrEqual(120);
			expect(frontmatter.description?.length).toBeLessThanOrEqual(160);
			expect(frontmatter.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(frontmatter.coverAlt).toBeTruthy();
			expect(source).not.toMatch(/^# /m);
			expect(source.split(/\s+/).length).toBeGreaterThanOrEqual(1_200);
			expect(
				await Bun.file(path.join(contentDir, slug, "cover.png")).exists(),
			).toBe(true);
		}
	});

	test("has no empty alt text or broken relative image references", async () => {
		for (const { slug, source } of await loadPosts()) {
			expect(source).not.toMatch(/!\[\s*\]\(/);
			const images = [...source.matchAll(/!\[[^\]]+\]\((\.\/[^)]+)\)/g)];
			expect(images.length).toBeGreaterThan(0);
			for (const image of images) {
				expect(
					await Bun.file(path.join(contentDir, slug, image[1] ?? "")).exists(),
				).toBe(true);
			}
		}
	});

	test("uses correctly sized social covers and supporting diagrams", async () => {
		for (const { slug } of await loadPosts()) {
			const bytes = new Uint8Array(
				await Bun.file(path.join(contentDir, slug, "cover.png")).arrayBuffer(),
			);
			const view = new DataView(bytes.buffer);
			expect(view.getUint32(16)).toBe(1200);
			expect(view.getUint32(20)).toBe(630);

			const files = await readdir(path.join(contentDir, slug));
			const diagrams = files.filter(
				(file) => file.endsWith(".svg") && file !== "cover.svg",
			);
			expect(diagrams).toHaveLength(1);
			const diagram = await Bun.file(
				path.join(contentDir, slug, diagrams[0] ?? ""),
			).text();
			expect(diagram).toContain('width="1600" height="900"');
		}
	});
});
