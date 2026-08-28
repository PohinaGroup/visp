import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { CircleHelpIcon } from "lucide-react";
import type { MouseEvent } from "react";

/** Compact help icon that opens a docs page in a new tab. */
export function DocsHelpLink({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			label={label}
			target="_blank"
			tooltip={label}
			onClick={(event: MouseEvent) => {
				// Keep parent collapsibles / cards from toggling when opening docs.
				event.stopPropagation();
			}}
		>
			<Icon icon={CircleHelpIcon} size="sm" />
		</Link>
	);
}
