import { escapeHtml } from "./studio-alert";

// The editor and broadcast use the same fixed-resolution, clipped text layer.
export function studioTextHtml(input: {
	width: number;
	height: number;
	text: string;
	fontUrl: string;
}) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data: https: http:"><style>
@font-face{font-family:StudioText;src:url("${escapeHtml(input.fontUrl)}") format("woff2");font-weight:600;font-display:block}
html,body{margin:0;width:${input.width}px;height:${input.height}px;overflow:hidden;background:transparent}
body{display:flex;align-items:center;color:white;font-family:StudioText,sans-serif;font-size:54px;font-weight:600;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,.85)}
span{width:100%;max-height:100%;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap}
</style></head><body><span>${escapeHtml(input.text)}</span></body></html>`;
}
