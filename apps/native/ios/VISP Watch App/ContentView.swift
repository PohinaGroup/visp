import SwiftUI

struct ContentView: View {
  @ObservedObject var session: WatchSessionModel

  var body: some View {
    TabView {
      ChatView(snapshot: session.snapshot, isReachable: session.isReachable)
      HealthView(snapshot: session.snapshot, isReachable: session.isReachable)
    }
    .tabViewStyle(.verticalPage)
  }
}

private struct PhoneUnavailableView: View {
  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "iphone.slash")
        .font(.title2)
      Text("Open VISP on iPhone")
        .font(.headline)
        .multilineTextAlignment(.center)
      Text("Live data is unavailable")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
  }
}

private struct ChatView: View {
  let snapshot: WatchSnapshot?
  let isReachable: Bool

  private var connectedProviders: [String] {
    snapshot?.chat.statuses
      .filter { $0.value == "connected" }
      .map(\.key)
      .sorted() ?? []
  }

  var body: some View {
    if !isReachable {
      PhoneUnavailableView()
    } else if snapshot == nil {
      ProgressView("Syncing")
    } else if connectedProviders.isEmpty {
      VStack(spacing: 8) {
        Image(systemName: "bubble.left.and.exclamationmark.bubble.right")
          .font(.title2)
        Text("Chat disconnected")
          .font(.headline)
      }
      .accessibilityElement(children: .combine)
    } else if snapshot?.chat.messages.isEmpty != false {
      VStack(spacing: 8) {
        providerBadges
        Text("Waiting for chat")
          .font(.headline)
      }
      .accessibilityElement(children: .combine)
    } else {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 5) {
          providerBadges
          ForEach(Array((snapshot?.chat.messages ?? []).reversed())) { message in
            VStack(alignment: .leading, spacing: 1) {
              HStack(spacing: 4) {
                Text(message.senderName)
                  .font(.caption2.bold())
                  .foregroundStyle(Color.chat(message.senderColor))
                  .lineLimit(1)
                Spacer(minLength: 2)
                Text(message.provider == "twitch" ? "T" : "K")
                  .font(.caption2.bold())
                  .foregroundStyle(message.provider == "twitch" ? .purple : .green)
              }
              Text(message.text)
                .font(.caption)
                .lineLimit(2)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(message.senderName), \(message.text)")
          }
        }
      }
    }
  }

  private var providerBadges: some View {
    HStack(spacing: 5) {
      ForEach(connectedProviders, id: \.self) { provider in
        Text(provider == "twitch" ? "Twitch" : "Kick")
          .font(.caption2.bold())
          .foregroundStyle(provider == "twitch" ? .purple : .green)
      }
    }
  }
}

private struct HealthView: View {
  let snapshot: WatchSnapshot?
  let isReachable: Bool

  var body: some View {
    if !isReachable {
      PhoneUnavailableView()
    } else if let stream = snapshot?.stream {
      TimelineView(.periodic(from: .now, by: 1)) { timeline in
        VStack(spacing: 5) {
          Image(systemName: presentation(for: stream.state).icon)
            .font(.title2)
            .foregroundStyle(presentation(for: stream.state).color)
          Text(presentation(for: stream.state).label)
            .font(.headline)
          if let elapsed = elapsed(stream, at: timeline.date) {
            Text(elapsed)
              .font(.system(.title3, design: .monospaced, weight: .semibold))
          }
          audioMeter(stream.audioTier)
          if let width = stream.width, let height = stream.height, let fps = stream.fps {
            Text("\(width)×\(height) · \(fps) fps")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          if let detail = stream.message ?? stream.reconnectAttempt.map({ "Attempt \($0) of 3" }) {
            Text(detail)
              .font(.caption2)
              .foregroundStyle(stream.state == "error" ? .red : .secondary)
              .lineLimit(2)
              .multilineTextAlignment(.center)
          }
        }
        .accessibilityElement(children: .combine)
      }
    } else {
      ProgressView("Syncing")
    }
  }

  private func audioMeter(_ tier: Int) -> some View {
    HStack(alignment: .bottom, spacing: 3) {
      Image(systemName: "mic.fill")
        .font(.caption2)
      ForEach(1...3, id: \.self) { bar in
        Capsule()
          .fill(bar <= tier ? Color.green : Color.secondary.opacity(0.3))
          .frame(width: 4, height: CGFloat(4 + bar * 3))
      }
    }
    .accessibilityLabel("Microphone level \(tier) of 3")
  }

  private func elapsed(_ stream: WatchStreamSnapshot, at now: Date) -> String? {
    guard
      ["live", "reconnecting", "stopping"].contains(stream.state),
      let startedAt = stream.liveStartedAt
    else { return nil }
    let seconds = max(0, Int(now.timeIntervalSince1970 - startedAt / 1_000))
    return String(format: "%02d:%02d:%02d", seconds / 3_600, seconds / 60 % 60, seconds % 60)
  }

  private func presentation(for state: String) -> (label: String, icon: String, color: Color) {
    switch state {
    case "live": return ("Live", "dot.radiowaves.left.and.right", .green)
    case "preparing": return ("Starting camera", "camera.fill", .blue)
    case "connecting": return ("Connecting", "network", .yellow)
    case "reconnecting": return ("Reconnecting", "arrow.clockwise", .orange)
    case "stopping": return ("Stopping", "stop.circle.fill", .orange)
    case "error": return ("Offline", "exclamationmark.triangle.fill", .red)
    default: return ("Ready", "checkmark.circle.fill", .secondary)
    }
  }
}

private extension Color {
  static func chat(_ hex: String?) -> Color {
    guard
      let hex,
      hex.count == 7,
      hex.first == "#",
      let value = UInt64(hex.dropFirst(), radix: 16)
    else { return .primary }
    return Color(
      .sRGB,
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255,
      opacity: 1
    )
  }
}
