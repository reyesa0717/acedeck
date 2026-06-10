# AceDeck

Point of Sale app for TCG card vendors. Built with React Native + Expo and the Scrydex API.

`frontend/` is the UI layer (screens, components, theme).
`backend/` is the data layer (Scrydex client, AsyncStorage, CSV import/export).

## Prerequisites

You need these installed regardless of OS:

- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- **Git** ([git-scm.com](https://git-scm.com))

For Android development:

- **Android Studio** ([developer.android.com/studio](https://developer.android.com/studio)) — install it, open it once, and let it download the default SDK + an emulator image (any Pixel running API 33 or 34 works).
- **JDK 17** — Android Studio bundles one, but if `java -version` doesn't show 17 from a terminal you'll need a separate install (see below).

For iOS development you need a Mac with Xcode. Windows can't build iOS.

## Quick start (any OS)

```
git clone <repo-url> acedeck
cd acedeck
npm install
```

Copy `.env.example` to `.env` and fill in your keys (see [Environment variables](#environment-variables) below):

- macOS / Linux: `cp .env.example .env`
- Windows PowerShell: `Copy-Item .env.example .env`
- Windows CMD: `copy .env.example .env`

Start the dev server:

```
npx expo start
```

In the terminal that opens, press:

- `a` to launch on an Android emulator (must be running already, see below)
- `s` to switch to Expo Go mode, then scan the QR code with the Expo Go app on your phone
- `i` to launch on an iOS simulator (Mac only)

## Environment variables

Edit `.env` and set the values you have. Only the Scrydex keys are required for prices to work; the others can stay as placeholders if you don't use Supabase auth or RevenueCat.

```
EXPO_PUBLIC_SCRYDEX_API_KEY=your_scrydex_api_key_here
EXPO_PUBLIC_SCRYDEX_TEAM_ID=your_scrydex_team_id_here

EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT_TO=https://your-domain.com

EXPO_PUBLIC_RC_IOS_KEY=appl_your_ios_key_here
EXPO_PUBLIC_RC_ANDROID_KEY=goog_your_android_key_here
```

Get a Scrydex key at [scrydex.com](https://scrydex.com) → sign up → dashboard → generate API key.

## Android emulator setup

### Windows

1. Install Android Studio. During first run, accept the default SDK location (usually `C:\Users\<you>\AppData\Local\Android\Sdk`).
2. In Android Studio: **More Actions → Virtual Device Manager → Create Device**. Pick a Pixel, choose an API 33 or 34 image, finish.
3. Add SDK tools to your PATH so `npx expo start` can find the emulator. In PowerShell (one-time setup):

   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   [Environment]::SetEnvironmentVariable("Path", "$env:Path;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:LOCALAPPDATA\Android\Sdk\emulator", "User")
   ```

   Close and reopen the terminal afterwards so the new PATH takes effect.

4. If `java -version` doesn't report 17, install JDK 17 from [adoptium.net](https://adoptium.net) and either set `JAVA_HOME` to the install dir or just let Android Studio's bundled JDK be picked up automatically.
5. Start the emulator from Virtual Device Manager (the play button), then run `npx expo start` and press `a`.

### macOS

```bash
brew install --cask zulu@17
brew install --cask android-studio
```

Open Android Studio once to install the SDK + create an emulator (Virtual Device Manager → Create Device).

Then add this to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
```

Run `source ~/.zshrc`, start the emulator, then `npx expo start` and press `a`.

## Running on a physical phone (easiest path)

Skip the emulator entirely:

1. Install **Expo Go** from the App Store or Play Store.
2. Run `npx expo start` on your computer.
3. In the terminal, press `s` to switch to Expo Go mode.
4. Scan the QR code:
   - iOS: use the Camera app
   - Android: use the Expo Go app's built-in scanner

Your phone and computer need to be on the same Wi-Fi network.

## Production builds

Builds use Expo Application Services (EAS) and run in the cloud, so the OS you're on doesn't matter.

```
npm install -g eas-cli
eas login
eas build:configure
```

Then:

```
npm run build:android-preview     # internal APK for testing
npm run build:ios-preview         # internal iOS build
npm run build:production          # both platforms, store-ready
```

## Common issues

**`expo: command not found`** — you skipped `npm install`, or you're in the wrong directory.

**Emulator never connects** — make sure the emulator is _running_ before you press `a`. `npx expo start` doesn't launch it for you.

**Windows: `'expo' is not recognized as an internal or external command`** — use `npx expo start` instead of `expo start`. The `npx` prefix is what runs locally-installed binaries.

**Metro bundler stuck** — stop with Ctrl+C and run `npx expo start --clear` to wipe the cache.

**Prices show as `—`** — the Scrydex API key is missing or invalid. Double-check `.env` and restart the dev server (Metro caches env vars at startup).
