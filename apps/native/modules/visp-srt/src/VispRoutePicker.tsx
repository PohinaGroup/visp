import { requireNativeView } from "expo";
import type { VispRoutePickerProps } from "./VispSrt.types";

export default requireNativeView<VispRoutePickerProps>(
	"VispSrt",
	"VispRoutePickerView",
);
