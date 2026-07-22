import type { AppRouter } from "@VISP/api/routers/index";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeftIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	downloadSceneCollection,
	RevealedValue,
} from "@/components/credential-reveal";
import { DocsHelpLink } from "@/components/docs-help-link";
import { ObsPluginPromo } from "@/components/obs-plugin-promo";
import { PageHeader } from "@/components/page-header";
import {
	type SeppoClientToolCall,
	SeppoWidget,
} from "@/components/seppo-widget";
import { getObsPluginRelease } from "@/functions/get-obs-releases";
import {
	ADVANCED_SETUP_DEFAULTS,
	getAdvancedSetupAction,
} from "@/lib/advanced-setup";
import { docs } from "@/lib/docs";
import { localeSearch, useLocale, useT } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
import type { ObsPluginRelease } from "@/lib/obs-releases";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/setup")({
	validateSearch: (search: Record<string, unknown>) => ({
		lang: search.lang === "fi" ? ("fi" as const) : undefined,
		redo: search.redo === true || search.redo === "true" || search.redo === "1",
	}),
	beforeLoad: async ({ context, search }) => {
		const status = await context.queryClient.ensureQueryData(
			context.trpc.secrets.status.queryOptions(),
		);
		if (status.onboardedAt && !search.redo) {
			throw redirect({
				to: "/dashboard",
				search: localeSearch(search.lang === "fi" ? "fi" : "en"),
			});
		}
	},
	loader: () => getObsPluginRelease(),
	component: SetupWizard,
});

type Outputs = inferRouterOutputs<AppRouter>;
type SecretBundle = Outputs["onboarding"]["complete"];
type SetupUseCase = "phone_to_obs" | "remote_guest" | "multi_cam" | "other";
type Publisher = "visp" | "web" | "obs" | "larix" | "moblin" | "other";
type Destination = "twitch" | "kick" | "other";
type RedoMode = "additive" | "wipe";
type WizardStep =
	| "redo"
	| "useCase"
	| "publisher"
	| "destination"
	| "credentials"
	| "test";

type StreamingSoftware = "obs" | "visp" | "larix" | "moblin" | "other";

const QUESTION_STEPS: WizardStep[] = [
	"useCase",
	"publisher",
	"destination",
	"credentials",
	"test",
];

const SEPPO_WELCOME =
	"Hi, I'm Seppo. Tell me what you want to stream with — phone into OBS, a remote guest, multi-cam — and I'll steer the setup. Prefer the VISP phone app to publish and the VISP OBS plugin on your PC so you can sign in and add feeds without pasting URLs.";

const USE_CASE_OPTIONS: {
	value: SetupUseCase;
	title: string;
	description: string;
}[] = [
	{
		value: "phone_to_obs",
		title: "Phone camera into OBS",
		description:
			"Use your phone as a camera and mic on your streaming PC via OBS.",
	},
	{
		value: "remote_guest",
		title: "Friend or another computer",
		description: "Bring a remote phone or PC feed into your OBS.",
	},
	{
		value: "multi_cam",
		title: "Multiple phones as cameras",
		description:
			"Start with one device now; add more from the dashboard later.",
	},
	{
		value: "other",
		title: "Talk with Seppo",
		description:
			"Not sure yet — open the setup assistant and describe what you need.",
	},
];

const PUBLISHER_OPTIONS: {
	value: Publisher;
	title: string;
	description: string;
	recommended?: boolean;
}[] = [
	{
		value: "visp",
		title: "VISP mobile app",
		description:
			"Recommended. Install, sign in, and VISP links the device automatically — no URL paste.",
		recommended: true,
	},
	{
		value: "web",
		title: "Browser publisher",
		description:
			"Publish from Chrome, Edge, or Safari over WebRTC — no install.",
	},
	{
		value: "obs",
		title: "OBS Studio",
		description: "Publish from a PC or laptop with a custom SRT/RTMP server.",
	},
	{
		value: "larix",
		title: "Larix Broadcaster",
		description: "IRL streaming from a phone with a pasted stream URL.",
	},
	{
		value: "moblin",
		title: "Moblin",
		description: "IRL streaming from an iPhone with a pasted stream URL.",
	},
	{
		value: "other",
		title: "Other SRT/RTMP app",
		description: "Any app with a custom server option.",
	},
];

const SIMPLE_PUBLISHER_OPTIONS = PUBLISHER_OPTIONS.filter(
	(option) =>
		option.value === "visp" ||
		option.value === "web" ||
		option.value === "other",
);

const DESTINATION_OPTIONS: {
	value: Destination;
	title: string;
	description: string;
}[] = [
	{
		value: "twitch",
		title: "Twitch",
		description: "You go live on Twitch from OBS.",
	},
	{
		value: "kick",
		title: "Kick",
		description: "You go live on Kick from OBS.",
	},
	{
		value: "other",
		title: "Somewhere else",
		description: "YouTube, a custom RTMP destination, or not decided yet.",
	},
];

const MANUAL_PUBLISH_STEPS: Record<
	Exclude<Publisher, "visp" | "web">,
	{ name: string; primary: "srt" | "rtmp"; steps: string[] }
> = {
	obs: {
		name: "OBS Studio",
		primary: "srt",
		steps: [
			"On the device that films, open OBS and go to Settings → Stream.",
			'Set Service to "Custom..." and paste your link into the Server field.',
			"Leave Stream Key empty and click OK.",
		],
	},
	larix: {
		name: "Larix Broadcaster",
		primary: "srt",
		steps: [
			"Open Larix and go to Settings → Connections → New connection.",
			"Paste your link into the URL field and tap Save.",
			"Streaming on mobile data? Turn on adaptive bitrate so the stream stays smooth when the signal dips.",
		],
	},
	moblin: {
		name: "Moblin",
		primary: "srt",
		steps: [
			"Open Moblin and go to Settings → Streams → Create stream.",
			"Paste your link as the stream URL and save.",
		],
	},
	other: {
		name: "your streaming app",
		primary: "rtmp",
		steps: [
			'In your app\'s stream settings, choose "Custom" or "Custom RTMP" as the service.',
			"Paste your link as the server or URL. The link includes your password, so keep it private.",
			'If your app supports SRT, use the link under "Backup link" instead — it handles shaky networks better.',
		],
	},
};

const SEPPO_SUGGESTIONS = [
	"Use my phone as a camera in OBS",
	"Bring a friend's feed into my stream",
	"Which app should I publish with?",
];

const STEP_LABELS: Record<WizardStep, string> = {
	redo: "redo",
	useCase: "use case",
	publisher: "publisher",
	destination: "destination",
	credentials: "stream links",
	test: "connection test",
};

function optionTitle(
	options: { value: string; title: string }[],
	value: unknown,
) {
	return (
		options.find((option) => option.value === value)?.title ?? String(value)
	);
}

function toolActivityLabel(part: { type: string; input?: unknown }) {
	const input = (part.input ?? {}) as Record<string, unknown>;
	switch (part.type) {
		case "tool-setUseCase":
			return `Use case: ${optionTitle(USE_CASE_OPTIONS, input.useCase)}`;
		case "tool-setPublisher":
			return `Publisher: ${optionTitle(PUBLISHER_OPTIONS, input.publisher)}`;
		case "tool-setDestination":
			return `Destination: ${optionTitle(DESTINATION_OPTIONS, input.destination)}`;
		case "tool-setAdvancedMode":
			return input.advancedMode ? "Advanced mode on" : "Advanced mode off";
		case "tool-goToStep":
			return `Moved to ${STEP_LABELS[input.step as WizardStep] ?? String(input.step)}`;
		case "tool-completeSetup":
			return "Requested stream link creation";
		default:
			return null;
	}
}

function publisherToSoftware(publisher: Publisher): StreamingSoftware {
	if (publisher === "web") return "visp";
	return publisher;
}

function stepIndex(step: WizardStep): number {
	const index = QUESTION_STEPS.indexOf(step);
	return index === -1 ? 0 : index;
}

function OptionCard({
	title,
	description,
	badge,
	onClick,
}: {
	title: string;
	description: string;
	badge?: string;
	onClick: () => void;
}) {
	return (
		<ClickableCard label={title} onClick={onClick}>
			<VStack gap={1}>
				<HStack gap={2} vAlign="center" wrap="wrap">
					<Text type="label">{title}</Text>
					{badge ? (
						<Text color="secondary" type="supporting">
							{badge}
						</Text>
					) : null}
				</HStack>
				<Text color="secondary" type="supporting">
					{description}
				</Text>
			</VStack>
		</ClickableCard>
	);
}

function BackButton({ onBack }: { onBack: () => void }) {
	const t = useT();
	return (
		<Button
			icon={<Icon color="inherit" icon={ArrowLeftIcon} size="sm" />}
			label={t("Back")}
			variant="ghost"
			onClick={onBack}
		/>
	);
}

function StepIntro({
	title,
	description,
	docsHref,
	docsLabel,
}: {
	title: string;
	description: string;
	docsHref?: string;
	docsLabel?: string;
}) {
	return (
		<VStack gap={1}>
			<HStack gap={1.5} vAlign="center">
				<Heading level={2}>{title}</Heading>
				{docsHref && docsLabel ? (
					<DocsHelpLink href={docsHref} label={docsLabel} />
				) : null}
			</HStack>
			<Text color="secondary">{description}</Text>
		</VStack>
	);
}

function NumberedSteps({ steps }: { steps: string[] }) {
	return (
		<List listStyle="decimal">
			{steps.map((step) => (
				<ListItem key={step} label={step} />
			))}
		</List>
	);
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
	return (
		<Button
			icon={<Icon color="inherit" icon={ExternalLinkIcon} size="sm" />}
			label={label}
			variant="secondary"
			onClick={() => {
				if (href.startsWith("/")) {
					window.location.assign(href);
					return;
				}
				window.open(href, "_blank", "noreferrer");
			}}
		/>
	);
}

function RedoStep({ onPick }: { onPick: (mode: RedoMode) => void }) {
	const fi = useLocale() === "fi";
	return (
		<VStack gap={4}>
			<StepIntro
				description={
					fi
						? "Valitse, säilytetäänkö nykyiset laitteet vai perutaanko niiden oikeudet ja aloitetaan alusta."
						: "Choose whether to keep your current devices or revoke them and start clean."
				}
				title={fi ? "Tee käyttöönotto uudelleen" : "Redo setup"}
			/>
			<OptionCard
				description={
					fi
						? "Säilytä yhdistetyt laitteet ja niiden osoitteet. Käyttöönotto päivittää ensisijaisen laitteen tunnukset."
						: "Keep existing linked devices and their URLs. Setup refreshes credentials for your primary device."
				}
				title={fi ? "Säilytä nykyiset laitteet" : "Keep existing devices"}
				onClick={() => onPick("additive")}
			/>
			<OptionCard
				description={
					fi
						? "Peru kaikkien laitepolkujen oikeudet ja vaihda OBS-lukutunnukset. Valittu julkaisija luo tarvittaessa uuden laitteen."
						: "Revoke every device path and rotate OBS read credentials. Your chosen publisher creates a fresh device when needed."
				}
				title={fi ? "Tyhjennä ja aloita alusta" : "Wipe and start over"}
				onClick={() => onPick("wipe")}
			/>
			<Banner
				description={
					fi
						? "Tyhjentäminen katkaisee sovellusten sidokset ja mitätöi vanhat julkaisuosoitteet."
						: "Wipe disconnects native app bindings and invalidates old publish URLs."
				}
				status="warning"
				title={fi ? "Tyhjentämistä ei voi perua" : "Wipe cannot be undone"}
			/>
		</VStack>
	);
}

function UseCaseStep({ onPick }: { onPick: (useCase: SetupUseCase) => void }) {
	const fi = useLocale() === "fi";
	const options = fi
		? [
				{
					value: "phone_to_obs" as const,
					title: "Puhelimen kamera OBS:ään",
					description:
						"Käytä puhelinta kamerana ja mikrofonina OBS-lähetyskoneella.",
				},
				{
					value: "remote_guest" as const,
					title: "Ystävä tai toinen tietokone",
					description: "Tuo etäpuhelimen tai -tietokoneen syöte OBS:ään.",
				},
				{
					value: "multi_cam" as const,
					title: "Useita puhelimia kameroina",
					description:
						"Aloita yhdellä laitteella ja lisää muut myöhemmin hallintapaneelista.",
				},
				{
					value: "other" as const,
					title: "Keskustele Sepon kanssa",
					description:
						"Etkö ole vielä varma? Avaa avustaja ja kuvaile tarpeesi.",
				},
			]
		: USE_CASE_OPTIONS;
	return (
		<VStack gap={4}>
			<StepIntro
				description={
					fi
						? "VISP välittää ensin yhden kameran OBS:ään. Voit lisätä laitteita myöhemmin. Jos jäät jumiin, keskustele Sepon kanssa."
						: "VISP relays one camera into OBS first. You can add more devices later. Stuck? Pick Talk with Seppo or tap the chat ball."
				}
				title={
					fi ? "Mihin haluat käyttää VISPiä?" : "What do you want VISP for?"
				}
			/>
			{options.map((option) => (
				<OptionCard
					key={option.value}
					description={option.description}
					title={option.title}
					onClick={() => onPick(option.value)}
				/>
			))}
		</VStack>
	);
}

function PublisherStep({
	onBack,
	onPick,
}: {
	onBack: () => void;
	onPick: (publisher: Publisher) => void;
}) {
	const fi = useLocale() === "fi";
	const options = fi
		? [
				{
					value: "visp" as const,
					title: "VISP-mobiilisovellus",
					description:
						"Suositus. Asenna ja kirjaudu; VISP yhdistää laitteen automaattisesti ilman osoitteen liittämistä.",
					recommended: true,
				},
				{
					value: "web" as const,
					title: "Selainjulkaisija",
					description:
						"Julkaise Chromella, Edgellä tai Safarilla WebRTC:n kautta ilman asennusta.",
				},
				{
					value: "other" as const,
					title: "Muu SRT/RTMP-sovellus",
					description:
						"Mikä tahansa sovellus, jossa on mukautetun palvelimen asetus.",
				},
			]
		: SIMPLE_PUBLISHER_OPTIONS;
	return (
		<VStack gap={4}>
			<StepIntro
				description={
					fi
						? "Valitse ohjattuun käyttöönottoon VISP-sovellus tai selain. Seuraavaksi tuot syötteen OBS:ään VISP-lisäosalla."
						: "Choose the VISP app or browser for guided setup. Next you'll pull the feed into OBS with the VISP OBS plugin."
				}
				title={fi ? "Miten lähetät videon?" : "How will you send video?"}
			/>
			{options.map((option) => (
				<OptionCard
					key={option.value}
					badge={
						option.recommended ? (fi ? "Suositus" : "Recommended") : undefined
					}
					description={option.description}
					title={option.title}
					onClick={() => onPick(option.value)}
				/>
			))}
			<HStack>
				<BackButton onBack={onBack} />
			</HStack>
		</VStack>
	);
}

function DestinationStep({
	onBack,
	onPick,
}: {
	onBack: () => void;
	onPick: (destination: Destination) => void;
}) {
	const fi = useLocale() === "fi";
	const options = fi
		? [
				{
					value: "twitch" as const,
					title: "Twitch",
					description: "Aloitat Twitch-lähetyksen OBS:stä.",
				},
				{
					value: "kick" as const,
					title: "Kick",
					description: "Aloitat Kick-lähetyksen OBS:stä.",
				},
				{
					value: "other" as const,
					title: "Muu kohde",
					description:
						"YouTube, mukautettu RTMP-kohde tai et ole vielä päättänyt.",
				},
			]
		: DESTINATION_OPTIONS;
	return (
		<VStack gap={4}>
			<StepIntro
				description={
					fi
						? "Valinta vaikuttaa vain ohjeisiin — relay-osoitteesi pysyvät samoina."
						: "This only shapes guidance — your relay links stay the same either way."
				}
				title={fi ? "Missä lähetät suorana?" : "Where do you go live?"}
			/>
			{options.map((option) => (
				<OptionCard
					key={option.value}
					description={option.description}
					title={option.title}
					onClick={() => onPick(option.value)}
				/>
			))}
			<HStack>
				<BackButton onBack={onBack} />
			</HStack>
		</VStack>
	);
}

function TestStreamStep({
	onBack,
	onDone,
}: {
	onBack: () => void;
	onDone: () => void;
}) {
	const t = useT();
	const fi = useLocale() === "fi";
	const trpc = useTRPC();
	const paths = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5_000 }),
	);
	const path = paths.data?.[0];
	const live = Boolean(path?.publishing && !path.stale);
	const unknown = Boolean(path?.stale);

	return (
		<VStack gap={4}>
			<StepIntro
				description={
					fi
						? "Aloita julkaisu puhelimesta, selaimesta tai sovelluksesta. Jos asensit VISP OBS -lisäosan, avaa Tools → VISP ja lisää laite kohtaukseen odottaessasi."
						: "Start publishing from your phone, browser, or app. If you installed the VISP OBS plugin, open Tools → VISP and add the device to your scene while you wait."
				}
				title={t("Test your connection")}
			/>
			<Card variant="muted">
				<HStack gap={3} vAlign="center" wrap="wrap">
					{live ? (
						<>
							<StatusDot isPulsing label={t("Live")} variant="error" />
							<Text type="label">
								{fi
									? "Suora — VISP näkee julkaisusyötteesi"
									: "Live — VISP sees your publish feed"}
							</Text>
						</>
					) : unknown ? (
						<>
							<StatusDot label={t("Status unknown")} variant="warning" />
							<Text type="label">
								{fi
									? "Tila ei ole tiedossa — pidä julkaisija käynnissä"
									: "Status unknown — keep the publisher running"}
							</Text>
						</>
					) : (
						<>
							<StatusDot label={t("Offline")} variant="neutral" />
							<Text type="label">
								{fi
									? "Ei yhteyttä — odotetaan julkaisuyhteyttä"
									: "Offline — waiting for a publish connection"}
							</Text>
						</>
					)}
				</HStack>
				{path?.publishLastConnectedAt ? (
					<Text color="secondary" type="supporting">
						{fi ? "Yhdistetty viimeksi " : "Last connected "}
						{new Date(path.publishLastConnectedAt)
							.toISOString()
							.replace("T", " ")
							.slice(0, 19)}{" "}
						UTC
					</Text>
				) : (
					<Text color="secondary" type="supporting">
						{fi ? "Ei vielä koskaan yhdistetty" : "Never connected yet"}
					</Text>
				)}
			</Card>
			{live ? (
				<Banner
					description={
						fi
							? "Olet valmis hallintapaneeliin. Lisää siellä laitteita, jos tarvitset useita kameroita."
							: "You're ready for the dashboard. Add more devices there if you need multi-cam."
					}
					status="success"
					title={t("Connection looks good")}
				/>
			) : (
				<Banner
					description={
						fi
							? "Voit ohittaa testin ja viimeistellä käyttöönoton — hallintapaneeli näyttää myös suoran tilan."
							: "You can skip and finish setup anyway — the dashboard shows live status too."
					}
					status="info"
					title={t("No live feed yet")}
				/>
			)}
			<HStack gap={2} wrap="wrap">
				<Button
					label={
						live
							? fi
								? "Siirry hallintapaneeliin"
								: "Go to my dashboard"
							: fi
								? "Ohita ja siirry hallintapaneeliin"
								: "Skip and go to dashboard"
					}
					variant="primary"
					onClick={onDone}
				/>
				<BackButton onBack={onBack} />
			</HStack>
		</VStack>
	);
}

type WizardActions = {
	setUseCase: (useCase: SetupUseCase) => void;
	setPublisher: (publisher: Publisher) => void;
	setDestination: (destination: Destination) => void;
	setAdvancedMode: (advancedMode: boolean) => void;
	goToStep: (step: WizardStep) => void;
	requestComplete: () => void;
};

function SetupWizard() {
	const { redo } = Route.useSearch();
	const locale = useLocale();
	const fi = locale === "fi";
	const t = useT();
	const obsRelease = Route.useLoaderData();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const status = useQuery(trpc.secrets.status.queryOptions());
	const [step, setStep] = useState<WizardStep>(redo ? "redo" : "useCase");
	const [redoMode, setRedoMode] = useState<RedoMode | null>(null);
	const [useCase, setUseCase] = useState<SetupUseCase>("phone_to_obs");
	const [publisher, setPublisher] = useState<Publisher>("visp");
	const [destination, setDestination] = useState<Destination>("twitch");
	const [bundle, setBundle] = useState<SecretBundle | null>(null);
	const [pendingCreate, setPendingCreate] = useState(false);
	const [seppoOpen, setSeppoOpen] = useState(false);

	const openAdvancedDashboard = useCallback(async () => {
		await queryClient.invalidateQueries();
		await navigate({ to: "/dashboard", search: localeSearch(locale) });
	}, [locale, navigate, queryClient]);

	const completeAdvanced = useMutation(
		trpc.onboarding.complete.mutationOptions({
			onSuccess: openAdvancedDashboard,
			onError: (error) => toast.error(error.message),
		}),
	);
	const enableAdvanced = useMutation(
		trpc.secrets.setAdvancedMode.mutationOptions({
			onSuccess: openAdvancedDashboard,
			onError: (error) => toast.error(error.message),
		}),
	);
	const openingAdvanced =
		completeAdvanced.isPending || enableAdvanced.isPending;

	const resetSimpleSetup = useCallback(() => {
		setStep(redo ? "redo" : "useCase");
		setRedoMode(null);
		setUseCase("phone_to_obs");
		setPublisher("visp");
		setDestination("twitch");
		setBundle(null);
		setPendingCreate(false);
	}, [redo]);

	const setSetupMode = useCallback(
		(advanced: boolean) => {
			if (!advanced) {
				resetSimpleSetup();
				return;
			}

			if (!status.data || openingAdvanced) return;
			if (
				getAdvancedSetupAction(status.data.onboardedAt) === "enable-existing"
			) {
				enableAdvanced.mutate({ advancedMode: true });
				return;
			}
			completeAdvanced.mutate(ADVANCED_SETUP_DEFAULTS);
		},
		[
			completeAdvanced,
			enableAdvanced,
			openingAdvanced,
			resetSimpleSetup,
			status.data,
		],
	);

	const goToStep = useCallback(
		(next: WizardStep) => {
			if (next === "redo" && !redo) return;
			setStep(next);
		},
		[redo],
	);

	const pickUseCase = useCallback((value: SetupUseCase) => {
		setUseCase(value);
		if (value === "other") {
			setSeppoOpen(true);
			return;
		}
		setStep("publisher");
	}, []);

	const actions: WizardActions = {
		setUseCase: pickUseCase,
		setPublisher: (value) => {
			setPublisher(value);
			setStep("destination");
		},
		setDestination: (value) => {
			setDestination(value);
			setStep("credentials");
		},
		setAdvancedMode: setSetupMode,
		goToStep,
		requestComplete: () => {
			setStep("credentials");
			setPendingCreate(true);
		},
	};
	const handleSeppoTool = (toolCall: SeppoClientToolCall) => {
		switch (toolCall.toolName) {
			case "setUseCase": {
				const { useCase } = toolCall.input as { useCase: SetupUseCase };
				actions.setUseCase(useCase);
				return `Set use case to ${useCase}`;
			}
			case "setPublisher": {
				const { publisher } = toolCall.input as { publisher: Publisher };
				actions.setPublisher(publisher);
				return `Set publisher to ${publisher}`;
			}
			case "setDestination": {
				const { destination } = toolCall.input as {
					destination: Destination;
				};
				actions.setDestination(destination);
				return `Set destination to ${destination}`;
			}
			case "setAdvancedMode": {
				const { advancedMode: enabled } = toolCall.input as {
					advancedMode: boolean;
				};
				actions.setAdvancedMode(enabled);
				return `Advanced mode ${enabled ? "on" : "off"}`;
			}
			case "goToStep": {
				const { step: next } = toolCall.input as { step: WizardStep };
				actions.goToStep(next);
				return `Moved to ${next}`;
			}
			case "completeSetup":
				actions.requestComplete();
				return "Requested link creation — user confirms with Create my stream links";
			default:
				throw new Error(`Unsupported setup action: ${toolCall.toolName}`);
		}
	};

	const questionNumber = step === "redo" ? 0 : stepIndex(step) + 1;
	const questionTotal = QUESTION_STEPS.length;

	return (
		<>
			<Center axis="horizontal">
				<VStack
					className="pb-24"
					gap={6}
					maxWidth={720}
					padding={4}
					width="100%"
				>
					<PageHeader
						actions={
							<VStack gap={1} hAlign="end">
								<SegmentedControl
									isDisabled={openingAdvanced || !status.data}
									label={t("Setup mode")}
									value={openingAdvanced ? "advanced" : "simple"}
									onChange={(value) => setSetupMode(value === "advanced")}
								>
									<SegmentedControlItem label={t("Simple")} value="simple" />
									<SegmentedControlItem
										label={t("Advanced")}
										value="advanced"
									/>
								</SegmentedControl>
								{openingAdvanced ? (
									<Text color="secondary" type="supporting">
										{fi
											? "Avataan edistynyttä hallintapaneelia…"
											: "Opening advanced dashboard…"}
									</Text>
								) : null}
							</VStack>
						}
						eyebrow={
							step === "redo"
								? t("Redo setup")
								: `${fi ? "Vaihe" : "Step"} ${String(questionNumber).padStart(2, "0")} / ${String(
										questionTotal,
									).padStart(2, "0")}`
						}
						subtitle={
							fi
								? "Käytännön kysymykset, aluksi yksi laite ja sitten lähetysosoitteesi. VISP-mobiilisovellus yhdistyy automaattisesti."
								: "Real-world questions, one device to start, then your stream links. The VISP mobile app links automatically."
						}
						title={t("Let's get you streaming")}
					/>

					<VStack gap={4}>
						{step === "redo" ? (
							<RedoStep
								onPick={(mode) => {
									setRedoMode(mode);
									setStep("useCase");
								}}
							/>
						) : null}
						{step === "useCase" ? <UseCaseStep onPick={pickUseCase} /> : null}
						{step === "publisher" ? (
							<PublisherStep
								onBack={() => setStep("useCase")}
								onPick={(value) => {
									setPublisher(value);
									setStep("destination");
								}}
							/>
						) : null}
						{step === "destination" ? (
							<DestinationStep
								onBack={() => setStep("publisher")}
								onPick={(value) => {
									setDestination(value);
									setStep("credentials");
								}}
							/>
						) : null}
						{step === "credentials" ? (
							<CredentialsStepWithCreateRef
								bundle={bundle}
								destination={destination}
								obsRelease={obsRelease}
								pendingCreate={pendingCreate}
								publisher={publisher}
								redoMode={redoMode}
								useCase={useCase}
								onBack={() => setStep("destination")}
								onBundle={setBundle}
								onContinueToTest={() => setStep("test")}
								onPendingCreateHandled={() => setPendingCreate(false)}
							/>
						) : null}
						{step === "test" ? (
							<TestStreamStep
								onBack={() => setStep("credentials")}
								onDone={() =>
									navigate({ to: "/dashboard", search: localeSearch(locale) })
								}
							/>
						) : null}
					</VStack>
				</VStack>
			</Center>
			<SeppoWidget
				context="setup"
				open={seppoOpen}
				placeholder={
					fi ? "Kuvaile lähetyskokoonpanosi…" : "Describe your streaming setup…"
				}
				subtitle={
					fi
						? "Käyttöönottoapu — voi täyttää vastauksia ja siirtää vaiheita"
						: "Setup help — can fill answers and move steps"
				}
				suggestions={
					fi
						? [
								"Käytä puhelintani OBS-kamerana",
								"Tuo ystävän syöte lähetykseeni",
								"Millä sovelluksella minun kannattaa julkaista?",
							]
						: SEPPO_SUGGESTIONS
				}
				welcome={
					fi
						? "Hei, olen Seppo. Kerro, mitä haluat lähettää — puhelimen OBS:ään, etävieraan tai monta kameraa — niin ohjaan käyttöönoton."
						: SEPPO_WELCOME
				}
				onOpenChange={setSeppoOpen}
				onToolCall={handleSeppoTool}
				toolActivityLabel={toolActivityLabel}
			/>
		</>
	);
}

function CredentialsStepWithCreateRef({
	bundle,
	destination,
	obsRelease,
	pendingCreate,
	publisher,
	redoMode,
	useCase,
	onBack,
	onBundle,
	onContinueToTest,
	onPendingCreateHandled,
}: {
	bundle: SecretBundle | null;
	destination: Destination;
	obsRelease: ObsPluginRelease | null;
	pendingCreate: boolean;
	publisher: Publisher;
	redoMode: RedoMode | null;
	useCase: SetupUseCase;
	onBack: () => void;
	onBundle: (bundle: SecretBundle) => void;
	onContinueToTest: () => void;
	onPendingCreateHandled: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const complete = useMutation(
		trpc.onboarding.complete.mutationOptions({
			onSuccess: async (result) => {
				onBundle(result);
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const createLinks = useCallback(() => {
		complete.mutate({
			software: publisherToSoftware(publisher),
			useCase,
			destination,
			advancedMode: false,
			createDevice: publisher !== "visp",
			...(redoMode ? { redoMode } : {}),
		});
	}, [complete, destination, publisher, redoMode, useCase]);

	useEffect(() => {
		if (!pendingCreate || bundle || complete.isPending) return;
		createLinks();
		onPendingCreateHandled();
	}, [
		bundle,
		complete.isPending,
		createLinks,
		onPendingCreateHandled,
		pendingCreate,
	]);

	if (bundle) {
		return (
			<CredentialsReady
				bundle={bundle}
				destination={destination}
				obsRelease={obsRelease}
				publisher={publisher}
				onContinue={onContinueToTest}
			/>
		);
	}

	return (
		<CredentialsPrompt
			isLoading={complete.isPending}
			publisher={publisher}
			redoMode={redoMode}
			useCase={useCase}
			onBack={onBack}
			onCreate={createLinks}
		/>
	);
}

function CredentialsPrompt({
	isLoading,
	publisher,
	redoMode,
	useCase,
	onBack,
	onCreate,
}: {
	isLoading: boolean;
	publisher: Publisher;
	redoMode: RedoMode | null;
	useCase: SetupUseCase;
	onBack: () => void;
	onCreate: () => void;
}) {
	const fi = useLocale() === "fi";
	return (
		<VStack gap={4}>
			<StepIntro
				description={
					publisher === "visp"
						? fi
							? "Mobiilisovellus luo laitteensa automaattisesti. Käyttöönotto valmistelee vain OBS-lukutunnukset."
							: "The mobile app creates its device automatically. Setup only prepares OBS read credentials."
						: "One device link for publishing, plus OBS read credentials for your streaming PC."
				}
				title={
					publisher === "visp"
						? fi
							? "Valmis valmistelemaan OBS:n"
							: "Ready to prepare OBS"
						: fi
							? "Valmis luomaan lähetysosoitteet"
							: "Ready to create your stream links"
				}
			/>
			{useCase === "multi_cam" && publisher !== "visp" ? (
				<Banner
					description={
						fi
							? "Käyttöönotto luo nyt yhden laitteen. Lisää puhelimia hallintapaneelista myöhemmin."
							: "Setup creates one device now. Add more phones from the dashboard when you're ready."
					}
					status="info"
					title={
						fi
							? "Monikamera alkaa yhdestä syötteestä"
							: "Multi-cam starts with one feed"
					}
				/>
			) : null}
			{redoMode === "wipe" ? (
				<Banner
					status="warning"
					title={
						fi
							? "Tyhjennys peruu nykyiset laitteet"
							: "Wipe will revoke existing devices"
					}
					description={
						fi
							? "Sovellusten sidokset ja vanhat julkaisuosoitteet lakkaavat toimimasta."
							: "Native app bindings and old publish URLs stop working."
					}
				/>
			) : null}
			{redoMode === "additive" ? (
				<Banner
					status="info"
					title={
						fi
							? "Nykyiset laitteet säilyvät yhdistettyinä"
							: "Existing devices stay linked"
					}
					description={
						publisher === "visp"
							? "The mobile app links its own device; existing paths keep their URLs."
							: "Primary-device credentials are refreshed; other paths keep their URLs."
					}
				/>
			) : null}
			<HStack gap={2} wrap="wrap">
				<Button
					isLoading={isLoading}
					label={
						publisher === "visp"
							? fi
								? "Valmistele OBS-tunnukset"
								: "Prepare OBS credentials"
							: fi
								? "Luo lähetysosoitteeni"
								: "Create my stream links"
					}
					variant="primary"
					onClick={onCreate}
				/>
				<BackButton onBack={onBack} />
			</HStack>
		</VStack>
	);
}

function CredentialsReady({
	bundle,
	destination,
	obsRelease,
	publisher,
	onContinue,
}: {
	bundle: SecretBundle;
	destination: Destination;
	obsRelease: ObsPluginRelease | null;
	publisher: Publisher;
	onContinue: () => void;
}) {
	const fi = useLocale() === "fi";
	const t = useT();
	const publishUrl = bundle.urls.publish[0];
	const readUrl = bundle.urls.read[0];
	const manual =
		publisher !== "visp" && publisher !== "web"
			? MANUAL_PUBLISH_STEPS[publisher]
			: null;
	const primary =
		manual?.primary === "rtmp"
			? (publishUrl?.rtmp ?? "")
			: (publishUrl?.srt ?? "");
	const destinationLabel =
		destination === "twitch"
			? "Twitch"
			: destination === "kick"
				? "Kick"
				: fi
					? "palveluusi"
					: "your platform";

	return (
		<VStack gap={6}>
			<Banner
				description={
					fi
						? "Tunnukset pysyvät piilossa hallintapaneelissa, kunnes valitset Näytä. Jokaisen laitteen tunnuksen voi vaihtaa erikseen."
						: "They stay hidden on the dashboard until you choose Reveal. Each device can be rotated independently later."
				}
				status="success"
				title={
					publisher === "visp"
						? fi
							? "OBS-tunnuksesi ovat valmiit"
							: "Your OBS credentials are ready"
						: fi
							? "Laitteesi osoite on valmis"
							: "Your device link is ready"
				}
			/>

			{publisher === "visp" ? (
				<VStack gap={3}>
					<StepIntro
						description={
							fi
								? "VISP-sovellus luo julkaisuosoitteen automaattisesti kirjautumisen jälkeen — osoitetta ei tarvitse liittää."
								: "The VISP app creates the publish link automatically after you sign in — no paste required."
						}
						docsHref={docs.phoneApp}
						docsLabel={
							fi
								? "Katso puhelin- ja selainsovelluksen ohje"
								: "See phone and browser app docs"
						}
						title={t("On your phone")}
					/>
					<NumberedSteps
						steps={
							fi
								? [
										"Asenna VISP-beta iOS:lle TestFlightista tai Androidille Play-testauksesta.",
										"Avaa sovellus ja kirjaudu samalla Twitch- tai Kick-tilillä.",
										"Salli kamera ja mikrofoni — VISP ottaa laitteen käyttöön ja aloittaa SRT-julkaisun.",
									]
								: [
										"Install the VISP beta for iOS (TestFlight) or Android (Play open testing).",
										"Open the app and sign in with the same Twitch or Kick account.",
										"Allow camera and mic — VISP claims this device and starts publishing over SRT.",
									]
						}
					/>
					<HStack gap={2} wrap="wrap">
						<ExternalLinkButton
							href={legalEntity.iosTestFlightUrl}
							label={fi ? "Liity TestFlightissa" : "Join on TestFlight"}
						/>
						<ExternalLinkButton
							href={legalEntity.androidPlayTestingUrl}
							label={fi ? "Liity Google Playssa" : "Join on Google Play"}
						/>
						<ExternalLinkButton
							href={fi ? "/download?lang=fi" : "/download"}
							label={fi ? "Kaikki lataukset" : "All downloads"}
						/>
					</HStack>
				</VStack>
			) : null}

			{publisher === "web" ? (
				<VStack gap={3}>
					<StepIntro
						description={
							fi
								? "Avaa selainjulkaisija, kirjaudu ja käynnistä kamera ilman sovelluksen asennusta."
								: "Open the browser publisher, sign in, and start the camera — no native install."
						}
						docsHref={docs.phoneApp}
						docsLabel={
							fi
								? "Katso puhelin- ja selainsovelluksen ohje"
								: "See phone and browser app docs"
						}
						title={t("In your browser")}
					/>
					<NumberedSteps
						steps={
							fi
								? [
										"Avaa VISP-selainjulkaisija.",
										"Kirjaudu samalla Twitch- tai Kick-tilillä.",
										"Salli kamera ja mikrofoni ja aloita julkaisu.",
									]
								: [
										"Open the VISP browser publisher.",
										"Sign in with the same Twitch or Kick account.",
										"Allow camera and mic, then start publishing.",
									]
						}
					/>
					<HStack gap={2} wrap="wrap">
						<ExternalLinkButton
							href={legalEntity.browserAppUrl}
							label={fi ? "Avaa selainjulkaisija" : "Open browser publisher"}
						/>
					</HStack>
				</VStack>
			) : null}

			{manual && publishUrl ? (
				<VStack gap={3}>
					<StepIntro
						description={
							publisher === "obs"
								? "You can paste a publish URL into OBS Settings → Stream, or let the VISP OBS plugin create an OBS publishing device after you sign in."
								: `Paste this link into ${manual.name}. Publishing can be streaming software, a phone app, or any SRT-capable device.`
						}
						docsHref={docs.videoSource}
						docsLabel="See how to add this to your video source"
						title={t("On your publishing device")}
					/>
					<NumberedSteps steps={manual.steps} />
					<RevealedValue
						docsHref={docs.videoSource}
						docsLabel="See how to add this to your video source"
						label={t("Publish link")}
						value={primary}
					/>
				</VStack>
			) : null}

			<VStack gap={3}>
				<StepIntro
					description={
						fi
							? `Asenna VISP OBS -lisäosa, tuo syötteet OBS:ään ja aloita lähetys ${destinationLabel} ilman medialähdeosoitteiden käsin liittämistä.`
							: `Install the VISP OBS plugin to pull feeds into OBS and go live to ${destinationLabel} without hand-pasting Media Source URLs.`
					}
					docsHref={docs.obsRemoteControl}
					docsLabel={
						fi
							? "Katso OBS-lisäosan yhdistämisohje"
							: "See how to pair the OBS plugin"
					}
					title={t("On your streaming PC (OBS)")}
				/>
				<ObsPluginPromo
					destinationLabel={destinationLabel}
					release={obsRelease}
				/>
				<Collapsible
					defaultIsOpen={false}
					trigger={
						<Text color="secondary" type="supporting">
							{fi
								? "Etkö halua asentaa lisäosaa? OBS:n manuaalinen käyttöönotto"
								: "Prefer not to install the plugin? Manual OBS setup"}
						</Text>
					}
				>
					<Grid columns={{ minWidth: 280, repeat: "fit" }} gap={3}>
						<Card>
							<VStack gap={3}>
								<Heading level={3}>{t("By hand")}</Heading>
								<NumberedSteps
									steps={
										fi
											? [
													"Lisää OBS:ssä Media Source -lähde.",
													"Poista Local File -valinta käytöstä.",
													"Liitä alla oleva osoite Input-kenttään.",
												]
											: [
													"In OBS, add a Media Source.",
													"Turn off the “Local File” checkbox.",
													'Paste the URL below into the "Input" field.',
												]
									}
								/>
								{readUrl ? (
									<RevealedValue
										docsHref={docs.getStarted}
										docsLabel="See how to import this into OBS"
										label={t("Media source URL")}
										value={readUrl.srt}
									/>
								) : null}
							</VStack>
						</Card>

						{bundle.sceneCollection ? (
							<Card>
								<VStack gap={3}>
									<Heading level={3}>{t("Download the scene file")}</Heading>
									<NumberedSteps
										steps={
											fi
												? [
														"Lataa alla oleva tiedosto.",
														"Avaa OBS:ssä Scene Collection → Import ja valitse ladattu tiedosto.",
														"Laitteesi näkyy valmiina kohtauksena.",
													]
												: [
														"Download the file below.",
														"In OBS, open Scene Collection → Import and pick the downloaded file.",
														"Your device shows up as a ready-made scene.",
													]
										}
									/>
									<HStack>
										<Button
											icon={
												<Icon color="inherit" icon={DownloadIcon} size="sm" />
											}
											label={t("Download OBS scene file")}
											onClick={() =>
												downloadSceneCollection(bundle.sceneCollection)
											}
										/>
									</HStack>
								</VStack>
							</Card>
						) : null}
					</Grid>
				</Collapsible>
			</VStack>

			<HStack gap={2} wrap="wrap">
				<Button
					label={t("Check for a live connection")}
					variant="primary"
					onClick={onContinue}
				/>
			</HStack>
		</VStack>
	);
}
