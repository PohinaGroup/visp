import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { legalEntity } from "@/lib/legal";

type LegalDocProps = {
	eyebrow: string;
	title: string;
	description: string;
	updated: string;
	children: ReactNode;
};

export function LegalDoc({
	eyebrow,
	title,
	description,
	updated,
	children,
}: LegalDocProps) {
	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:py-16">
			<header className="flex flex-col gap-4">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					{eyebrow}
				</p>
				<h1 className="font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-6xl">
					{title}
				</h1>
				<p className="max-w-prose text-muted-foreground">{description}</p>
				<p className="font-mono text-muted-foreground text-xs">
					Last updated {updated} · {legalEntity.companyName}
				</p>
			</header>

			<article className="flex flex-col gap-8 text-sm leading-relaxed [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:uppercase [&_h2]:tracking-tight [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
				{children}
			</article>

			<nav
				aria-label="Legal pages"
				className="flex flex-wrap gap-x-4 gap-y-2 border-border border-t pt-6 font-mono text-muted-foreground text-xs"
			>
				<Link className="hover:text-foreground" to="/privacy">
					Privacy
				</Link>
				<Link className="hover:text-foreground" to="/terms">
					Terms
				</Link>
				<Link className="hover:text-foreground" to="/cookies">
					Cookies
				</Link>
				<Link className="hover:text-foreground" to="/contact">
					Contact
				</Link>
				<a
					className="hover:text-foreground"
					href={legalEntity.sourceUrl}
					rel="noreferrer"
					target="_blank"
				>
					Source
				</a>
				<Link className="hover:text-foreground" to="/request-delete">
					Delete account
				</Link>
			</nav>
		</main>
	);
}
