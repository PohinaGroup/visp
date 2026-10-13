import type { ReactNode } from "react";

// Session replay only runs on web; see replay-blocked.web.tsx.
export function ReplayBlocked({ children }: { children: ReactNode }) {
	return children;
}
