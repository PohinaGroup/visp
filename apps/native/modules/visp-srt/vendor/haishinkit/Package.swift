// swift-tools-version:6.0
import PackageDescription

let swiftSettings: [SwiftSetting] = [
  .enableUpcomingFeature("ExistentialAny")
]

let package = Package(
  name: "VISPHaishinKit",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "HaishinKit", targets: ["HaishinKit"]),
    .library(name: "SRTHaishinKit", targets: ["SRTHaishinKit"]),
  ],
  dependencies: [
    .package(url: "https://github.com/shogo4405/Logboard.git", "2.6.0"..<"2.7.0")
  ],
  targets: [
    .binaryTarget(name: "libsrt", path: "Artifacts/libsrt.xcframework"),
    .target(
      name: "HaishinKit",
      dependencies: ["Logboard"],
      path: "HaishinKit/Sources",
      swiftSettings: swiftSettings
    ),
    .target(
      name: "SRTHaishinKit",
      dependencies: ["libsrt", "HaishinKit"],
      path: "SRTHaishinKit/Sources",
      swiftSettings: swiftSettings
    ),
  ],
  swiftLanguageModes: [.v6, .v5]
)
