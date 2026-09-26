import type { ReactNode } from "react";

// Shared eyebrow: mono, tracked-out, muted — the lander's caption voice.
export const EYEBROW =
	"font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground";

// Page framing that carries the lander's language into the app: a mono
// eyebrow, a Barlow-Condensed uppercase title, and a hairline baseline.
// `hero` is the larger marketing size; `children` sits under the subtitle.
export function PageHeader({
	eyebrow,
	title,
	subtitle,
	actions,
	hero = false,
	children,
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	hero?: boolean;
	children?: ReactNode;
}) {
	return (
		<header className="flex flex-col gap-4 border-border border-b pb-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div
					className={`flex flex-col gap-2 ${hero ? "max-w-4xl" : "max-w-xl"}`}
				>
					{eyebrow ? <div className={EYEBROW}>{eyebrow}</div> : null}
					<h1
						className={`font-display font-semibold uppercase leading-none tracking-tight ${
							hero ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl"
						}`}
					>
						{title}
					</h1>
					{subtitle ? (
						<p
							className={`text-muted-foreground leading-relaxed ${
								hero ? "max-w-2xl text-lg" : "text-sm"
							}`}
						>
							{subtitle}
						</p>
					) : null}
				</div>
				{actions ? <div className="shrink-0">{actions}</div> : null}
			</div>
			{children}
		</header>
	);
}
