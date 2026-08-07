# Sign in with Apple (native iOS)

## Context

`apps/native` only offers third-party sign-in: Twitch, Google, and Kick (`StreamSignIn`
in `apps/native/src/components/stream-setup.tsx`). App Store Review Guideline 4.8
requires Sign in with Apple as an equivalent option whenever an app's only login
options are third-party social logins, so the iOS build cannot ship as-is.

Guideline 5.1.1(v) is the second blocker: the app creates accounts but offers no
in-app deletion. `apps/web/src/routes/request-delete.tsx` covers it on the web, but
Apple does not accept a web link in place of in-app deletion.

After Apple sign-in the user has a VISP account with no streaming platform attached.
That already works: `StreamDestinationEditor` auto-provisions a VISP relay path, and
`useStreamAccount.linkProvider` (`apps/native/src/lib/use-stream-account.ts:219`) links
Twitch/Kick/YouTube from Settings → Chat / Direct through `authClient.linkSocial` and
`authClient.oauth2.link`. **No new linking code is needed** — Apple just becomes another
way to reach that existing session.

Scope decided with the user: **iOS only**, native ASAuthorization sheet (not a browser
redirect), plus in-app account deletion. No Apple button on the web dashboard or Android.

## Approach

Use `expo-apple-authentication` to get an `identityToken`, then hand it to Better Auth's
ID-token sign-in branch. This avoids the browser redirect flow entirely, and with it the
Apple Services ID and the `.p8`-signed client-secret JWT that expires every 6 months.

Verified in `better-auth@1.6.23`:

- `api/routes/sign-in.mjs:76-127` — `signIn.social({ idToken })` verifies the token and
  returns a session directly, no redirect. It accepts `idToken.user.name.{firstName,lastName}`,
  which is exactly Apple's first-authorization payload.
- `@better-auth/core/src/social-providers/apple.ts:134-169` — `verifyIdToken` checks the
  audience against `appBundleIdentifier` and needs **no `clientSecret`**
  (`clientSecret?: string` in `oauth2/oauth-provider.ts:107`). `nonceMatches` accepts either
  the raw nonce or its SHA-256 hex, so passing one raw string to both Apple and Better Auth
  is correct either way.
- `@better-auth/expo/dist/client.js` — the Expo plugin explicitly skips the browser when the
  body contains `idToken`, sets `x-skip-oauth-proxy`, and its `onSuccess` hook still persists
  the returned `set-cookie` into SecureStore. So the existing session plumbing is untouched.

## Server

**`packages/auth/src/index.ts`** — add to `socialProviders` (after `google`):

```ts
// Native-only: iOS sends an identity token straight from ASAuthorization, so
// verification needs the bundle id as the audience and never the Services ID /
// .p8 client secret the browser redirect flow would require.
apple: {
    clientId: "com.pohinagroup.visp",
    appBundleIdentifier: "com.pohinagroup.visp",
},
```

The bundle identifier is a public value already hardcoded in `apps/native/app.json`, so it
stays out of `packages/env/src/schema.ts` — nothing to add to `.env` or `deploy/`.

Nothing else on the server changes:

- `trustedOrigins` — no redirect, no new origin.
- `accountLinking: { allowDifferentEmails: true }` — Apple reports `email_verified: true`, so
  "Share My Email" implicitly links to an existing verified Google/Twitch account
  (`oauth2/link-account.mjs:23`), and "Hide My Email" creates a fresh user. Both are correct.
- `packages/api/src/channel/linked-accounts.ts:69` filters on
  `inArray(account.providerId, ["twitch", "kick", "google"])`, so an `apple` account row never
  shows up as a streaming platform. Leave it that way.

## Native

**`apps/native/package.json`** — add `expo-apple-authentication` via
`bunx expo install expo-apple-authentication` (picks the SDK 57 version). `expo-crypto@~57.0.1`
is already a direct dependency; use `Crypto.randomUUID()` for the nonce rather than adding
anything.

**`apps/native/app.json`** — set `"usesAppleSignIn": true` inside `ios`. That is what enables
the capability; the config plugin entry is not needed on top of it. This is the single native
input for the whole change — see the CNG constraint under *iOS project regeneration*.

**`apps/native/src/lib/apple-sign-in.ts`** (new, ~25 lines):

```ts
export async function signInWithApple() {
	const nonce = Crypto.randomUUID();
	const credential = await AppleAuthentication.signInAsync({
		nonce,
		requestedScopes: [FULL_NAME, EMAIL],
	});
	if (!credential.identityToken) throw new Error("Apple did not return an identity token.");
	const { givenName, familyName } = credential.fullName ?? {};
	return authClient.signIn.social({
		provider: "apple",
		idToken: {
			token: credential.identityToken,
			nonce,
			// Apple sends the name only on the very first authorization. Better Auth
			// stores it at sign-up; on every later sign-in the token has no name.
			user: givenName ? { name: { firstName: givenName, lastName: familyName ?? "" } } : undefined,
		},
	});
}
```

Callers must treat `e.code === "ERR_REQUEST_CANCELED"` as a silent no-op, not an error message.

**`apps/native/src/components/stream-setup.tsx`** — widen the provider union to include
`"apple"` and render `AppleAuthentication.AppleAuthenticationButton`
(`buttonType: SIGN_IN`, `buttonStyle: WHITE`) **above** the Twitch button. Apple requires its
own button component and at least equal prominence; do not build a `Pressable` lookalike.
Gate rendering on an `AppleAuthentication.isAvailableAsync()` state so Android and the Expo
web build render nothing. If the web bundle chokes on the import, split it out following the
existing `backend.ts` / `backend.web.ts` platform-suffix pattern in this repo rather than
adding a runtime branch.

**`apps/native/src/app/index.tsx:388`** — `signIn` gets an `"apple"` branch calling
`signInWithApple()`. The existing "no session after the browser closed" check at line 412 is
about redirect flows; the ID-token call returns the session synchronously, so let that branch
return early instead of running the `getSession()` probe.

## Account deletion (guideline 5.1.1/v)

`user.deleteUser` is already enabled in `packages/auth/src/index.ts:79` with a `beforeDelete`
that clears S3 snapshots. No server change.

**`apps/native/src/components/stream-settings-advanced-section.tsx:25`** — add
`onDeleteAccount: () => void` to `AccountSettings` and a destructive `UI.Button` below the
existing "Sign out" button at line 245.

**`apps/native/src/lib/use-stream-settings-model.ts:84`** — supply `onDeleteAccount` next to
the existing `onSignOut`, mirroring its shape: `Alert.alert` confirmation → `camera?.stop()` →
`authClient.deleteUser()`.

Two verified details that must be handled:

- On success, follow with `authClient.signOut()` and ignore its error. The Expo plugin clears
  the SecureStore cookie and session cache in its `init` hook *before* the request goes out
  (`@better-auth/expo/dist/client.js`), so the local session is cleared even though the server
  session no longer exists.
- `api/routes/update-user.mjs:304` rejects a session older than `freshAge` (24h) with
  `SESSION_EXPIRED`. A phone left signed in for weeks will hit this. Surface a specific message
  — "Sign out and sign back in, then delete" — rather than a generic failure toast.

## Apple Developer portal (manual, not code)

Enable the **Sign In with Apple** capability on App ID `com.pohinagroup.visp` (team
`VKN9G4GC43`) before building. EAS regenerates the provisioning profile on the next build.
No Services ID, no Key/`.p8`, no Return URLs.

## iOS project regeneration

`apps/native/ios/` is source-controlled (it carries the vendored HaishinKit SPM linkage and
the watch target). Per `apps/native/README.md:24`:

```sh
cd apps/native
bunx expo prebuild --platform ios --clean
cd ios && pod install
```

**Hard constraint: `expo prebuild --clean` must keep working, and CNG stays the source of
truth.** Every native effect of this change has to be derivable from `app.json` alone:

- `ios.usesAppleSignIn: true` is the *only* input. It is what generates
  `com.apple.developer.applesignin` in `ios/VISP/VISP.entitlements`; autolinking pulls in the
  `ExpoAppleAuthentication` pod from the `package.json` dependency.
- **Do not hand-edit anything under `ios/`.** No manual entitlement key, no manual Xcode
  capability toggle, no `pbxproj` tweak. Anything added by hand is silently destroyed by the
  next `--clean` and turns the committed `ios/` tree into a fiction.
- No new config plugin is needed. Do not add `"expo-apple-authentication"` to the `plugins`
  array alongside `usesAppleSignIn` — one input, one effect.
- The existing plugin chain must keep composing: `./modules/visp-srt/with-root-encoder.cjs`
  (HaishinKit SPM linkage, x86_64 slice exclusion), `./targets/watch/with-watch-scheme.cjs`,
  and `@bacons/apple-targets` all run on the same prebuild. Apple Sign In touches only
  entitlements, so there is no expected interaction — but it is the thing to check first if
  the watch target or SRT linkage regresses.

After prebuild, review the diff and confirm:

- `ios/VISP/VISP.entitlements` gained `com.apple.developer.applesignin` and lost nothing.
- `ios/Podfile.lock` gained `ExpoAppleAuthentication`.
- The HaishinKit local package reference, `SRTHaishinKit` linkage, and the `VISP Watch`
  target/scheme are all still present in `ios/VISP.xcodeproj/project.pbxproj`.
- `MARKETING_VERSION` still reads `1.3.4` everywhere it appears.

Then run prebuild a second time and confirm `git status` is clean — that is the actual proof
that CNG reproduces the committed tree rather than drifting from it. Commit the `ios/` diff
only once that holds.

## Verification

1. `bun run --cwd apps/native check-types` and `bun run --cwd apps/native lint` — the provider
   union widening touches several files and the compiler will find the ones missed here.
2. `bun run --cwd apps/native test` — add one assertion-based test alongside
   `apps/native/src/lib/auth-callback.test.ts` covering `apple-sign-in.ts`'s payload shape:
   name included when `fullName.givenName` is present, omitted on a repeat sign-in, and a
   throw when `identityToken` is null. Everything else needs a real device.
3. CNG idempotency: run `bunx expo prebuild --platform ios --clean && (cd ios && pod install)`
   twice in a row; the second run must leave `git status` clean under `apps/native/ios/`.
   Then `bun run --cwd apps/native ios` must still build, and the `VISP Watch` scheme must
   still be selectable in the reopened workspace.
4. On a physical iPhone (`bun run --cwd apps/native ios`), against a server running the new
   `socialProviders.apple`:
   - Tap the Apple button → native sheet with Face ID → app lands on the destination editor
     and auto-provisions a relay path. Confirm the `account` row in Postgres has
     `provider_id = 'apple'`.
   - Settings → Account shows the name captured on that first sign-in.
   - Sign out, sign in with Apple again → same user id, no duplicate row, name still present.
   - Settings → Chat → link Twitch → the browser flow still completes and the session survives
     (this is the "authenticate to streaming platforms after signing in" path).
   - Cancel the Apple sheet → no error text on screen.
   - Choose "Hide My Email" on a fresh Apple ID → a separate user with a
     `@privaterelay.appleid.com` address, not a link into an existing account.
   - Settings → Account → Delete account → confirm → signed out, and the `user` row plus its
     relay paths are gone.
5. Regression: Twitch, Google, and Kick sign-in still work on the same build (the Expo plugin's
   redirect branch is shared code), and SRT publishing still goes live — that is the real check
   that the prebuild did not disturb the HaishinKit linkage.

## Deliberately out of scope

- Apple sign-in on `apps/web` and Android — not required by Apple, and it would pull in the
  Services ID plus rotating `.p8` client secret. Consequence to accept: an Apple-only account
  cannot sign in to the web dashboard until the user links Twitch or Google from settings.
- `@react-native-google-signin/google-signin` in `apps/native/package.json` is installed but
  imported nowhere; it drags `RNGoogleSignin`/`AppOAuth` pods into every iOS build and
  `DEVELOPMENT.md:125` describes it as active when it is not. Worth deleting, but it is a
  separate change and the prebuild here would otherwise be doing two jobs at once.
