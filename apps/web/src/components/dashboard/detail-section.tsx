import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { DocsHelpLink } from "@/components/docs-help-link";
import type { DetailSectionId } from "./types";

/** Open/close wiring a card forwards from the dashboard, so Seppo can open it. */
export type DetailSectionState = {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
};

// Occasional setup detail, filed inside the tab it belongs to and collapsed
// until asked for. Nothing here is gated on a mode — only folded away.
export function DetailSection({
	id,
	value,
	tag,
	title,
	action,
	docsHref,
	docsLabel,
	isOpen,
	onOpenChange,
	children,
}: DetailSectionState & {
	id?: string;
	value: DetailSectionId;
	tag: string;
	title: string;
	action?: ReactNode;
	docsHref?: string;
	docsLabel?: string;
	children: ReactNode;
}) {
	return (
		<Collapsible
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			trigger={
				<VStack gap={0.5}>
					<Text color="secondary" id={id} type="supporting">
						{tag}
					</Text>
					<HStack gap={2} vAlign="center" wrap="wrap">
						<HStack gap={1.5} vAlign="center">
							<Text type="label">{title}</Text>
							{docsHref && docsLabel ? (
								<DocsHelpLink href={docsHref} label={docsLabel} />
							) : null}
						</HStack>
						{action}
					</HStack>
				</VStack>
			}
			value={value}
		>
			<VStack gap={4} paddingBlock={2}>
				{children}
			</VStack>
		</Collapsible>
	);
}
