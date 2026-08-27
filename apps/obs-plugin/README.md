# VISP Remote Control for OBS

This OBS Studio 31 plugin signs in to VISP, lists publishing devices, adds their
feeds as Media Sources, configures this OBS installation as a new publishing
device, and accepts remote start/stop and scene commands. It uses outbound HTTPS
for setup and authenticated outbound WSS for live control (WS on localhost for
development); OBS does not expose a public control port.

## Pair OBS

1. In OBS, open **Tools → VISP Remote Control**.
2. Click **Sign in with browser**, sign in to VISP, and approve the displayed
   code.
3. Back in OBS, add any existing device to the selected scene, or create an
   `OBS` publishing device to replace the current profile's stream destination.

Dashboard-generated tokens, custom control URLs, and imported `config.ini`
files remain available under **Advanced** for self-hosted and older
installations.

The Account section shows the signed-in VISP identity separately from live
control health. It reports **Live control connected** once the outbound
WebSocket connects; OBS does not need to restart.

If VISP rejects a saved machine credential, automatic retries stop and the
dialog shows **Sign in again**. The saved URL, token, and output device ID are
left intact. Use **Retry connection** for one fresh attempt with the saved
configuration, or sign in with the browser to replace the credential.

Connecting or rotating the token disconnects every older plugin configuration.
The browser session is discarded after pairing; OBS stores only the limited
random machine credential, and VISP stores only its SHA-256 hash.

## Release prebuilt downloads

The monorepo workflow uses the pinned official
[OBS plugin template](https://github.com/obsproject/obs-plugintemplate) helpers
to build and test Windows, macOS, and Ubuntu packages on pull requests and
`main`. A stable unified GitHub Release reuses the same workflow to sign and
notarize macOS, generate checksums, and attach every package to the existing
release. Set the version in `buildspec.json` to match the release tag without
its leading `v`, then publish the release:

```sh
git tag v1.0.1
git push origin v1.0.1
```

Release assets are uploaded with overwrite semantics, so rerunning a failed job
is safe. The workflow does not create a second draft or use the old `obs-v*`
tag convention. Required macOS signing/notarization secrets are listed in
[`deploy/UPDATE.md`](../../deploy/UPDATE.md). Users never need CMake.

## Developer build and test

The shared monorepo setup is documented in
[`DEVELOPMENT.md`](../../DEVELOPMENT.md). Plugin builds additionally require OBS
Studio 31 development files, CMake 3.28+, and the platform toolchain named by
the preset. Use the existing OBS plugin-template presets:

```sh
cmake --preset macos
cmake --build --preset macos
ctest --test-dir build_macos -C RelWithDebInfo
```

Equivalent `windows-x64` and `ubuntu-x86_64` presets are available. The plugin
uses OBS's existing Qt network stack with normal TLS certificate verification.
