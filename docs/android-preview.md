# Playing the early preview on a phone

The early preview (issue #64) is a plain tap screen for the game as it stands on `main`: the same view as `npm run play`, with one button per choice. It is throwaway; M3 replaces it. You can play it two ways.

## In the phone's browser

Open the GitHub Pages address of this repository (Settings → Pages shows it, normally `https://dachhack.github.io/mining/`). Nothing to install. It updates every time `main` changes.

## As an Android app

The app is a "debug" build: Android installs it like any app, but it is not from the Play Store, so the phone asks you to allow it once.

### Download it

1. On the phone, open **https://github.com/dachhack/mining/releases/tag/android-preview** (the "Android preview" pre-release).
2. Under **Assets**, tap **mining-game-preview.apk**. The browser downloads it.

The release is rebuilt every time `main` changes, so this link always has the newest build. (Each build is also kept for 30 days as an artifact of the "Android preview" workflow run on the Actions tab, but artifacts download as a zip, which a phone cannot install directly.)

### Install it

1. Open the downloaded file (from the browser's downloads, or the notification).
2. The first time, Android says that for your safety the phone is not allowed to install unknown apps from this source. Tap **Settings**, turn on **Allow from this source** for the browser you used, and go back.
3. Tap **Install**. Google Play Protect may warn that it does not recognise the app; choose **Install anyway** (the wording varies by phone).
4. Open **Mining Game** from the app drawer.

You can turn "Allow from this source" off again afterwards; it is only needed while installing.

### Update it

Download the APK again from the same link and install it over the old one. Your saved run is kept, unless the game's rules have changed so that it no longer replays; then the app says so and starts a new run.

If Android refuses with "App not installed" or a "conflicting package" message, uninstall Mining Game first and install again. This happens when the build was made on a different machine: each debug build is signed with that machine's own throwaway key, and Android only installs an update signed with the same key. (The saved run is lost on uninstall.)

## Playing

- The gauges stay at the top. Below them: what came of your last choice, the map (your layer and the ones above and below; the legend under it explains the characters), the hazards, and what ending the shift now would do.
- Each button is one choice, with its play-tool name and its AP cost in small print. "End the shift" is last.
- The run is saved on the phone after every choice and resumed when you open the game again.
- **Restart** plays the same seed again from the start. **New run** asks for a seed (a random one is filled in); the same seed always makes the same cube.
