// Client-safe: shared by the portal and the native/browser broadcaster.
//
// relay.region is free text set in Admin. Operators can type a display name
// ("US East") directly; common location codes are translated so a relay
// registered as "us-east-1" or "sin" still reads well in pickers.
const REGION_NAMES: Record<string, string> = {
	fi: "Finland",
	finland: "Finland",
	hel: "Finland",
	helsinki: "Finland",
	"eu-north": "Finland",
	"eu-north-1": "Finland",
	"europe-north1": "Finland",
	us: "United States",
	"us-east": "US East",
	"us-east-1": "US East",
	"us-east-2": "US East",
	useast: "US East",
	iad: "US East",
	ash: "US East",
	ashburn: "US East",
	nyc: "US East",
	"us-west": "US West",
	"us-west-1": "US West",
	"us-west-2": "US West",
	uswest: "US West",
	lax: "US West",
	sjc: "US West",
	sea: "US West",
	sg: "Singapore",
	sin: "Singapore",
	singapore: "Singapore",
	"ap-southeast": "Singapore",
	"ap-southeast-1": "Singapore",
	"asia-southeast1": "Singapore",
	jp: "Tokyo",
	tokyo: "Tokyo",
	nrt: "Tokyo",
	hnd: "Tokyo",
	"ap-northeast": "Tokyo",
	"ap-northeast-1": "Tokyo",
	"asia-northeast1": "Tokyo",
};

const UPPERCASE_WORDS = new Set(["us", "eu", "uk", "ap"]);

export function relayRegionLabel(region: string | null | undefined) {
	const raw = region?.trim() ?? "";
	if (!raw) return "Unknown region";
	const key = raw.toLowerCase().replace(/[\s_]+/g, "-");
	const known = REGION_NAMES[key];
	if (known) return known;
	// Already a display name: keep the operator's spelling.
	if (/[A-Z\s]/.test(raw)) return raw;
	return key
		.split("-")
		.filter(Boolean)
		.map((word) =>
			UPPERCASE_WORDS.has(word)
				? word.toUpperCase()
				: word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join(" ");
}
