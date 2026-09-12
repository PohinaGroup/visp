import type { TypographyDocument } from "./typography";

function time(seconds: number) {
	const ticks = Math.max(0, Math.round(seconds * 100));
	return `${Math.floor(ticks / 360000)}:${String(Math.floor(ticks / 6000) % 60).padStart(2, "0")}:${String(Math.floor(ticks / 100) % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
}

function literal(text: string) {
	// ASS braces and backslashes are executable formatting, not transcript text.
	return text
		.replaceAll("\\", "＼")
		.replaceAll("{", "｛")
		.replaceAll("}", "｝")
		.replace(/[\r\n]+/g, " ");
}

export function captionSubtitles(document: TypographyDocument) {
	const minimal = document.style === "Minimal";
	const size = minimal ? 60 : document.style === "TikTok Basic" ? 84 : 120;
	const font = minimal ? "Barlow" : "Barlow Condensed";
	const y = minimal ? 1690 : Math.round(document.captionY * 19.2);
	const words = [...document.words].sort((a, b) => a.start - b.start);
	const groups = new Map<number, typeof words>();
	for (const word of words) {
		const group = groups.get(word.group) ?? [];
		group.push(word);
		groups.set(word.group, group);
	}
	const end = words.reduce((last, word) => Math.max(last, word.end), 0);
	const lines = [
		"[Script Info]",
		"ScriptType: v4.00+",
		"PlayResX: 1080",
		"PlayResY: 1920",
		"WrapStyle: 0",
		"ScaledBorderAndShadow: yes",
		"[V4+ Styles]",
		"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
		`Style: Caption,${font},${size},&H00FFFFFF,&H00FFFFFF,&H00080808,&H80000000,-1,0,0,0,100,100,0,0,1,${minimal ? 1 : 5},${minimal ? 2 : 0},${minimal ? 2 : 5},65,65,0,1`,
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
	];
	// Match the preview: hold the active word through gaps until the next starts.
	for (let index = 0; index < words.length; index++) {
		const active = words[index]!;
		const stop = words[index + 1]?.start ?? end;
		if (stop <= active.start) continue;
		const phrase = groups
			.get(active.group)!
			.map((word) => {
				const emphasized = word.emphasis * 100 >= document.intensity;
				const yellow =
					emphasized || (document.style === "Karaoke" && word.id === active.id);
				return `{\\fs${Math.round(size * (emphasized ? 1.12 : 1))}\\1c&H${yellow ? "4EDBEC" : "FFFFFF"}&}${literal(minimal ? word.text : word.text.toUpperCase())}`;
			})
			.join(" ");
		lines.push(
			`Dialogue: 0,${time(active.start)},${time(stop)},Caption,,0,0,0,,{\\pos(540,${y})}${phrase}`,
		);
	}
	if (document.hook && end > 0) {
		lines.push(
			`Dialogue: 1,${time(0)},${time(end)},Caption,,86,86,0,,{\\an8\\pos(540,173)\\fnBarlow Condensed\\fs68\\1c&HFFFFFF&}${literal(document.hook.toUpperCase())}`,
		);
	}
	return lines.join("\n") + "\n";
}
