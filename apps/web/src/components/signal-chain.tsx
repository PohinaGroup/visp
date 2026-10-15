import type { ReactNode } from "react";

export type ChainSlot = {
	label: string;
	value?: string;
	state: "active" | "set" | "open";
	// Live signal at the test step; color is signal state only.
	signal?: "live" | "caution" | "ok";
	status?: ReactNode;
	onSelect?: () => void;
};

const NODE = {
	live: "tally-pulse bg-tally",
	caution: "bg-caution",
	ok: "bg-signal",
	active: "bg-foreground",
	set: "bg-muted-foreground",
	open: "border border-muted-foreground bg-background",
} as const;

// A signal chain in signal order (source → relay → output). Each slot names
// what sits there, lights while active, can jump somewhere when clicked, and
// carries live signal state. A strip across the top on phones; a vertical
// rail on desktop.
export function SignalChain({
	label,
	slots,
}: {
	label: string;
	slots: ChainSlot[];
}) {
	return (
		<nav aria-label={label} className="md:sticky md:top-24 md:h-fit">
			<p className="hidden pb-6 text-muted-foreground text-sm md:block">
				{label}
			</p>
			<ol
				className={`grid md:grid-cols-1 ${slots.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}
			>
				{slots.map((slot, index) => {
					const body = (
						<>
							<span
								aria-hidden
								className={`relative z-[1] block size-2.5 shrink-0 md:mt-1.5 ${NODE[slot.signal ?? slot.state]}`}
							/>
							<span className="flex min-w-0 flex-col pt-3 md:pt-0">
								<span className="text-muted-foreground text-xs">
									{slot.label}
								</span>
								<span
									className={`break-words pr-2 font-display font-semibold text-base uppercase leading-tight tracking-tight sm:text-xl md:text-2xl ${
										slot.state === "open" ? "text-muted-foreground" : ""
									}`}
								>
									{slot.value ?? "—"}
								</span>
								{slot.status ? (
									<span className="hidden pt-1 text-muted-foreground text-sm md:block">
										{slot.status}
									</span>
								) : null}
							</span>
						</>
					);
					return (
						<li
							aria-current={slot.state === "active" ? "step" : undefined}
							className="relative min-w-0 md:pb-9 md:last:pb-0"
							key={slot.label}
						>
							{index < slots.length - 1 ? (
								<span
									aria-hidden
									className="absolute top-[5px] right-0 left-2.5 h-px bg-border md:top-4 md:right-auto md:bottom-0 md:left-[4.5px] md:h-auto md:w-px"
								/>
							) : null}
							{slot.onSelect ? (
								<button
									className="flex w-full flex-col text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 md:flex-row md:gap-4"
									type="button"
									onClick={slot.onSelect}
								>
									{body}
								</button>
							) : (
								<div className="flex flex-col md:flex-row md:gap-4">{body}</div>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
