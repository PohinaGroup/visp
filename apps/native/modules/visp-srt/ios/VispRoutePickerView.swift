import AVKit
internal import ExpoModulesCore

final class VispRoutePickerView: ExpoView {
  let routePicker = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addSubview(routePicker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    routePicker.frame = bounds
  }
}
