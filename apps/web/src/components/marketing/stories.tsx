import type { Story } from "@/lib/landing-copy";

import { mktH2 } from "./styles";

/** Real creator stories only; nothing renders until there is one. */
export function Stories({
	stories,
	title,
}: {
	stories: Story[];
	title: string;
}) {
	if (stories.length === 0) return null;
	return (
		<div>
			<h2 className={mktH2}>{title}</h2>
			<ul className="mt-10 grid gap-12 md:grid-cols-2 md:gap-x-12">
				{stories.map((story) => (
					<li key={story.channelUrl}>
						<figure>
							<blockquote className="mkt-display max-w-[32ch] text-[clamp(1.375rem,3vw,1.75rem)] leading-tight">
								<p>{story.quote}</p>
							</blockquote>
							<figcaption className="mt-5 flex items-center gap-3">
								{story.photo ? (
									<img
										src={story.photo}
										alt=""
										width={48}
										height={48}
										loading="lazy"
										className="size-12 rounded-full object-cover"
									/>
								) : null}
								<span>
									<a
										href={story.channelUrl}
										rel="noreferrer"
										className="font-semibold underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
									>
										{story.name}
									</a>
									<span className="block text-ink-muted text-sm">
										{story.streams}
									</span>
								</span>
							</figcaption>
						</figure>
					</li>
				))}
			</ul>
		</div>
	);
}
