// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "VispSrtPolicy",
  platforms: [.macOS(.v13)],
  targets: [
    .target(
      name: "VispSrtPolicy",
      path: "ios",
      exclude: [
        "VispSrtModule.swift",
        "VispSrtView.swift",
        "WatchBridge.swift",
        "AudioIsolationProcessor.swift",
        "LiveCaptionsController.swift",
      ],
      sources: [
        "PreviewFramePolicy.swift",
        "RetryPolicy.swift",
        "StreamState.swift",
        "WatchSnapshot.swift",
      ]
    ),
    .testTarget(
      name: "VispSrtPolicyTests",
      dependencies: ["VispSrtPolicy"],
      path: "Tests"
    ),
  ]
)
