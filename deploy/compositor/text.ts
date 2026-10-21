import font from "../../apps/web/public/fonts/studio/barlow-600.woff2" with {
	type: "file",
};
import { studioTextHtml } from "../../packages/api/src/studio-text";
import { renderStudioHtmlPng } from "./html";

export async function renderStudioTextPng(input: {
	width: number;
	height: number;
	text: string;
}) {
	const bytes = Buffer.from(await Bun.file(font).arrayBuffer());
	return renderStudioHtmlPng({
		...input,
		html: studioTextHtml({
			...input,
			fontUrl: `data:font/woff2;base64,${bytes.toString("base64")}`,
		}),
	});
}
