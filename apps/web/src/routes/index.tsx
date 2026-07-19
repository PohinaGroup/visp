import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [{ title: "VISP — streaming without the leash" }],
	}),
	component: HomeComponent,
});

const WORDS = [
	"the street.",
	"the venue.",
	"the crowd.",
	"the road.",
	"anywhere.",
] as const;
const GLYPHS = "#@$%&*+=<>/\\|~";

function ScrambleWord() {
	const [word, setWord] = useState<string>(WORDS[WORDS.length - 1]);

	useEffect(() => {
		let wi = 0;
		let anim: ReturnType<typeof setInterval> | undefined;
		const tick = setInterval(() => {
			const target = WORDS[wi];
			wi = (wi + 1) % WORDS.length;
			let frame = 0;
			const total = 12;
			clearInterval(anim);
			anim = setInterval(() => {
				frame++;
				if (frame >= total) {
					clearInterval(anim);
					setWord(target);
					return;
				}
				const reveal = Math.floor((frame / total) * target.length);
				let out = target.slice(0, reveal);
				for (let i = reveal; i < target.length; i++) {
					out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
				}
				setWord(out);
			}, 45);
		}, 2600);
		return () => {
			clearInterval(tick);
			clearInterval(anim);
		};
	}, []);

	return <span className="font-medium font-mono text-[#8a6bff]">{word}</span>;
}

function ImageSlot({ label }: { label: string }) {
	return (
		<div className="flex h-full w-full items-center justify-center border border-[#8a6bff]/15 border-dashed bg-[#14121f] p-6">
			<span className="max-w-[40ch] text-center font-mono text-[#8b87a3] text-xs">
				{label}
			</span>
		</div>
	);
}

function SignalAnimation() {
	const uplink = "M 112 148 C 210 178, 270 178, 358 148";
	const branches = [
		"M 442 148 C 540 148, 560 70, 680 70",
		"M 442 156 C 520 156, 560 152, 680 152",
		"M 442 164 C 540 164, 560 234, 680 234",
	];
	const nodeYs = [70, 152, 234];
	return (
		<div aria-hidden className="my-6 mb-[72px] px-6">
			<svg
				viewBox="0 0 800 270"
				className="mx-auto block w-full max-w-[900px]"
			>
				<defs>
					<radialGradient id="heroGlow">
						<stop offset="0%" stopColor="#8a6bff" stopOpacity="0.14" />
						<stop offset="100%" stopColor="#8a6bff" stopOpacity="0" />
					</radialGradient>
				</defs>
				<ellipse cx="400" cy="150" rx="340" ry="130" fill="url(#heroGlow)" />

				{/* phone */}
				<rect
					x="62"
					y="86"
					width="44"
					height="84"
					rx="10"
					fill="#14121f"
					stroke="#8a6bff"
					strokeOpacity="0.7"
					strokeWidth="2"
				/>
				<circle cx="84" cy="102" r="3" fill="#ff5c5c" className="tally-pulse" />
				<line
					x1="76"
					y1="160"
					x2="92"
					y2="160"
					stroke="#8a6bff"
					strokeOpacity="0.5"
					strokeWidth="2"
					strokeLinecap="round"
				/>
				{[12, 22, 32].map((r, i) => (
					<path
						key={r}
						d={`M 104 ${86 - r} A ${r} ${r} 0 0 1 ${104 + r} 86`}
						fill="none"
						stroke="#8a6bff"
						strokeWidth="2"
						strokeLinecap="round"
						className="radio-arc"
						style={{ animationDelay: `${i * 0.35}s` }}
					/>
				))}

				{/* uplink */}
				<path
					d={uplink}
					fill="none"
					stroke="#8a6bff"
					strokeOpacity="0.15"
					strokeWidth="2"
				/>
				<path
					d={uplink}
					fill="none"
					stroke="#8a6bff"
					strokeWidth="3"
					strokeLinecap="round"
					className="flow-line"
				/>

				{/* home studio */}
				<polyline
					points="358,134 400,102 442,134"
					fill="none"
					stroke="#8a6bff"
					strokeOpacity="0.7"
					strokeWidth="2"
					strokeLinejoin="round"
				/>
				<rect
					x="364"
					y="134"
					width="72"
					height="52"
					fill="#14121f"
					stroke="#8a6bff"
					strokeOpacity="0.7"
					strokeWidth="2"
				/>
				<rect
					x="386"
					y="148"
					width="28"
					height="18"
					rx="2"
					fill="none"
					stroke="#8a6bff"
					strokeOpacity="0.5"
					strokeWidth="2"
				/>

				{/* fan-out to platforms */}
				{branches.map((d, i) => (
					<g key={d}>
						<path
							d={d}
							fill="none"
							stroke="#8a6bff"
							strokeOpacity="0.15"
							strokeWidth="2"
						/>
						<path
							d={d}
							fill="none"
							stroke="#8a6bff"
							strokeWidth="3"
							strokeLinecap="round"
							className="flow-line"
							style={{ animationDelay: `${i * 0.25}s` }}
						/>
					</g>
				))}
				{nodeYs.map((y, i) => (
					<g key={y}>
						<circle
							cx="690"
							cy={y}
							r="6"
							fill="#14121f"
							stroke="#8a6bff"
							strokeWidth="2"
						/>
						<circle
							cx="690"
							cy={y}
							r="2.5"
							fill="#8a6bff"
							className="tally-pulse"
							style={{ animationDelay: `${i * 0.5}s` }}
						/>
					</g>
				))}

				{/* labels */}
				<text
					x="84"
					y="198"
					textAnchor="middle"
					fill="#8b87a3"
					fontSize="13"
					className="font-mono max-sm:hidden"
				>
					phone
				</text>
				<text
					x="400"
					y="212"
					textAnchor="middle"
					fill="#8b87a3"
					fontSize="13"
					className="font-mono max-sm:hidden"
				>
					home studio
				</text>
				<text
					x="690"
					y="262"
					textAnchor="middle"
					fill="#8b87a3"
					fontSize="13"
					className="font-mono max-sm:hidden"
				>
					everywhere.
				</text>
			</svg>
		</div>
	);
}

const ctaClass =
	"font-bold text-white bg-[#8a6bff] shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_2px_6px_rgba(0,0,0,.4),0_8px_28px_rgba(138,107,255,.28)] transition-all duration-200 hover:bg-[#9d84ff] hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_10px_32px_rgba(138,107,255,.45)]";

function TryCta({ className }: { className: string }) {
	const { data: session } = authClient.useSession();
	return (
		<Link to={session ? "/dashboard" : "/login"} className={className}>
			try VISP free
		</Link>
	);
}

const bentoCards = [
	{
		span: "sm:col-span-4",
		title: "the whole show, from a phone",
		body: "the VISP app — or the camera app you already love — becomes a proper camera for your full production. not a smaller substitute for it.",
		image: "phone-in-hand shot",
	},
	{
		span: "sm:col-span-2",
		title: "their studio, untouched",
		body: "scenes, alerts, graphics, and years of muscle memory keep working. nothing to rebuild — VISP plugs into the OBS setup you already have.",
	},
	{
		span: "sm:col-span-2",
		title: "two cameras, one stream",
		body: "run multiple phone cameras — each with its own mic — feeding the same broadcast. a second phone becomes a real scene, not a video-call window.",
	},
	{
		span: "sm:col-span-2",
		title: "streams that survive",
		body: "a short signal drop doesn't end the broadcast — the home studio keeps the show alive.",
	},
	{
		span: "sm:col-span-2",
		title: "keys that stay home",
		body: "every camera gets its own private access you can revoke anytime. your broadcast key never enters VISP.",
	},
];

function HomeComponent() {
	return (
		<main className="min-h-svh bg-[#0a0a12] font-grotesk text-[#eceaf4] antialiased selection:bg-[#8a6bff]/35">
			<nav className="mx-auto flex max-w-[1080px] items-center justify-between px-8 pt-[34px] pb-[26px]">
				<img src="/visp-logo.png" alt="VISP" className="h-[42px] w-auto" />
				<TryCta className="rounded-xl border border-[#8a6bff]/45 px-5 py-2.5 font-semibold text-[#b6a8ff] text-[14px] transition-all duration-200 hover:border-[#8a6bff] hover:bg-[#8a6bff]/10 hover:text-white" />
			</nav>

			<header className="mx-auto flex max-w-[820px] flex-col items-center gap-[26px] px-8 pt-12 pb-10 text-center sm:pt-[72px]">
				<h1 className="text-balance font-bold text-[44px] leading-[1.05] tracking-tight sm:text-[68px]">
					go live from
					<br />
					<ScrambleWord />
				</h1>
				<p className="max-w-[48ch] text-pretty text-[19px] text-[#b6b2cc] leading-relaxed">
					Run multiple phone cams with their own mics, pull a friend onto the
					stream, and keep broadcasting when the signal dips.
				</p>
				<p className="max-w-[40ch] text-pretty font-semibold text-[19px] leading-relaxed">
					Full production. Zero leash.
				</p>
				<div className="mt-1.5 flex flex-col items-center gap-3">
					<TryCta
						className={`rounded-[14px] px-10 py-4 text-[17px] ${ctaClass}`}
					/>
					<span className="font-mono text-[#8b87a3] text-[12.5px]">
						free while in beta · no credit card required
					</span>
				</div>
			</header>

			<SignalAnimation />

			<section
				id="how"
				className="mx-auto flex max-w-[1080px] flex-col gap-9 px-8 pb-[88px]"
			>
				<h2 className="text-balance text-center font-bold text-[32px] tracking-tight sm:text-[38px]">
					not for everyone. for creators who want…
				</h2>
				<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-6">
					{bentoCards.map((card) => (
						<div
							key={card.title}
							className={`flex flex-col gap-3 bg-[#14121f] p-[30px] ${card.span}`}
						>
							<h3 className="font-semibold text-[22px]">{card.title}</h3>
							<p className="text-pretty text-[#a7a3bd] text-[15.5px] leading-relaxed">
								{card.body}
							</p>
							{card.image && (
								<div className="mt-1.5 min-h-[180px] w-full flex-1 overflow-hidden">
									<ImageSlot label={card.image} />
								</div>
							)}
						</div>
					))}
				</div>
			</section>

			<section id="try" className="border-[#8a6bff]/15 border-t">
				<div className="mx-auto flex max-w-[760px] flex-col items-center gap-[18px] px-8 pt-[100px] pb-[110px] text-center">
					<h2 className="text-balance font-bold text-[40px] leading-[1.08] tracking-tight sm:text-[52px]">
						join the beta
					</h2>
					<div className="font-bold text-[#8a6bff] text-[40px] italic tracking-tight sm:text-[52px]">
						it's free
					</div>
					<TryCta
						className={`mt-3.5 rounded-[14px] px-[46px] py-[18px] text-lg ${ctaClass}`}
					/>
					<span className="font-mono text-[#8b87a3] text-[12.5px]">
						no credit card required · setup takes three questions, not three
						weekends
					</span>
				</div>
			</section>

			<footer className="flex flex-col items-center gap-3 border-[#8a6bff]/10 border-t px-8 py-[26px] font-mono text-[#7d7997] text-[12.5px]">
				<div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
					<Link className="hover:text-[#cfc9e8]" to="/privacy">
						Privacy
					</Link>
					<span aria-hidden>·</span>
					<Link className="hover:text-[#cfc9e8]" to="/terms">
						Terms
					</Link>
					<span aria-hidden>·</span>
					<Link className="hover:text-[#cfc9e8]" to="/cookies">
						Cookies
					</Link>
					<span aria-hidden>·</span>
					<Link className="hover:text-[#cfc9e8]" to="/contact">
						Contact
					</Link>
					<span aria-hidden>·</span>
					<a
						className="hover:text-[#cfc9e8]"
						href={legalEntity.sourceUrl}
						rel="noreferrer"
						target="_blank"
					>
						Source
					</a>
				</div>
				<div className="flex flex-wrap justify-center gap-2.5">
					<span>© 2026 VISP · Pöhinä Group Oy</span>
					<span aria-hidden>·</span>
					<span>phone is the camera. home is the studio.</span>
				</div>
			</footer>
		</main>
	);
}
