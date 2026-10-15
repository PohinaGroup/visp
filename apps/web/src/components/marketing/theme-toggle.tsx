import { cn } from "@VISP/ui/lib/utils";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { useLocale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { type ThemePreference, useThemePreference } from "@/lib/theme";

type Labels = (typeof landingCopy)["en"]["shared"]["nav"]["theme"];

const OPTIONS = [
	{ value: "light", Icon: SunIcon },
	{ value: "dark", Icon: MoonIcon },
	{ value: "system", Icon: MonitorIcon },
] as const;

/**
 * Light / dark / system as three toggle buttons. `value` is null until the
 * stored preference is read, so nothing shows as pressed during hydration.
 * "segmented" (menu sheet, inside .mkt) shows the words; "icons" (desktop
 * header) follows the surrounding text color so it fits app and marketing
 * pages alike.
 */
export function ThemeToggleView({
	value,
	labels,
	onChange,
	variant = "segmented",
	className,
}: {
	value: ThemePreference | null;
	labels: Labels;
	onChange: (next: ThemePreference) => void;
	variant?: "segmented" | "icons";
	className?: string;
}) {
	const icons = variant === "icons";
	return (
		<fieldset
			aria-label={labels.label}
			className={cn(
				icons
					? "flex gap-2 rounded-lg"
					: "grid grid-cols-3 gap-2 rounded-lg bg-ink/[0.07] p-1",
				className,
			)}
		>
			{OPTIONS.map(({ value: option, Icon }) =>
				icons ? (
					<button
						key={option}
						type="button"
						aria-pressed={value === option}
						aria-label={labels[option]}
						title={labels[option]}
						onClick={() => onChange(option)}
						className="inline-flex size-11 items-center justify-center rounded-lg opacity-60 transition-opacity hover:opacity-100 aria-pressed:bg-current/10 aria-pressed:opacity-100"
					>
						<Icon aria-hidden className="size-[1.125rem]" />
					</button>
				) : (
					<button
						key={option}
						type="button"
						aria-pressed={value === option}
						onClick={() => onChange(option)}
						className="h-12 min-w-0 truncate rounded-md px-1 font-semibold text-[0.9375rem] text-ink-muted transition-colors aria-pressed:bg-ink aria-pressed:text-paper motion-reduce:transition-none"
					>
						{labels[option]}
					</button>
				),
			)}
		</fieldset>
	);
}

export function ThemeToggle({
	variant,
	className,
}: {
	variant?: "segmented" | "icons";
	className?: string;
}) {
	const locale = useLocale();
	const { preference, setPreference } = useThemePreference();
	return (
		<ThemeToggleView
			value={preference}
			labels={landingCopy[locale].shared.nav.theme}
			onChange={setPreference}
			variant={variant}
			className={className}
		/>
	);
}
