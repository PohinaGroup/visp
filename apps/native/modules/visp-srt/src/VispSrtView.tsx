import { requireNativeView } from "expo";
import type { ComponentType, RefAttributes } from "react";
import { forwardRef } from "react";

import type { VispSrtViewProps, VispSrtViewRef } from "./VispSrt.types";

const NativeView = requireNativeView<VispSrtViewProps>(
	"VispSrt",
	"VispSrtView",
) as ComponentType<VispSrtViewProps & RefAttributes<VispSrtViewRef>>;

export default forwardRef<VispSrtViewRef, VispSrtViewProps>(
	function VispSrtView(props, ref) {
		return <NativeView {...props} ref={ref} />;
	},
);
