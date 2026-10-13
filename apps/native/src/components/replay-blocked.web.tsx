import type { ReactNode } from "react";

// Matches the replay block selector in lib/analytics.web.ts so secrets such
// as a revealed publish URL never reach a session recording.
export function ReplayBlocked({ children }: { children: ReactNode }) {
	return (
		<div className="rr-block" data-rybbit-block>
			{children}
		</div>
	);
}
