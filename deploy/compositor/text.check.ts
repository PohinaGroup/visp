import assert from "node:assert/strict";
import sharp from "../../packages/api/node_modules/sharp";
import { renderStudioTextPng } from "./text";

// CHROMIUM_BIN=/path/to/chromium bun deploy/compositor/text.check.ts
const width = 1518;
const height = 284;
const png = await renderStudioTextPng({
	width,
	height,
	text: "This channel streams 24/7 from a VISP relay. Phone to Twitch with no OBS- https://visp-stream.com. Ask the bot anything with @vispstream. Join our discord at https://discord.gg/bufTZqbn4z",
});
const { data, info } = await sharp(png)
	.extract({ left: 0, top: 0, width, height })
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });
assert.equal(info.width, width);
assert.equal(info.height, height);
assert.equal(data[3], 0, "the text background stays transparent");
let lines = 0;
let previous = false;
for (let y = 0; y < height; y++) {
	let ink = false;
	for (let x = 0; x < width; x++) {
		const i = (y * width + x) * 4;
		if (data.readUInt8(i) > 200 && data.readUInt8(i + 3) > 200) ink = true;
	}
	if (ink && !previous) lines++;
	previous = ink;
}
assert.equal(
	lines,
	4,
	"the saved text wraps into four readable lines, as in Studio",
);
const empty = await renderStudioTextPng({ width: 320, height: 180, text: "" });
const rgba = await sharp(empty).ensureAlpha().raw().toBuffer();
assert(
	rgba.every((value, i) => i % 4 !== 3 || value === 0),
	"empty text stays empty on air",
);
console.log(
	"ok: broadcast text wraps at the saved width and preserves transparency",
);
