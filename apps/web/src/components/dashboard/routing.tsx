import type { CSSProperties, ReactNode } from "react";

// The Destinations tab is a crosspoint router: devices across the top,
// destinations down the side, one lit square where a device sends.
export type RouteState =
	| "live"
	| "starting"
	| "retrying"
	| "brb"
	| "stopping"
	| "failed"
	| "stopped"
	| null;

// Color is signal state only: tally = on air, caution = in between or
// broken, bone = routed and waiting.
const LAMP: Record<NonNullable<RouteState> | "idle", string> = {
	live: "tally-pulse bg-tally",
	starting: "bg-caution",
	retrying: "bg-caution",
	brb: "bg-caution",
	stopping: "bg-caution",
	failed: "bg-caution",
	stopped: "bg-foreground",
	idle: "bg-foreground",
};

export const ROUTE_STATE_LABEL: Record<NonNullable<RouteState>, string> = {
	live: "Live",
	starting: "Starting",
	retrying: "Retrying",
	brb: "Showing BRB card",
	stopping: "Stopping",
	failed: "Failed",
	stopped: "Ready",
};

/** One column per device, the destination name takes the rest. */
export function routingColumns(devices: number): CSSProperties {
	return {
		gridTemplateColumns: `minmax(0, 1fr) repeat(${devices}, minmax(2.75rem, 6.5rem))`,
	};
}

/** A row spanning the whole router, aligned to its device columns. */
export function RouteRow({ children }: { children: ReactNode }) {
	return (
		<div className="col-span-full grid grid-cols-subgrid items-start gap-y-3 border-border border-t py-4">
			{children}
		</div>
	);
}

/** Name, status line, and row actions for one destination. */
export function RouteName({
	name,
	meta,
	status,
	actions,
}: {
	name: string;
	meta?: ReactNode;
	status?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1 pr-3">
			<span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
				<span className="break-words font-display font-semibold text-2xl uppercase leading-none tracking-tight">
					{name}
				</span>
				{meta}
			</span>
			{status ? (
				<span className="text-muted-foreground text-sm leading-snug">
					{status}
				</span>
			) : null}
			{actions ? (
				<span className="-ml-2 flex flex-wrap items-center gap-1 pt-1">
					{actions}
				</span>
			) : null}
		</div>
	);
}

export function Crosspoint({
	label,
	on,
	state,
	disabled,
	hint,
	onChange,
}: {
	label: string;
	on: boolean;
	state: RouteState;
	disabled?: boolean;
	/** Why the crosspoint is locked, shown on hover. */
	hint?: string;
	onChange: (on: boolean) => void;
}) {
	return (
		<span className="flex justify-center">
			<button
				aria-checked={on}
				aria-label={label}
				className="grid size-11 place-items-center border border-border transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
				disabled={disabled}
				role="switch"
				title={disabled && hint ? hint : label}
				type="button"
				onClick={() => onChange(!on)}
			>
				<span
					aria-hidden
					// A locked lamp still shows its state: on air must never look dimmed.
					className={`size-4 ${on ? LAMP[state ?? "idle"] : `border border-muted-foreground/50 ${disabled ? "opacity-40" : ""}`}`}
				/>
			</button>
		</span>
	);
}

/** A crosspoint that cannot exist, e.g. a platform nobody authorized yet. */
export function NoCrosspoint() {
	return (
		<span
			aria-hidden
			className="flex h-11 items-center justify-center text-muted-foreground/50"
		>
			–
		</span>
	);
}

/** Small text button for row-level actions, quieter than astryx ghost. */
export function RowAction({
	label,
	onClick,
	disabled,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			className="px-2 py-1 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
			disabled={disabled}
			type="button"
			onClick={onClick}
		>
			{label}
		</button>
	);
}
