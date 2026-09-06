import { createHash } from "node:crypto";
import sharp from "sharp";
import { STUDIO_MEDIA_MAX_BYTES, STUDIO_MEDIA_TYPES } from "./studio-alert";

export async function validateStudioMedia(
	bytes: Uint8Array,
	contentType: string,
) {
	if (bytes.byteLength > STUDIO_MEDIA_MAX_BYTES)
		throw new Error("Image must be at most 10 MB");
	if (!(STUDIO_MEDIA_TYPES as readonly string[]).includes(contentType))
		throw new Error("Unsupported image type");
	const head = Buffer.from(bytes.subarray(0, 12));
	const signatureMatches =
		contentType === "image/gif"
			? /^GIF8[79]a/.test(head.toString("ascii"))
			: contentType === "image/jpeg"
				? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
				: contentType === "image/webp"
					? head.toString("ascii", 0, 4) === "RIFF" &&
						head.toString("ascii", 8, 12) === "WEBP"
					: head
							.subarray(0, 8)
							.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	if (!signatureMatches)
		throw new Error("Image contents do not match its type");
	const image = sharp(bytes, {
		animated: true,
		failOn: "warning",
		limitInputPixels: 64 * 1024 * 1024,
	});
	const meta = await image.metadata();
	if (`image/${meta.format}` !== contentType)
		throw new Error("Image contents do not match its type");
	const height = meta.pageHeight ?? meta.height;
	const frames = meta.pages ?? 1;
	if (
		!meta.width ||
		!height ||
		meta.width > 7680 ||
		height > 4320 ||
		frames > 300 ||
		meta.width * height * frames > 64 * 1024 * 1024
	)
		throw new Error(
			"Image dimensions or animation frame count exceed the limit",
		);
	const delays = (meta.delay ?? [100]).map((delay) => Math.max(20, delay));
	if (frames > 1 && delays.reduce((sum, delay) => sum + delay, 0) > 30_000)
		throw new Error("Animation must be at most 30 seconds");
	const animated = frames > 1;
	const { data, info } = await (animated
		? image.gif({ loop: 0, delay: delays })
		: image.autoOrient().png()
	)
		.timeout({ seconds: 10 })
		.toBuffer({ resolveWithObject: true });
	if (data.byteLength > STUDIO_MEDIA_MAX_BYTES)
		throw new Error("Decoded image is too large; upload a smaller image");
	return {
		bytes: data,
		width: info.width,
		height: animated ? height : info.height,
		contentType: animated ? "image/gif" : "image/png",
		extension: animated ? "gif" : "png",
		checksum: createHash("sha256").update(data).digest("hex"),
	};
}
