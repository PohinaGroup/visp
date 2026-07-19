import * as UI from "@expo/ui";

// @expo/ui web components style themselves with --expo-ui-* CSS variables that
// only UI.Host injects, and this app renders no Host. Without them the picker
// <select>s draw black-on-black. The vaul bottom sheet is also fixed edge to
// edge, which is unusable on desktop widths.
const css = `
[data-vaul-drawer][data-vaul-drawer-direction="bottom"] {
	max-width: 560px;
	margin-inline: auto;
}
`;

export function ExpoUiWebFixes() {
	return (
		<div style={{ display: "none" }}>
			<UI.Host matchContents />
			<style>{css}</style>
		</div>
	);
}
