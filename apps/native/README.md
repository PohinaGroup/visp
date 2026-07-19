# VISP native client

The app publishes the selected camera and microphone to a saved VISP SRT URL.
It requires a development build, and real camera streaming requires a physical
phone; Expo Go does not include the native SRT module.

Start with the repository's [development guide](../../DEVELOPMENT.md) for the
API, database, provider callbacks, and shared environment setup.

Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_SERVER_URL` to the API origin reachable by the device. After Twitch or Kick sign-in, the app creates and securely stores its publish URL automatically.

Expo SDK 57 sets the deployment target to iOS 16.4, so this app cannot retain the original iOS 15 target without downgrading Expo. The upstream libsrt 1.5.4 x86_64 simulator slice is incomplete; arm64 iPhones and Apple-silicon simulators are supported.

```sh
bun run --cwd apps/native ios
```

The generated `ios/` project is committed because it contains the HaishinKit Swift Package Manager dependency and inline Swift sources. If the iOS project is regenerated with Expo Prebuild, re-run `scripts/sync-haishinkit.rb` with the `xcodeproj` gem from CocoaPods before installing pods.

The Apple Watch companion lives in `targets/watch/` and is wired back into the
generated Xcode project by `@bacons/apple-targets` on every
`expo prebuild --clean`. It receives chat and stream-health snapshots from the
running iPhone app through WatchConnectivity and requires watchOS 10 or newer.
After prebuild, reopen the workspace and select the `VISP Watch` scheme.

Android 7 or newer is supported through Expo Prebuild and the pinned RootEncoder dependency. Use a physical device with USB debugging enabled; Expo Go does not include the native SRT module.

```sh
bun run --cwd apps/native android
```

The generated `android/` directory is intentionally ignored. Expo recreates it from `app.json`, the inline Kotlin module, and the RootEncoder config plugin.

Run native unit tests and type checking from the repository root:

```sh
bun run --cwd apps/native test
bun run --cwd apps/native check-types
```

## Release distribution

The production application identifier is `com.pohinagroup.visp` on both
platforms. A stable `vX.Y.Z` GitHub Release runs
`.eas/workflows/release.yml` on EAS's SDK 57 image, builds both production
binaries, submits Android to Play internal testing, and distributes iOS to the
`VISP Internal` TestFlight group. The GitHub workflow waits for EAS completion;
it does not publish an OTA update.

Before the first release, link this directory to the correct EAS project with
`eas init`, connect the GitHub repository in Expo, and configure production
build environment values and store credentials. Create the app records using
`com.pohinagroup.visp`, complete Google's required first upload manually if the
Play app is new, and create the `VISP Internal` TestFlight group. GitHub needs
an `EXPO_TOKEN` secret in its `production` environment.

For every release, keep the version in `app.json`, `package.json`, and every
committed iOS `MARKETING_VERSION` setting equal to the GitHub tag without its
leading `v`.

The browser build is released separately as static files at
`https://stream.visp-stream.com`. Its two public URLs come from
`/etc/visp/native-web.env`; see [`deploy/UPDATE.md`](../../deploy/UPDATE.md).
