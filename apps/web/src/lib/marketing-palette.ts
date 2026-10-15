export type TokenName =
	| "paper"
	| "surface"
	| "ink"
	| "inkMuted"
	| "onAir"
	| "signal"
	| "weak";

// Mirrors the `.mkt` / `html.dark .mkt` blocks in index.css (the test keeps them in sync).
export const MARKETING_PALETTE: Record<
	"light" | "dark",
	Record<TokenName, string>
> = {
	light: {
		paper: "#E9EDF0",
		surface: "#FFFFFF",
		ink: "#12263B",
		inkMuted: "#4B5D70",
		onAir: "#E5352B",
		signal: "#2E9B5C",
		weak: "#E9A23B",
	},
	dark: {
		paper: "#0E1A28",
		surface: "#152536",
		ink: "#E9EDF0",
		inkMuted: "#9FB0C0",
		onAir: "#F0483D",
		signal: "#3FBF74",
		weak: "#F0B44C",
	},
};

function luminance(hex: string): number {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}
