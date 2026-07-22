import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { AdvancedSection } from "./advanced-section";

const SETUP_TIPS = [
	"Use the Media condition, not Source, to detect whether bytes are arriving.",
	"Ensure every condition and action toggle is enabled (blue, not grey).",
	"Keep 2 second and 3 second debounces to avoid scene flapping during reconnects.",
	"Set a 2 second keyframe interval; enable adaptive bitrate in Larix on cellular.",
	"Only one publisher can own a path at once; RTMP is the fallback when UDP is blocked.",
] as const;

export function SetupCard() {
	const t = useT();
	const fi = useLocale() === "fi";
	const tips = fi
		? [
				"Käytä Media-ehtoa, ei Source-ehtoa, saapuvien tavujen tunnistamiseen.",
				"Varmista, että kaikki ehdot ja toiminnot ovat käytössä.",
				"Pidä 2 ja 3 sekunnin viiveet, jotta kohtaus ei vaihdu edestakaisin yhteyden palautuessa.",
				"Aseta kahden sekunnin avainruutuväli ja ota Larixin mukautuva bittinopeus käyttöön mobiiliverkossa.",
				"Vain yksi julkaisija voi omistaa polun kerrallaan; RTMP on vara, kun UDP on estetty.",
			]
		: SETUP_TIPS;
	return (
		<AdvancedSection
			docsHref={docs.broadcasterSetup}
			docsLabel="See the full encoders and fallback guide"
			id="dashboard-setup"
			tag="Advanced · Reference"
			title={t("OBS and scene switcher setup")}
			value="reference"
		>
			<Text color="secondary" type="supporting">
				{fi
					? "Tuo luotu kohtauskokoelma ja määritä sitten Advanced Scene Switcher käsin."
					: "Import the generated scene collection, then configure Advanced Scene Switcher manually."}
			</Text>
			<List listStyle="decimal">
				{tips.map((tip) => (
					<ListItem key={tip} label={tip} />
				))}
			</List>
		</AdvancedSection>
	);
}
