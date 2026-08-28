// Monochrome level-meter mark — the de-neoned VISP mark (replaces SMPTE bars).
const BARS = [6, 12, 9, 16, 11, 7];

export function MeterMark({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={`flex h-4 items-end gap-[3px] ${className ?? ""}`}
		>
			{BARS.map((h, i) => (
				<span
					key={`${h}-${i}`}
					className="w-[3px] bg-foreground"
					style={{ height: h }}
				/>
			))}
		</span>
	);
}
