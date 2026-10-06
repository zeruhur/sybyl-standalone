# Building Sybyl

All commands below are run from `app/`, unless noted otherwise. This covers building locally
for desktop, Android, and iOS, plus how that maps to the automated pipeline in
`.github/workflows/release.yml`.

## Prerequisites (all platforms)

- Node.js 20+ and npm
- Rust (via [rustup](https://rustup.rs))
- Platform toolchain for Tauri desktop builds — see the
  [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for your OS (on Windows:
  MSVC Build Tools + WebView2; on Linux: `libwebkit2gtk-4.1-dev` and friends, see `ci.yml` for
  the exact package list; on macOS: Xcode Command Line Tools)

Install JS dependencies once:

```bash
cd app
npm install
```

## Desktop (Windows / macOS / Linux)

```bash
npm run tauri dev      # run with hot reload
npm run tauri build    # produce an installer for the current OS
```

Cross-compiling desktop installers for a different OS than the one you're on isn't supported by
Tauri — that's why `release.yml` builds Windows/macOS/Linux each on their own native runner.

Disk space: ~2-3 GB (Rust toolchain + `target/` build artifacts + `node_modules`) if Rust and
Node are already installed.

## Android

### One-time setup

1. **Android SDK + NDK.** Easiest path: install Android Studio once, which installs the SDK; then
   install a specific NDK version via Android Studio's SDK Manager → SDK Tools → NDK (Side by
   side), or via `sdkmanager --install "ndk;27.0.12077973"`. (The release workflow pins the same
   NDK version via `nttld/setup-ndk`; keep them in sync if you bump it.)
2. **JDK 17+.** Android's Gradle tooling requires it — a JDK 8 install elsewhere on the machine
   won't work. [Eclipse Temurin](https://adoptium.net/) is a good source.
3. **Rust Android targets:**

   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

4. **Environment variables** (set for the shell you build from):

   ```bash
   export ANDROID_HOME="<path to Android SDK>"
   export ANDROID_SDK_ROOT="$ANDROID_HOME"
   export NDK_HOME="$ANDROID_HOME/ndk/<version>"
   export JAVA_HOME="<path to JDK 17+>"
   ```

5. **Windows only — enable Developer Mode.** Tauri's Android build symlinks the compiled
   `.so` into the generated Gradle project's `jniLibs` folder. Creating symlinks on Windows
   requires Developer Mode (Settings → Privacy & security → For developers → Developer Mode:
   On, or `start ms-settings:developers`). Without it, the build fails at the very last step with:

   ```
   failed to build Android app: Failed to create a symbolic link from ...
   Creation symbolic link is not allowed for this system.
   ```

   This bit us on a real Windows dev machine — the Rust cross-compile for all 4 ABIs (~7 minutes
   the first time, cached after) succeeds fine, then packaging fails right at the end if
   Developer Mode is off. No reboot needed, but restart the terminal/IDE afterward so the new
   privilege takes effect.

### Build

```bash
cd app
npm run tauri -- android init    # first time only; generates src-tauri/gen/android
npm run tauri -- icon src-tauri/icons/icon.png   # see note below
npm run tauri -- android build
```

`android init` scaffolds the Gradle project with **Tauri's own default launcher icon**, not ours
— the app installs with the generic Tauri logo unless you re-run `tauri icon` afterward to
overwrite `gen/android`'s `mipmap-*/ic_launcher*.png` with the real one. Re-run it any time you
regenerate `gen/android` from scratch (it's gitignored, so that's every fresh clone and every CI
run — `release.yml` runs this same step).

Outputs:

- APK: `app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`
- AAB: `app/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

Without a configured keystore, both are **unsigned** — Android will refuse to install an unsigned
APK, even for local testing.

### Signing for local testing

Generate a throwaway test keystore once, then sign the built APK:

```bash
keytool -genkeypair -v \
  -keystore src-tauri/gen/android/sybyl-test.jks \
  -alias sybyl-test -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <password> -keypass <password> \
  -dname "CN=Sybyl Test, OU=Test, O=Sybyl, L=Test, S=Test, C=US"

"$ANDROID_HOME/build-tools/<version>/apksigner" sign \
  --ks src-tauri/gen/android/sybyl-test.jks \
  --ks-pass pass:<password> --key-pass pass:<password> \
  src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

Then install on a USB-connected device with USB debugging enabled:

```bash
adb install <path-to-signed-apk>
```

(Or copy the signed APK to the device manually and allow "install unknown apps" for whatever app
opens it.)

For a **real** signed release, the release workflow signs the Android outputs itself once four
repository secrets are set:

```bash
keytool -genkeypair -v -keystore sybyl-release.jks -alias sybyl -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 sybyl-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS        # e.g. sybyl
gh secret set ANDROID_KEY_PASSWORD
```

Keep the `.jks` and its password backed up outside the repo. Android only accepts an update
signed with the same key, so losing it means installed copies can never be updated.

The workflow signs *after* the Gradle build (`zipalign` + `apksigner` for the APK, `jarsigner`
for the AAB) rather than through Gradle. `tauri android init` regenerates the Gradle project on
every CI run, and the generated `build.gradle.kts` has no signing config, so a
`keystore.properties` file on its own is never read. The signed files are uploaded as
`Sybyl_<version>_android.apk`/`.aab`. Without the secrets, the unsigned outputs are uploaded
instead.

Disk space: ~8-12 GB from a clean machine (SDK + NDK + Gradle caches + Rust android targets +
build artifacts); ~2-4 GB on top of an existing Android Studio install.

## iOS

Requires macOS with Xcode installed. Not verified against a live build in this repo yet — this
section is the intended path, following [Tauri's iOS guide](https://tauri.app/distribute/sign/ios/).

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
cd app
npm run tauri -- ios init     # first time only; generates src-tauri/gen/apple
npm run tauri -- icon src-tauri/icons/icon.png   # same default-icon caveat as Android, see above
npm run tauri -- ios build --target aarch64-sim   # simulator build, no signing needed
```

A device-installable or App Store build needs an Apple Developer Program membership, a
distribution certificate, and a provisioning profile — see the release workflow's "iOS signing"
secrets for what to configure (`APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_PROVISIONING_PROFILE_BASE64`, `APPLE_TEAM_ID`). Without those, the CI job falls back to a
simulator-only build, since there is no way to produce a device-installable unsigned `.ipa`.

## Automated releases

Pushing a tag matching `v*` runs `.github/workflows/release.yml`, which builds all of the above
(Windows/macOS/Linux/Android/iOS) on GitHub-hosted runners and attaches the artifacts to a
GitHub Release. See the comment block at the top of that file for the full list of secrets it
reads.

### Releasing

Every release needs a section in [`CHANGELOG.md`](../CHANGELOG.md). Its text becomes the GitHub
release description, with GitHub's generated list of commits appended after it. The workflow
stops before building anything if the section is missing.

1. While working, note user-facing changes under `## Unreleased` in `CHANGELOG.md` (Added /
   Changed / Fixed / Internal).
2. To release, rename that heading to `## vX.Y.Z - YYYY-MM-DD`, and start a new empty
   `## Unreleased` above it.
3. Bump the version in `app/package.json`, `app/package-lock.json` (two places),
   `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml` and `app/src-tauri/Cargo.lock`
   (the `Sybyl` package).
4. Commit, merge to `main`, then tag and push: `git tag -a vX.Y.Z -m vX.Y.Z` and
   `git push origin main vX.Y.Z`.

To preview a release description locally: `bash .github/scripts/changelog-section.sh vX.Y.Z`.

Two GitHub Actions expression gotchas hit while writing that workflow, worth remembering if you
touch it again:

- **Dot-notation breaks on hyphenated output names.** `steps.ndk.outputs.ndk-path` parses as
  subtraction, not property access — use bracket notation: `steps.ndk.outputs['ndk-path']`.
- **The `secrets` context cannot be referenced directly inside an `if:` condition**, at job or
  step level. Route it through an `env:` value first (`env: FOO: ${{ secrets.FOO != '' }}`), then
  check `env.FOO` in the `if:`.

Both are silent at the YAML-syntax level — generic YAML parsers accept the file fine. GitHub only
surfaces them as "workflow file issue" with zero jobs scheduled, or via
`gh workflow run <file> --ref <branch>`, which returns the actual parse error inline.
