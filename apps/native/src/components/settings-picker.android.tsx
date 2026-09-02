import type { PickerItemProps, PickerItemValue, PickerProps } from "@expo/ui";
import {
	DropdownMenu,
	DropdownMenuItem,
	Text,
	TextButton,
	useMaterialColors,
} from "@expo/ui/jetpack-compose";
import { Children, isValidElement, type ReactElement, useState } from "react";

function PickerItem<T extends PickerItemValue>(_props: PickerItemProps<T>) {
	return null;
}

function SettingsPickerBase<T extends PickerItemValue>({
	children,
	enabled = true,
	onValueChange,
	selectedValue,
}: PickerProps<T>) {
	const [expanded, setExpanded] = useState(false);
	const colors = useMaterialColors();
	const items = Children.toArray(children)
		.filter(
			(child): child is ReactElement<PickerItemProps<T>> =>
				isValidElement<PickerItemProps<T>>(child) &&
				typeof child.props.label === "string" &&
				"value" in child.props,
		)
		.map(({ props }) => props);
	const selectedLabel =
		items.find(({ value }) => value === selectedValue)?.label ?? "Choose";

	return (
		<DropdownMenu
			color={colors.surfaceContainerHigh}
			expanded={expanded}
			onDismissRequest={() => setExpanded(false)}
		>
			<DropdownMenu.Trigger>
				<TextButton
					colors={{
						contentColor: colors.primary,
						disabledContentColor: colors.onSurfaceVariant,
					}}
					contentPadding={{ bottom: 6, end: 8, start: 12, top: 6 }}
					enabled={enabled}
					onClick={() => setExpanded(true)}
				>
					<Text style={{ typography: "labelLarge" }}>{selectedLabel} ▾</Text>
				</TextButton>
			</DropdownMenu.Trigger>
			<DropdownMenu.Items>
				{items.map((item) => (
					<DropdownMenuItem
						key={String(item.value)}
						onClick={() => {
							onValueChange(item.value);
							setExpanded(false);
						}}
					>
						<DropdownMenuItem.Text>
							<Text>{item.label}</Text>
						</DropdownMenuItem.Text>
					</DropdownMenuItem>
				))}
			</DropdownMenu.Items>
		</DropdownMenu>
	);
}

export const SettingsPicker = Object.assign(SettingsPickerBase, {
	Item: PickerItem,
});
