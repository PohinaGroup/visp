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
