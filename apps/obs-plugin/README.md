# VISP Remote Control for OBS

This OBS Studio 31 plugin lets an authenticated VISP web or native app start
and stop the stream. It makes one outbound HTTPS request every two seconds; OBS
does not expose a public control port.

## Pair OBS

1. In the VISP web dashboard, open **Plugin pairing** and generate a token.
2. In OBS, open **Tools → VISP Remote Control**.
3. Paste the token and click **Save**, or download `config.ini` from the
   dashboard and click **Import config.ini**.

The dashboard should show **Connected** within a few seconds; OBS does not need
to restart.

Rotating the token disconnects every older plugin configuration. The random
256-bit token is shown once and stored by VISP only as a SHA-256 hash.

## Release prebuilt downloads

The monorepo workflow uses the pinned official
[OBS plugin template](https://github.com/obsproject/obs-plugintemplate) helpers
to build Windows, macOS, and Ubuntu packages. Set the version in
`buildspec.json`, then push the matching tag:

```sh
git tag obs-v1.0.1
git push origin obs-v1.0.1
```

GitHub Actions creates a draft release with the prebuilt `.zip`, `.pkg`, and
`.deb` downloads and checksums. Publish the draft when the packages have been
tested; users never need CMake.

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
