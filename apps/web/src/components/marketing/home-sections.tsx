import { Link } from "@tanstack/react-router";

import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";

import { Faq } from "./faq";
import { SignalStrip } from "./signal-strip";
import { Stories } from "./stories";
import { mktH2, mktTextLink } from "./styles";

const TILE =
	"relative flex flex-col rounded-lg border p-6 transition-colors sm:p-8";
const TILE_TITLE = "mkt-display text-[clamp(1.75rem,4.5vw,2.5rem)]";
const TILE_BODY = "mt-3 max-w-[40ch] text-ink-muted leading-relaxed";

/**
 * Home between the hero and the closing CTA: the strip, what phone only does,
 * the chooser, stories, and the FAQ. Needs only a router context for its
 * Links (the test builds a bare one); the route page adds the hero and
 * closing, which need the full router for TryCta.
 * Children of the page's flex column, so an empty Stories leaves no gap.
 */
export function HomeSections({ locale }: { locale: Locale }) {
	const { home, stories } = landingCopy[locale];
	const fi = locale === "fi";
	const phoneTo = fi ? "/fi/phone-only" : "/phone-only";
	const obsTo = fi ? "/fi/with-obs" : "/with-obs";

	return (
		<>
			<section>
				<SignalStrip copy={home.strip} />
				<p className="mt-10 max-w-[44ch] font-semibold text-[1.25rem] leading-snug md:mt-12 md:text-[1.5rem]">
					{home.stripNote}
				</p>
			</section>

			<section>
				<h2 className={mktH2}>{home.noObs.title}</h2>
				<ul className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
					{home.noObs.items.map((item) => (
						<li
							key={item.feature}
							className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3"
						>
							<Check />
							<div>
								<p className="max-w-[60ch] leading-relaxed">{item.situation}</p>
								<p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
									<span className="font-semibold">{home.noObs.mark}</span>
									<span className="text-ink-muted">{item.feature}</span>
								</p>
							</div>
						</li>
					))}
				</ul>
				<ul className="mt-12 grid max-w-[70ch] gap-4 text-ink-muted leading-relaxed">
					{home.more.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
				<Link to={phoneTo} className={`${mktTextLink} mt-8`}>
					{home.noObs.link}
				</Link>
			</section>

			<section>
				<h2 className={mktH2}>{home.chooser.title}</h2>
				<div className="mt-10 grid gap-4 md:grid-cols-2 md:gap-6">
					<Link
						to={phoneTo}
						className={`${TILE} border-on-air/60 hover:border-on-air`}
					>
						{/* The tally light: red marks the route most creators put on air. */}
						<span
							aria-hidden
							className="absolute top-0 left-8 h-1 w-12 rounded-b-sm bg-on-air"
						/>
						<h3 className={TILE_TITLE}>{home.chooser.phone.title}</h3>
						<p className={TILE_BODY}>{home.chooser.phone.body}</p>
						<span className="mt-auto inline-flex items-center gap-2 pt-8 font-semibold text-sm">
							<span aria-hidden className="size-2 rounded-full bg-on-air" />
							{home.chooser.phone.badge}
						</span>
					</Link>
					<Link
						to={obsTo}
						className={`${TILE} border-ink/20 hover:border-ink/60`}
					>
						<h3 className={TILE_TITLE}>{home.chooser.obs.title}</h3>
						<p className={TILE_BODY}>{home.chooser.obs.body}</p>
					</Link>
				</div>
			</section>

			<Stories stories={stories} title={home.storiesTitle} />

			<section>
				<Faq copy={home.faq} />
			</section>
		</>
	);
}

function Check() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 20 20"
			className="mt-1 size-5 fill-none stroke-ink"
			strokeWidth={2.25}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M4 10.5l4 4L16 6" />
		</svg>
	);
}
