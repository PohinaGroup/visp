import { defineCollections, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const blogPosts = defineCollections({
	type: "doc",
	dir: "content/blog",
	schema: frontmatterSchema.extend({
		description: z.string().min(120).max(160),
		publishedAt: z.iso.date(),
		updatedAt: z.iso.date().optional(),
		coverAlt: z.string().min(1),
	}),
});
