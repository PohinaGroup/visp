// Lander copy: shared chrome plus one object per page, per locale. `fi` is typed
// as `typeof en`, so a key added to the English page fails the type check until
// Finnish has it too.
//
// Every feature is introduced by a situation (heading), then what VISP does
// (body), then the feature name (small print). Never-drop, BRB, highlight, and
// overlay claims say "no computer needed"; overlay promises say "(beta)".
// landing-copy.test.ts enforces both.
import { legalEntity } from "@/lib/legal";

export type LandingLink = {
	label: string;
	href: string;
	external: boolean;
	search?: { lang: "fi" };
};

export type Step = { title: string; body: string };
export type Situation = { heading: string; body: string; feature: string };
/** The signal strip: three road-trip beats, each with what VISP does + the feature name. */
export type StripCopy = {
	label: string;
	signalTrack: string;
	viewerTrack: string;
	beats: [string, string, string];
	details: [string, string, string];
	live: string;
	brb: string;
};
export type Tile = { title: string; body: string; badge?: string };
export type Faq = { title: string; items: { q: string; a: string }[] };
export type Story = {
	name: string;
	channelUrl: string;
	streams: string;
	quote: string;
	photo?: string;
};
export type VersusTable = {
	title: string;
	caption: string;
	columns: [string, string];
	rows: { label: string; phone: string; obs: string }[];
};
export type CostCopy = {
	heading: string;
	body: string;
	chartTitle: string;
	chartSubtitle: string;
	chartNote: string;
	affiliateNote: string;
	affiliateLink: string;
	affiliateFootnote: string;
	rows: { product: string; cost: string; width: string }[];
	tableCaption: string;
	checked: string;
};

const enStrip = {
	label: "What happens when your signal drops",
	signalTrack: "Your signal",
	viewerTrack: "What viewers see",
	beats: [
		"Signal weakens on the highway",
		"Dead zone: viewers watch your clips",
		"Back in range: live again",
	],
	details: [
		"The app streams over Wi-Fi and mobile data at the same time, so one network can fade without taking you down (Network bonding).",
		"Viewers see your BRB screen instead of \"stream ended\", or your highlight clips with Plus. The chat bot tells chat you'll be right back. VISP's server does all of it, with no computer at home (Never drop again).",
		"When the phone reconnects, VISP cuts back to live on its own. There's no computer at home to babysit (Never drop again).",
	],
	live: "LIVE",
	brb: "BRB",
} satisfies StripCopy;

const enCostRows = [
	{ product: "VISP phone only", cost: "Free", width: "4%" },
	{ product: "VISP + your OBS", cost: "Free", width: "4%" },
	{ product: "IRLToolkit", cost: "$1,548–$2,148", width: "99.4%" },
	{ product: "Streamable.run", cost: "$1,440–$2,160", width: "100%" },
];

const enCostShared = {
	chartTitle: "12-month software cost",
	chartNote: "Excludes hardware, electricity, and internet service.",
	affiliateNote:
		"Creators with an audience can apply to the Affiliate program and get every feature free.*",
	affiliateLink: "Apply",
	affiliateFootnote: "* Plus quotas apply.",
	rows: enCostRows,
	tableCaption:
		"VISP compared with IRLToolkit, Streamable.run, IRLServer, and BELABOX",
	checked: "Public list prices, checked",
};

const en = {
	shared: {
		tryCta: "Start free",
		downloadLink: "Download the app",
		video: { pause: "Pause", play: "Play" },
		nav: {
			phoneOnly: "Phone only",
			withObs: "With OBS",
			download: "Download",
			docs: "Docs",
			blog: "Blog",
			label: "Main",
			dashboard: "Dashboard",
			cloudStudio: "Cloud Studio (beta)",
			menu: "Menu",
			close: "Close",
			theme: {
				label: "Theme",
				light: "Light",
				dark: "Dark",
				system: "System",
			},
		},
		footer: [
			{ label: "Affiliate program", href: "/affiliate", external: false },
			{ label: "Blog", href: "/blog", external: false },
			{ label: "Docs", href: legalEntity.docsUrl, external: true },
			{ label: "Download", href: "/download", external: false },
			{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
			{ label: "X", href: legalEntity.xUrl, external: true },
			{ label: "Discord", href: legalEntity.discordUrl, external: true },
			{ label: "Privacy", href: "/privacy", external: false },
			{ label: "Contact", href: "/contact", external: false },
			{ label: "Terms", href: "/terms", external: false },
			{ label: "Cookies", href: "/cookies", external: false },
		] as LandingLink[],
		seppo: {
			placeholder: "Ask about VISP…",
			subtitle: "Product guide: ask what VISP can do",
			suggestions: [
				"Can I stream without OBS?",
				"What happens when my signal drops?",
				"Phone only or my own OBS?",
			],
			welcome:
				"Hi, I'm Seppo. Ask me how VISP keeps you live through dead zones with no computer, or how to bring your phone into your own OBS.",
		},
	},

	home: {
		meta: {
			title: "VISP: stream from your phone to Twitch, Kick, and YouTube",
			description:
				"Go live from your phone and stay live when the signal drops. VISP keeps your channel on air through dead zones, no computer needed. Free, with or without OBS.",
		},
		hero: {
			title: "The better streaming software",
			body: "VISP streams your phone to Twitch, Kick, and YouTube and keeps you on air through dead zones, with no computer at home. If you already run OBS, use phone as a video source with VISP.",
			videoLabel: "A VISP stream goes live from the phone and arrives in OBS",
		},
		strip: enStrip,
		stripNote:
			"All of this runs on VISP. No computer at home, no cloud OBS to rent.",
		noObs: {
			title: "You don't need OBS for this.",
			mark: "Phone only",
			items: [
				{
					situation:
						"Signal gone in a dead zone? Viewers see your BRB card, and VISP cuts back to live when you return, with no computer at home.",
					feature: "Never drop again",
				},
				{
					situation:
						"Away longer than planned? With Plus, your uploaded clips play instead of a still card. Still no computer.",
					feature: "BRB highlights (Plus)",
				},
				{
					situation:
						"Want alerts and a goal bar on screen? Build overlays (beta) in your browser around the alert widget you already use, with no computer at home.",
					feature: "Cloud Studio (beta)",
				},
				{
					situation:
						"Festival crowd jamming the network? The app streams over Wi-Fi and mobile data at the same time.",
					feature: "Network bonding",
				},
				{
					situation:
						"Tunnel ahead? The chat bot tells chat you'll be right back, and says when you are.",
					feature: "Chat bot alerts",
				},
				{
					situation:
						"Stream to Twitch and Kick at once. Your phone uploads one feed and VISP copies it to each platform.",
					feature: "Multistream",
				},
				{
					situation:
						"Phone lost at a festival? Your stream key was never on it. Remove the device from your dashboard.",
					feature: "Keys stay server-side",
				},
			],
			link: "See everything phone only does",
		},
		more: [
			"New city, new category? Change the title and category from the app.",
			"Battery at 3%? Start streaming on a second phone and it takes over.",
			"One platform having a bad night? Its output retries on its own while the others stay live.",
		],
		chooser: {
			title: "Where do you want to make your show?",
			phone: {
				title: "On VISP, from my phone",
				body: "Everything above, no computer.",
				badge: "Most creators",
			} satisfies Tile,
			obs: {
				title: "In my own OBS",
				body: "Already built your scenes and alerts in OBS? Add the phone as a camera.",
			} satisfies Tile,
		},
		storiesTitle: "Creators on VISP",
		faq: {
			title: "Common questions",
			items: [
				{
					q: "What is VISP?",
					a: "An app that streams your phone to Twitch, Kick, and YouTube. With phone only, VISP's server does the job a home computer running OBS used to do, so there's no computer to leave on. It keeps you on air when the signal drops and copies one upload to every platform. If you already run OBS, VISP brings the phone into it as a camera instead.",
				},
				{
					q: "Do I need OBS or a computer?",
					a: "No. Phone only covers what most people run OBS for: a BRB screen when the signal drops, highlight clips with Plus, and overlays and alerts (beta), with no computer. Pick your own OBS if you've already built a studio there.",
				},
				{
					q: "What happens when my signal drops?",
					a: "With Never drop again turned on, viewers see your BRB card or highlight clips (Plus) instead of \"stream ended\". The chat bot tells chat you'll be right back, and VISP switches back to live by itself when the phone reconnects. VISP's server handles all of it, with no computer at home.",
				},
				{
					q: "Can I use Wi-Fi and cellular at the same time?",
					a: "Yes. Network bonding in the VISP app can combine Wi-Fi and mobile data into one stream, or send every packet over both so either network can drop without freezing you. You can also keep one network as a backup.",
				},
				{
					q: "Do I have to paste a stream key into my phone?",
					a: "No. VISP fetches your stream key on its server only while your output runs, and the key never reaches the phone. If a phone goes missing, remove it from your dashboard and it can't stream as you again.",
				},
				{
					q: "How much does VISP cost?",
					a: "VISP is free, with or without OBS. Plus costs €9 a month. It adds hosted voice, captions, and audio isolation, and lets your BRB card play highlight clips, still with no computer. Creators with an audience can apply to the Affiliate program and get every feature free. Plus quotas still apply.",
				},
				{
					q: "Does VISP work on iPhone and Android?",
					a: "Yes. The VISP app runs on iPhone and Android, and you can also stream from a browser. Network bonding needs the app.",
				},
			],
		} satisfies Faq,
		closing: {
			title: "Your next stream starts on your phone.",
			body: "VISP is free. Sign in with Twitch, Kick, or Google and go live from the app.",
		},
	},

	phoneOnly: {
		meta: {
			title: "IRL stream from your phone without OBS | VISP",
			description:
				"Stream from your phone to Twitch, Kick, and YouTube with no computer and no OBS. Mobile data drops? Viewers see your BRB screen. Overlays (beta) run on VISP.",
		},
		hero: {
			title: "Everything you need for your stream. With just the phone.",
			body: "Stay on air through dead zones, play your clips while you're away with Plus, and add overlays and alerts (beta), all from one phone. No computer needed.",
			imageAlt: "The VISP app live on a phone",
		},
		why: {
			title: "Why you no longer need a computer at home",
			body: "To stay live through dead zones and show a BRB screen or overlays, IRL streamers used to need a computer at home running OBS, or a cloud OBS at $120–180 a month. Direct moves that job, overlays (beta) included, onto VISP's server, so no computer is needed. Your phone sends one feed, and VISP builds the show and keeps it on air.",
		},
		strip: enStrip,
		situationsTitle: "When the signal drops, the stream doesn't",
		situations: [
			{
				heading: "Road trip subathon.",
				body: "In a moving car the signal drops every few minutes. Each drop ends the broadcast, splits the subathon into ten VODs, and sends viewers away. The stream never goes offline. While the phone fights for signal, viewers watch your uploaded clips (Plus), and VISP cuts back to live the moment you reconnect. No computer needed.",
				feature: "Never drop again + BRB highlights (Plus)",
			},
			{
				heading: "Festival crowd.",
				body: "Thirty thousand phones on one cell tower, and your upload crawls. The app streams over Wi-Fi and mobile data at the same time, or sends every packet over both, so one jammed network doesn't freeze you.",
				feature: "Network bonding",
			},
			{
				heading: "Into the tunnel.",
				body: 'You vanish and chat starts asking if the stream died. The chat bot posts "signal lost, back soon" when you drop and "we\'re back" when you return, so mods and viewers know to stay.',
				feature: "Chat bot alerts",
			},
		] satisfies Situation[],
		studio: {
			heading: "Sub goal on a hike.",
			body: "You want alerts and a goal bar on screen, but there's no PC at home to run them. Build scenes in the browser with your alert widget and overlays; VISP adds them to the stream on its server. No computer needed. Cloud Studio (beta) gives you up to 3 scenes with 8 layers each. Layers can show up to two public web pages, such as alert widgets, and one can be the VISP alert layer.",
			feature: "Cloud Studio (beta)",
			beta: "Beta",
		} satisfies Situation & { beta: string },
		more: {
			title: "What else you get",
			items: [
				{
					heading: "Twitch and Kick at once.",
					body: "Two streams from one phone usually means twice the upload and a hot, dying battery. Your phone sends one feed; VISP sends it to every platform, and if one platform has a problem the others keep going.",
					feature: "Multistream",
				},
				{
					heading: "Lost phone at a festival.",
					body: "Or you lend it to a friend for the day. Your stream key is never on the phone. Remove the device from your dashboard and it can't stream as you again.",
					feature: "Keys stay server-side, revocable devices",
				},
				{
					heading: "New city, new category.",
					body: "You've gone from Just Chatting to Travel & Outdoors and you're nowhere near a PC. Change the title and category from the app.",
					feature: "Stream info from the phone",
				},
				{
					heading: "Battery at 3%.",
					body: "The show must go on. Start streaming on a second phone; it takes over the stream.",
					feature: "Device handoff",
				},
			] satisfies Situation[],
		},
		obsNote: {
			text: "Already have a studio PC with scenes you love?",
			link: "Bring your phone into your own OBS",
		},
		versus: {
			title: "Phone only vs your own OBS",
			caption: "Phone only compared with your own OBS",
			columns: ["Phone only", "Your own OBS"],
			rows: [
				{
					label: "Stay on air when the signal drops",
					phone:
						"Yes. Viewers see your BRB card, and VISP switches back to live by itself. No computer needed.",
					obs: "Up to your OBS setup, on a computer that stays on at home.",
				},
				{
					label: "Highlight clips while you're away (Plus)",
					phone:
						"Yes, with Plus. Your uploaded clips play instead of a still card. No computer needed.",
					obs: "If you build it in your OBS.",
				},
				{
					label: "Overlays, scenes, and alerts",
					phone:
						"Cloud Studio (beta): up to 3 scenes, 8 layers each, alert widgets as browser sources. No computer needed.",
					obs: "As many scenes, sources, and plugins as your computer can run.",
				},
				{
					label: "Wi-Fi and mobile data together",
					phone: "Yes, with Network bonding in the app.",
					obs: "Yes, with Network bonding in the app.",
				},
				{
					label: "Several platforms at once",
					phone:
						"One upload to Twitch, Kick, and YouTube. Each platform's output retries on its own.",
					obs: "Depends on your OBS setup.",
				},
				{
					label: "Stream key on the phone",
					phone: "Never. It stays on VISP's server.",
					obs: "Never. It stays in your OBS.",
				},
				{
					label: "Computer at home",
					phone: "Not needed.",
					obs: "Needed, with OBS running.",
				},
				{
					label: "Your own mics, cameras, and capture cards",
					phone: "What your phone captures.",
					obs: "Anything you can plug into your computer. OBS is stronger here.",
				},
				{
					label: "Multi-camera scenes",
					phone: "One phone camera, with up to 3 scenes (beta).",
					obs: "Many cameras and complex scenes. OBS is stronger here.",
				},
				{
					label: "Local recording",
					phone: "Your platform's VODs.",
					obs: "Full-quality recording on your computer. OBS is stronger here.",
				},
			],
		} satisfies VersusTable,
		cost: {
			heading: "Keep $1,440–$2,160 a year",
			body: "Cloud OBS services charge $120–180 a month to keep you on air and run your overlays. Phone only does that on VISP's server: Never drop again, a BRB screen, and overlays (beta), with no computer and no cloud OBS to rent. VISP is free. Plus adds hosted extras such as highlight clips for €9 a month.",
			chartSubtitle: "VISP next to the cloud OBS services it replaces.",
			...enCostShared,
		} satisfies CostCopy,
		steps: {
			title: "How it works",
			items: [
				{ title: "Sign in", body: "Sign in with Twitch, Kick, or Google." },
				{
					title: "Pick where to stream",
					body: "Choose Twitch, Kick, YouTube, or several at once.",
				},
				{
					title: "Tap Go live",
					body: "Open the VISP app and tap Go live. No OBS and no stream key on the phone.",
				},
			] satisfies Step[],
		},
		faq: {
			title: "Phone only questions",
			items: [
				{
					q: "Do I need OBS for a BRB screen or overlays?",
					a: "No. VISP shows your BRB card while you're offline and adds overlays and alerts (beta) on its own server. No computer needed.",
				},
				{
					q: "What do viewers see when my signal drops?",
					a: "Turn on Never drop again in the dashboard's BRB tab, and viewers see your BRB card: solid black, your own image, or your uploaded highlight clips with Plus. The chat bot can tell chat you'll be right back. When the phone reconnects, VISP switches back to live by itself. No computer needed.",
				},
				{
					q: "Can I stream to Twitch and Kick at the same time?",
					a: "Yes. Your phone uploads one feed, and VISP sends it to Twitch, Kick, YouTube, or your own RTMP, RTMPS, or SRT server. If one platform has a problem, that output retries on its own and the others keep going.",
				},
				{
					q: "What does the chat bot post?",
					a: "It's up to your chat bot settings. It can post when you go live, when the signal drops, when you're back, and when the stream ends, in your own words. Messages appear as your own account, and it answers commands like !bitrate and !uptime.",
				},
				{
					q: "What if my battery dies mid-stream?",
					a: "Start streaming on a second phone. The newest device that goes live takes over the stream.",
				},
				{
					q: "What if my phone is lost or stolen?",
					a: "Your stream key was never on it. Remove the device from your dashboard and it can't stream as you again.",
				},
				{
					q: "Can I change my title and category from my phone?",
					a: "Yes. Change them in the VISP app, wherever you are.",
				},
			],
		} satisfies Faq,
		closing: {
			title: "Your next stream needs one phone.",
			body: "VISP is free. Sign in with Twitch, Kick, or Google, open the app, and go live.",
		},
	},

	withObs: {
		meta: {
			title: "Use your phone as a camera in OBS, from anywhere | VISP",
			description:
				"Bring your phone into the OBS you already run, over the internet from anywhere. Switch scenes from the phone with no open ports. A free cloud OBS alternative.",
		},
		noPcNote: {
			text: "No studio PC? Phone only keeps you on air with highlights (Plus) and overlays (beta), no computer needed.",
			link: "See phone only",
		},
		hero: {
			title: "Your phone, live in your OBS, from anywhere.",
			body: "VISP brings your phone's camera into the OBS you already run at home, with your scenes, alerts, and sponsor graphics. Switch scenes and start or stop OBS from the phone.",
			videoLabel: "A VISP stream goes live and arrives in OBS",
		},
		plugin: {
			title: "The VISP OBS plugin",
			body: "Your phone becomes a camera in your own OBS. The plugin connects out to VISP, so you control OBS from the phone without opening any ports on your home network.",
			steps: [
				"Install the VISP OBS plugin.",
				"In OBS, open Tools, then VISP, and sign in in the browser.",
				"Add your phone to the current scene in one click.",
				"Start or stop OBS and switch scenes from the phone.",
			],
			download: "Download the OBS plugin",
			docs: "Read the setup guide",
		},
		situationsTitle: "Your studio, wherever you are",
		situations: [
			{
				heading: "Your studio is at home, you're not.",
				body: "Your scenes, alerts, and sponsor graphics live on the home PC. The phone becomes a camera in that OBS from anywhere, and the plugin adds it to the current scene in one click.",
				feature: "VISP OBS plugin",
			},
			{
				heading: "Mid-walk scene change.",
				body: 'You need to switch to the "be right back" scene without anyone at the PC. Switch scenes and start or stop OBS from the phone. No ports opened on your home network.',
				feature: "Remote OBS control",
			},
			{
				heading: "A guest in another city.",
				body: "You want them on screen without handing over your stream key. Add a guest device and send them its link. They stream from their browser into your OBS, and you remove the device when the show is over.",
				feature: "Remote guest",
			},
			{
				heading: "Festival crowd, studio at home.",
				body: "Thirty thousand phones on one cell tower, and your upload crawls. The app streams over Wi-Fi and mobile data at the same time, or sends every packet over both, so the feed into your OBS keeps moving.",
				feature: "Network bonding",
			},
		] satisfies Situation[],
		studio: {
			title: "Keep your studio",
			items: [
				"Your OBS scenes, overlays, and sponsor graphics stay as they are.",
				"Your alerts and OBS plugins keep working.",
				"Record locally at full quality.",
				"Bring in remote guests from a browser.",
			],
		},
		cost: {
			heading: "Keep $1,440–$2,160 a year",
			body: "Cloud OBS plans cost $120–180 a month. If you already have a computer that runs OBS, VISP brings your phone to it for free, and your own OBS does the job you were renting. Rather not keep a PC running? Phone only keeps you on air with a BRB screen and overlays (beta). No computer needed.",
			chartSubtitle:
				"VISP next to cloud OBS. The OBS row assumes you already own a computer that can run it.",
			...enCostShared,
		} satisfies CostCopy,
		steps: {
			title: "How it works",
			items: [
				{
					title: "Install the plugin and sign in",
					body: "Install the VISP OBS plugin, open Tools, then VISP, and sign in in the browser.",
				},
				{
					title: "Add the phone as a source",
					body: "Add your phone to the current scene in one click.",
				},
				{
					title: "Go live from the phone",
					body: "Open the VISP app and go live. Your phone appears in OBS.",
				},
			] satisfies Step[],
		},
		faq: {
			title: "Questions about VISP and OBS",
			items: [
				{
					q: "Can VISP replace my cloud OBS subscription?",
					a: "Yes, if you have a computer that can run OBS. VISP brings your phone into your own OBS, where your scenes, alerts, and plugins keep working. No computer? Phone only gives you a BRB screen and overlays (beta) on VISP's server.",
				},
				{
					q: "How does VISP compare with IRLToolkit and other cloud OBS services?",
					a: "Cloud OBS services run OBS for you for $120–180 a month. VISP brings your phone to your own OBS for free. The comparison on this page shows where each one fits better.",
				},
				{
					q: "Do I need to open ports on my router?",
					a: "No. The plugin connects out to VISP, and the phone controls OBS over that connection. Nothing on your home network is opened to the internet.",
				},
				{
					q: "Can I switch OBS scenes from my phone?",
					a: "Yes. Switch scenes and start or stop OBS from the VISP app.",
				},
				{
					q: "Can a guest join from another city?",
					a: "Yes. Add a guest device and send them its link. They open it in a browser and stream into your OBS. Remove the device when the show is over.",
				},
				{
					q: "Where does my stream key live?",
					a: "In your OBS, as it does today. The phone only sends its feed to VISP and never needs a stream key.",
				},
			],
		} satisfies Faq,
		closing: {
			title: "Bring your phone into your studio.",
			body: "VISP is free. Install the plugin, sign in, and your phone is a camera in your OBS.",
		},
	},

	stories: [] as Story[],
};

const fiStrip: StripCopy = {
	label: "Mitä tapahtuu, kun yhteys katkeaa",
	signalTrack: "Sinun signaalisi",
	viewerTrack: "Mitä katsojat näkevät",
	beats: [
		"Kenttä heikkenee moottoritiellä",
		"Katvealue: katsojat näkevät klippisi",
		"Kenttä palaa: taas livenä",
	],
	details: [
		"Sovellus lähettää Wi-Fin ja mobiilidatan kautta yhtä aikaa, joten toinen verkko voi heiketä ilman, että lähetys katkeaa (Network bonding).",
		"Katsojat näkevät BRB-kortin eivätkä ilmoitusta lähetyksen päättymisestä, Plussalla myös klippisi. Chat-botti kertoo chatille, että palaat pian. VISPin palvelin hoitaa kaiken ilman tietokonetta (Never drop).",
		"Kun puhelin saa yhteyden, VISP palaa liveen itsestään ilman tietokonetta (Never drop).",
	],
	live: "LIVE",
	brb: "BRB",
};

const fiCostShared = {
	chartTitle: "12 kuukauden ohjelmistokulut",
	chartNote: "Ei sisällä laitteistoa, sähköä tai internetyhteyttä.",
	affiliateNote:
		"Yleisöä keränneet tekijät voivat hakea Affiliate-ohjelmaan ja saada kaikki ominaisuudet ilmaiseksi.*",
	affiliateLink: "Hae",
	affiliateFootnote: "* Plus-kiintiöt pätevät.",
	rows: [
		{ product: "VISP, pelkkä puhelin", cost: "Ilmainen", width: "4%" },
		{ product: "VISP + oma OBS", cost: "Ilmainen", width: "4%" },
		{
			product: "IRLToolkit",
			cost: "1\u00a0548–2\u00a0148\u00a0$",
			width: "99.4%",
		},
		{
			product: "Streamable.run",
			cost: "1\u00a0440–2\u00a0160\u00a0$",
			width: "100%",
		},
	],
	tableCaption:
		"VISPin, IRLToolkitin, Streamable.runin, IRLServerin ja BELABOXin vertailu",
	checked: "Julkiset listahinnat, tarkistettu",
};

const fi: typeof en = {
	shared: {
		tryCta: "Aloita ilmaiseksi",
		downloadLink: "Lataa sovellus",
		video: { pause: "Pysäytä", play: "Toista" },
		nav: {
			phoneOnly: "Pelkkä puhelin",
			withObs: "OBS:n kanssa",
			download: "Lataa",
			docs: "Ohjeet",
			blog: "Blogi",
			label: "Päävalikko",
			dashboard: "Hallintapaneeli",
			cloudStudio: "Cloud Studio (beta)",
			menu: "Valikko",
			close: "Sulje",
			theme: {
				label: "Teema",
				light: "Vaalea",
				dark: "Tumma",
				system: "Järjestelmä",
			},
		},
		footer: [
			{ label: "Affiliate-ohjelma", href: "/fi/affiliate", external: false },
			{ label: "Blogi", href: "/fi/blog", external: false },
			{
				label: "Lataa",
				href: "/download",
				external: false,
				search: { lang: "fi" },
			},
			{ label: "Ohjeet", href: `${legalEntity.docsUrl}/fi`, external: true },
			{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
			{ label: "Yhteystiedot", href: "/fi/contact", external: false },
			{ label: "X", href: legalEntity.xUrl, external: true },
			{ label: "Discord", href: legalEntity.discordUrl, external: true },
			{ label: "Tietosuoja", href: "/fi/privacy", external: false },
			{ label: "Käyttöehdot", href: "/fi/terms", external: false },
			{ label: "Evästeet", href: "/fi/cookies", external: false },
		],
		seppo: {
			placeholder: "Kysy VISPistä…",
			subtitle: "Tuoteopas: kysy, mitä VISP osaa",
			suggestions: [
				"Voinko striimata ilman OBS:ää?",
				"Mitä tapahtuu, kun yhteys katkeaa?",
				"Pelkkä puhelin vai oma OBS?",
			],
			welcome:
				"Hei, olen Seppo. Kysy, miten VISP pitää lähetyksesi käynnissä katvealueilla ilman tietokonetta, tai miten tuot puhelimen omaan OBS:ääsi.",
		},
	},

	home: {
		meta: {
			title: "VISP: striimaa puhelimesta Twitchiin, Kickiin ja YouTubeen",
			description:
				"Pysy livenä, vaikka kenttä katoaa. VISP pitää kanavasi lähetyksessä katvealueillakin ilman tietokonetta. Ilmainen, OBS:n kanssa tai ilman.",
		},
		hero: {
			title: "Astetta parempi striimaus-softa",
			body: "VISP striimaa puhelimesi Twitchiin, Kickiin ja YouTubeen ja pitää lähetyksen käynnissä katvealueillakin.",
			videoLabel: "VISP-lähetys käynnistyy puhelimesta ja kuva saapuu OBS:ään",
		},
		strip: fiStrip,
		stripNote:
			"Kaikki tämä tapahtuu VISPissä. Ei tietokonetta kotona, ei vuokrattavaa pilvi-OBS:ää.",
		noObs: {
			title: "Tähän et tarvitse OBS:ää.",
			mark: "Pelkkä puhelin",
			items: [
				{
					situation:
						"Kenttä katoaa katvealueella? Katsojat näkevät BRB-korttisi, ja VISP palaa liveen, kun yhteys palaa, ilman tietokonetta kotona.",
					feature: "",
				},
				{
					situation:
						"Tauko venyy? Plussalla BRB-kortin tilalla pyörivät lataamasi klipit, edelleen ilman tietokonetta.",
					feature: "",
				},
				{
					situation:
						"Haluat alertit ja tavoitepalkin ruutuun? Rakenna grafiikat (beta) selaimessa sen alert-widgetin ympärille, jota jo käytät, ilman tietokonetta kotona.",
					feature: "Cloud Studio (beta)",
				},
				{
					situation:
						"Festivaaliyleisö tukkii verkon? Sovellus lähettää Wi-Fin ja mobiilidatan kautta yhtä aikaa.",
					feature: "",
				},
				{
					situation:
						"Tunneli edessä? Chat-botti kertoo chatille, että palaat pian, ja ilmoittaa, kun olet takaisin.",
					feature: "Chat-botin ilmoitukset",
				},
				{
					situation:
						"Striimaa Twitchiin ja Kickiin yhtä aikaa. Puhelin lähettää yhden syötteen, ja VISP kopioi sen jokaiselle alustalle.",
					feature: "Multistream",
				},
				{
					situation:
						"Puhelin hukassa festareilla? Lähetysavaimesi ei ollut koskaan siinä. Poista laite hallintapaneelista.",
					feature: "Avaimet pysyvät palvelimella",
				},
			],
			link: "Katso kaikki, mitä pelkällä puhelimella saa",
		},
		more: [
			"Uusi kaupunki, uusi kategoria? Vaihda otsikko ja kategoria sovelluksesta.",
			"Akkua 3 % jäljellä? Aloita lähetys toisella puhelimella, niin se jatkaa siitä.",
			"Yksi alusta reistailee? Sen lähtö yrittää uudelleen itsestään, ja muut pysyvät livenä.",
		],
		chooser: {
			title: "Mistä lähetetään?",
			phone: {
				title: "VISPissä, puhelimesta",
				body: "Kaikki yllä oleva ilman tietokonetta.",
				badge: "Useimpien valinta",
			},
			obs: {
				title: "Omassa OBS:ssäni",
				body: "Kohtaukset ja alertit jo rakennettu OBS:ään? Lisää puhelin sinne kameraksi.",
			},
		},
		storiesTitle: "Tekijät VISPin parissa",
		faq: {
			title: "Usein kysyttyä",
			items: [
				{
					q: "Mikä VISP on?",
					a: "Sovellus, jolla striimaat puhelimesta Twitchiin, Kickiin ja YouTubeen. Pelkällä puhelimella VISPin palvelin tekee ilman tietokonetta sen työn, johon ennen tarvittiin kotona pyörivä OBS-kone. Se pitää sinut lähetyksessä, kun yhteys katkeaa, ja vie yhden syötteen kaikille alustoille. Jos sinulla on jo OBS, VISP tuo puhelimen siihen kameraksi.",
				},
				{
					q: "Tarvitsenko OBS:n tai tietokoneen?",
					a: "Et. Pelkkä puhelin hoitaa sen, mihin OBS:ää yleensä tarvitaan: BRB-kortin, kun yhteys katkeaa, omat klipit (Plus) sekä grafiikat ja alertit (beta) ilman tietokonetta. Valitse oma OBS, jos olet jo rakentanut studiosi sinne.",
				},
				{
					q: "Mitä tapahtuu, kun yhteys katkeaa?",
					a: "Kun Never drop on päällä, katsojat näkevät BRB-korttisi tai klippisi (Plus) eivätkä ilmoitusta lähetyksen päättymisestä. Chat-botti kertoo chatille, että palaat pian, ja VISP palaa liveen itsestään, kun puhelin saa taas yhteyden. VISPin palvelin hoitaa kaiken ilman tietokonetta.",
				},
				{
					q: "Voinko käyttää Wi-Fiä ja mobiiliverkkoa yhtä aikaa?",
					a: "Voit. VISP-sovelluksen Network bonding voi yhdistää Wi-Fin ja mobiilidatan yhdeksi lähetykseksi tai lähettää jokaisen paketin molempia reittejä pitkin, jolloin kumpi tahansa verkko voi pätkiä ilman, että kuva jäätyy. Voit myös pitää toisen verkon varalla.",
				},
				{
					q: "Pitääkö lähetysavain liittää puhelimeen?",
					a: "Ei. VISP hakee lähetysavaimen palvelimellaan vain lähetyksen ajaksi, eikä avain koskaan päädy puhelimeen. Jos puhelin katoaa, poista laite hallintapaneelista, eikä sillä voi enää striimata nimissäsi.",
				},
				{
					q: "Paljonko VISP maksaa?",
					a: "VISP on ilmainen, OBS:n kanssa tai ilman. Plus maksaa 9 euroa kuukaudessa ja lisää palvelimella toimivan puheäänen, tekstityksen ja äänen eristyksen sekä BRB-kortille omat koosteet, edelleen ilman tietokonetta. Yleisöä keränneet tekijät voivat hakea Affiliate-ohjelmaan ja saada kaikki ominaisuudet ilmaiseksi. Plus-kiintiöt pätevät silti.",
				},
				{
					q: "Toimiiko VISP iPhonella ja Androidilla?",
					a: "Toimii. VISP-sovellus toimii iPhonella ja Androidilla, ja voit striimata myös selaimesta. Network bonding vaatii sovelluksen.",
				},
			],
		},
		closing: {
			title: "Seuraava striimisi alkaa puhelimesta.",
			body: "VISP on ilmainen. Kirjaudu Twitchillä, Kickillä tai Googlella ja aloita lähetys sovelluksesta.",
		},
	},

	phoneOnly: {
		meta: {
			title: "IRL-striimaus puhelimesta ilman OBS:ää | VISP",
			description:
				"Striimaa puhelimesta Twitchiin, Kickiin ja YouTubeen ilman tietokonetta ja OBS:ää. Mobiilidata katkeaa? Katsojat näkevät BRB-kortin. Grafiikat (beta) VISPissä.",
		},
		hero: {
			title: "Kaikki, mitä striimiin tarvitaan, pelkällä puhelimella",
			body: "Pysy lähetyksessä katvealueiden yli, näytä omia klippejä tauolla (Plus) ja lisää grafiikat ja alertit (beta), kaikki yhdellä puhelimella. Tietokonetta ei tarvita.",
			imageAlt: "VISP-sovellus suorassa lähetyksessä puhelimella",
		},
		why: {
			title: "Miksi kotikonetta ei enää tarvita",
			body: "Pysyäkseen livenä katvealueilla ja näyttääkseen BRB-kortin tai grafiikat IRL-striimaajat tarvitsivat ennen kotona pyörivän OBS-koneen tai 120–180 dollaria kuussa maksavan pilvi-OBS:n. Direct siirtää sen työn grafiikoineen (beta) VISPin palvelimelle, joten tietokonetta ei tarvita. Puhelimesi lähettää yhden syötteen, ja VISP rakentaa lähetyksen ja pitää sen käynnissä.",
		},
		strip: fiStrip,
		situationsTitle: "Yhteys katkeaa, lähetys ei",
		situations: [
			{
				heading: "Subathon automatkalla.",
				body: "Liikkuvassa autossa kenttä katoaa muutaman minuutin välein. Jokainen katko lopettaa lähetyksen, pilkkoo subathonin kymmeneksi VODiksi ja ajaa katsojat muualle. Lähetys ei katkea koskaan. Kun puhelin hakee kenttää, katsojat katsovat lataamiasi klippejä (Plus), ja VISP palaa liveen heti, kun yhteys palaa. Tietokonetta ei tarvita.",
				feature: "Never drop + BRB-koosteet (Plus)",
			},
			{
				heading: "Festivaalin tungos.",
				body: "Kolmekymmentätuhatta puhelinta samassa mastossa, ja lähetys matelee. Sovellus lähettää Wi-Fin ja mobiilidatan kautta yhtä aikaa tai jokaisen paketin molempia reittejä pitkin, joten yksi tukkoinen verkko ei jäädytä kuvaasi.",
				feature: "Network bonding",
			},
			{
				heading: "Tunneliin.",
				body: 'Katoat, ja chat alkaa kysellä, kuoliko striimi. Chat-botti kirjoittaa "yhteys katkesi, palaan pian", kun yhteys katkeaa, ja "takaisin", kun palaat, joten modit ja katsojat tietävät jäädä.',
				feature: "Chat-botin ilmoitukset",
			},
		],
		studio: {
			heading: "Sub-tavoite vaelluksella.",
			body: "Haluat alertit ja tavoitepalkin ruutuun, mutta kotona ei ole konetta pyörittämässä niitä. Rakenna näkymät selaimessa hälytyswidgetilläsi ja grafiikoilla; VISP lisää ne lähetykseen palvelimellaan. Tietokonetta ei tarvita. Cloud Studiossa (beta) on enintään 3 näkymää ja kussakin 8 tasoa. Tasoina voi olla enintään kaksi julkista verkkosivua, kuten hälytyswidgetit, ja yksi taso voi olla VISP-hälytys.",
			feature: "Cloud Studio (beta)",
			beta: "Beta",
		},
		more: {
			title: "Mitä muuta saat",
			items: [
				{
					heading: "Twitch ja Kick yhtä aikaa.",
					body: "Kaksi striimiä yhdestä puhelimesta tarkoittaa yleensä tuplasti lähetysdataa ja kuuman, hyytyvän akun. Puhelimesi lähettää yhden syötteen, VISP vie sen jokaiselle alustalle, ja jos yhdellä alustalla on ongelma, muut jatkavat.",
					feature: "Multistream",
				},
				{
					heading: "Puhelin hukassa festareilla.",
					body: "Tai lainaat sen kaverille päiväksi. Lähetysavaimesi ei ole koskaan puhelimessa. Poista laite hallintapaneelista, eikä sillä voi enää striimata nimissäsi.",
					feature: "Avaimet palvelimella, laitteet poistettavissa",
				},
				{
					heading: "Uusi kaupunki, uusi kategoria.",
					body: "Just Chattingista on tullut Travel & Outdoors, eikä tietokonetta ole lähelläkään. Vaihda otsikko ja kategoria sovelluksesta.",
					feature: "Lähetyksen tiedot puhelimesta",
				},
				{
					heading: "Akkua 3 %.",
					body: "Lähetyksen on jatkuttava. Aloita lähetys toisella puhelimella, niin se ottaa lähetyksen hoitaakseen.",
					feature: "Laitteen vaihto",
				},
			],
		},
		obsNote: {
			text: "Onko sinulla jo studiokone ja kohtaukset, joista pidät?",
			link: "Tuo puhelin omaan OBS:ääsi",
		},
		versus: {
			title: "Pelkkä puhelin vai oma OBS",
			caption: "Pelkkä puhelin verrattuna omaan OBS:ään",
			columns: ["Pelkkä puhelin", "Oma OBS"],
			rows: [
				{
					label: "Lähetyksessä pysyminen, kun yhteys katkeaa",
					phone:
						"Kyllä. Katsojat näkevät BRB-korttisi, ja VISP palaa liveen itsestään. Tietokonetta ei tarvita.",
					obs: "Riippuu OBS-asetuksistasi, ja koneen on oltava kotona päällä.",
				},
				{
					label: "Omat klipit tauon aikana (Plus)",
					phone:
						"Kyllä, Plussalla. Lataamasi klipit pyörivät pysäytyskuvan sijaan. Tietokonetta ei tarvita.",
					obs: "Jos rakennat sen OBS:ääsi.",
				},
				{
					label: "Grafiikat, näkymät ja alertit",
					phone:
						"Cloud Studio (beta): enintään 3 näkymää, kussakin 8 tasoa, hälytyswidgetit selainlähteinä. Tietokonetta ei tarvita.",
					obs: "Niin monta kohtausta, lähdettä ja lisäosaa kuin koneesi jaksaa.",
				},
				{
					label: "Wi-Fi ja mobiilidata yhtä aikaa",
					phone: "Kyllä, sovelluksen Network bonding -asetuksella.",
					obs: "Kyllä, sovelluksen Network bonding -asetuksella.",
				},
				{
					label: "Usealle alustalle yhtä aikaa",
					phone:
						"Yksi lähetys Twitchiin, Kickiin ja YouTubeen. Jokaisen alustan lähtö yrittää uudelleen itsestään.",
					obs: "Riippuu OBS-asetuksistasi.",
				},
				{
					label: "Lähetysavain puhelimessa",
					phone: "Ei koskaan. Avain pysyy VISPin palvelimella.",
					obs: "Ei koskaan. Avain pysyy OBS:ssäsi.",
				},
				{
					label: "Tietokone kotona",
					phone: "Ei tarvita.",
					obs: "Tarvitaan, ja OBS:n on oltava käynnissä.",
				},
				{
					label: "Omat mikrofonit, kamerat ja kaappauskortit",
					phone: "Se, minkä puhelimesi kuvaa ja kuulee.",
					obs: "Kaikki, mitä koneeseesi saa kytkettyä. Tässä OBS on vahvempi.",
				},
				{
					label: "Usean kameran kohtaukset",
					phone: "Yksi puhelinkamera ja enintään 3 näkymää (beta).",
					obs: "Monta kameraa ja monimutkaiset kohtaukset. Tässä OBS on vahvempi.",
				},
				{
					label: "Paikallinen tallennus",
					phone: "Alustasi VODit.",
					obs: "Täysilaatuinen tallennus omalle koneelle. Tässä OBS on vahvempi.",
				},
			],
		},
		cost: {
			heading: "Säästä 1\u00a0440–2\u00a0160\u00a0$ vuodessa",
			body: "Pilvi-OBS-palvelut veloittavat 120–180 dollaria kuussa siitä, että pysyt lähetyksessä ja grafiikkasi pyörivät. Pelkkä puhelin tekee saman VISPin palvelimella: Never drop, BRB-kortti ja grafiikat (beta) ilman tietokonetta ja ilman vuokrattavaa pilvi-OBS:ää. VISP on ilmainen. Plus lisää palvelimen lisäpalvelut, kuten BRB-koosteet, 9 eurolla kuukaudessa.",
			chartSubtitle:
				"VISP niiden pilvi-OBS-palveluiden rinnalla, jotka se korvaa.",
			...fiCostShared,
		},
		steps: {
			title: "Näin se toimii",
			items: [
				{
					title: "Kirjaudu sisään",
					body: "Kirjaudu Twitchillä, Kickillä tai Googlella.",
				},
				{
					title: "Valitse, minne striimaat",
					body: "Valitse Twitch, Kick, YouTube tai useampi kerralla.",
				},
				{
					title: "Paina Go live",
					body: "Avaa VISP-sovellus ja paina Go live. Puhelimeen ei tarvita OBS:ää eikä lähetysavainta.",
				},
			],
		},
		faq: {
			title: "Kysymyksiä pelkästä puhelimesta",
			items: [
				{
					q: "Tarvitsenko OBS:n BRB-korttiin tai grafiikoihin?",
					a: "Et. VISP näyttää BRB-korttisi, kun olet poissa linjoilta, ja lisää grafiikat ja alertit (beta) omalla palvelimellaan. Tietokonetta ei tarvita.",
				},
				{
					q: "Mitä katsojat näkevät, kun yhteys katkeaa?",
					a: "Kytke Never drop päälle hallintapaneelin BRB-välilehdeltä, niin katsojat näkevät BRB-korttisi: mustan ruudun, oman kuvasi tai lataamasi klipit (Plus). Chat-botti voi kertoa chatille, että palaat pian. Kun puhelin saa taas yhteyden, VISP palaa liveen itsestään. Tietokonetta ei tarvita.",
				},
				{
					q: "Voinko striimata Twitchiin ja Kickiin yhtä aikaa?",
					a: "Voit. Puhelimesi lähettää yhden syötteen, ja VISP vie sen Twitchiin, Kickiin, YouTubeen tai omaan RTMP-, RTMPS- tai SRT-palvelimeesi. Jos yhdellä alustalla on ongelma, sen lähtö yrittää uudelleen itsestään, ja muut jatkavat.",
				},
				{
					q: "Mitä chat-botti kirjoittaa?",
					a: "Riippuu oman chat-bottisi asetuksista. Se voi kirjoittaa, kun lähetys alkaa, kun yhteys katkeaa, kun palaat ja kun lähetys päättyy, omilla sanoillasi. Viestit näkyvät omalla tililläsi, ja botti vastaa myös komentoihin, kuten !bitrate ja !uptime.",
				},
				{
					q: "Mitä jos akku loppuu kesken lähetyksen?",
					a: "Aloita lähetys toisella puhelimella. Uusin liveksi mennyt laite ottaa lähetyksen hoitaakseen.",
				},
				{
					q: "Mitä jos puhelin katoaa tai varastetaan?",
					a: "Lähetysavaimesi ei ollut koskaan siinä. Poista laite hallintapaneelista, eikä sillä voi enää striimata nimissäsi.",
				},
				{
					q: "Voinko vaihtaa otsikon ja kategorian puhelimesta?",
					a: "Voit. Vaihda ne VISP-sovelluksessa, missä ikinä oletkin.",
				},
			],
		},
		closing: {
			title: "Seuraavaan striimiisi riittää yksi puhelin.",
			body: "VISP on ilmainen. Kirjaudu Twitchillä, Kickillä tai Googlella, avaa sovellus ja aloita lähetys.",
		},
	},

	withObs: {
		meta: {
			title: "Puhelin kameraksi OBS:ään mistä tahansa | VISP",
			description:
				"Tuo puhelimesi kuva kotona pyörivään OBS:ään internetin yli mistä tahansa. Vaihda kohtauksia puhelimesta avaamatta portteja. Ilmainen vaihtoehto pilvi-OBS:lle.",
		},
		noPcNote: {
			text: "Ei studiokonetta? Pelkkä puhelin pitää sinut lähetyksessä klipein (Plus) ja grafiikoin (beta), ilman tietokonetta.",
			link: "Katso pelkkä puhelin",
		},
		hero: {
			title: "Puhelimesi livenä omassa OBS:ssäsi, mistä tahansa.",
			body: "VISP tuo puhelimesi kameran kotona pyörivään OBS:ään, jossa kohtauksesi, hälytyksesi ja sponsorigrafiikkasi odottavat. Vaihda kohtauksia ja käynnistä tai pysäytä OBS puhelimesta.",
			videoLabel: "VISP-lähetys käynnistyy ja kuva saapuu OBS:ään",
		},
		plugin: {
			title: "VISP OBS -lisäosa",
			body: "Puhelimesta tulee kamera omaan OBS:ääsi. Lisäosa ottaa yhteyden VISPiin ulospäin, joten ohjaat OBS:ää puhelimesta avaamatta kotiverkkoosi yhtään porttia.",
			steps: [
				"Asenna VISP OBS -lisäosa.",
				"Avaa OBS:ssä Työkalut (Tools) ja sitten VISP, ja kirjaudu sisään selaimessa.",
				"Lisää puhelimesi nykyiseen kohtaukseen yhdellä klikkauksella.",
				"Käynnistä ja pysäytä OBS ja vaihda kohtauksia puhelimesta.",
			],
			download: "Lataa OBS-lisäosa",
			docs: "Lue asennusohje",
		},
		situationsTitle: "Studiosi mukana, missä ikinä oletkin",
		situations: [
			{
				heading: "Studiosi on kotona, sinä et.",
				body: "Kohtauksesi, hälytyksesi ja sponsorigrafiikkasi ovat kotikoneella. Puhelimesta tulee kamera siihen OBS:ään mistä tahansa, ja lisäosa lisää sen nykyiseen kohtaukseen yhdellä klikkauksella.",
				feature: "VISP OBS -lisäosa",
			},
			{
				heading: "Kohtauksen vaihto kesken kävelyn.",
				body: 'Pitäisi vaihtaa "palaan pian" -kohtaukseen, eikä koneella ole ketään. Vaihda kohtauksia ja käynnistä tai pysäytä OBS puhelimesta. Kotiverkkoon ei avata portteja.',
				feature: "OBS:n etäohjaus",
			},
			{
				heading: "Vieras toisessa kaupungissa.",
				body: "Haluat hänet ruutuun antamatta lähetysavaintasi. Lisää vieraslaite ja lähetä hänelle sen linkki. Hän striimaa selaimestaan sinun OBS:ääsi, ja poistat laitteen, kun lähetys on ohi.",
				feature: "Etävieras",
			},
			{
				heading: "Festivaalin tungos, studio kotona.",
				body: "Kolmekymmentätuhatta puhelinta samassa mastossa, ja lähetys matelee. Sovellus lähettää Wi-Fin ja mobiilidatan kautta yhtä aikaa tai jokaisen paketin molempia reittejä pitkin, joten kuva kulkee OBS:ääsi.",
				feature: "Network bonding",
			},
		],
		studio: {
			title: "Pidä studiosi",
			items: [
				"Omat OBS-kohtauksesi, grafiikkasi ja sponsorikuvasi pysyvät ennallaan.",
				"alertit ja OBS-lisäosat toimivat kuten ennenkin.",
				"Tallenna paikallisesti täydellä laadulla.",
				"Ota etävieraita mukaan selaimen kautta.",
			],
		},
		cost: {
			heading: "Säästä 1\u00a0440–2\u00a0160\u00a0$ vuodessa",
			body: "Pilvi-OBS-tilaukset maksavat 120–180 dollaria kuussa. Jos sinulla on jo OBS:ää pyörittävä kone, VISP tuo puhelimesi siihen ilmaiseksi, ja oma OBS:si tekee työn, josta maksoit vuokraa. Etkö halua pitää konetta päällä? Pelkkä puhelin pitää sinut lähetyksessä BRB-kortilla ja grafiikoilla (beta). Tietokonetta ei tarvita.",
			chartSubtitle:
				"VISP pilvi-OBS:n rinnalla. OBS-rivi olettaa, että sinulla on jo OBS:ää pyörittävä kone.",
			...fiCostShared,
		},
		steps: {
			title: "Näin se toimii",
			items: [
				{
					title: "Asenna lisäosa ja kirjaudu",
					body: "Asenna VISP OBS -lisäosa, avaa Työkalut (Tools) ja sitten VISP, ja kirjaudu sisään selaimessa.",
				},
				{
					title: "Lisää puhelin lähteeksi",
					body: "Lisää puhelimesi nykyiseen kohtaukseen yhdellä klikkauksella.",
				},
				{
					title: "Aloita lähetys puhelimesta",
					body: "Avaa VISP-sovellus ja aloita lähetys. Puhelimesi kuva näkyy OBS:ssä.",
				},
			],
		},
		faq: {
			title: "Kysymyksiä VISPistä ja OBS:stä",
			items: [
				{
					q: "Voiko VISP korvata pilvi-OBS-tilaukseni?",
					a: "Voi, jos sinulla on OBS:ää pyörittävä tietokone. VISP tuo puhelimesi omaan OBS:ääsi, jossa kohtauksesi, hälytyksesi ja lisäosasi toimivat edelleen. Ei tietokonetta? Pelkkä puhelin antaa BRB-kortin ja grafiikat (beta) VISPin palvelimella.",
				},
				{
					q: "Miten VISP vertautuu IRLToolkitiin ja muihin pilvi-OBS-palveluihin?",
					a: "Pilvi-OBS-palvelut pyörittävät OBS:ää puolestasi 120–180 dollarilla kuussa. VISP tuo puhelimesi omaan OBS:ääsi ilmaiseksi. Tämän sivun vertailu näyttää, mihin kukin sopii parhaiten.",
				},
				{
					q: "Pitääkö reitittimestä avata portteja?",
					a: "Ei. Lisäosa ottaa yhteyden VISPiin ulospäin, ja puhelin ohjaa OBS:ää sen yhteyden kautta. Kotiverkostasi ei avata mitään internetiin.",
				},
				{
					q: "Voinko vaihtaa OBS-kohtauksia puhelimesta?",
					a: "Voit. Vaihda kohtauksia ja käynnistä tai pysäytä OBS VISP-sovelluksesta.",
				},
				{
					q: "Voiko vieras liittyä toisesta kaupungista?",
					a: "Voi. Lisää vieraslaite ja lähetä hänelle sen linkki. Hän avaa linkin selaimessa ja striimaa sinun OBS:ääsi. Poista laite, kun lähetys on ohi.",
				},
				{
					q: "Missä lähetysavaimeni on?",
					a: "OBS:ssäsi, kuten nytkin. Puhelin lähettää syötteensä vain VISPille eikä tarvitse lähetysavainta.",
				},
			],
		},
		closing: {
			title: "Tuo puhelin studioosi.",
			body: "VISP on ilmainen. Asenna lisäosa, kirjaudu sisään, ja puhelimesi on kamera OBS:ssäsi.",
		},
	},

	stories: [],
};

export const landingCopy = { en, fi };
