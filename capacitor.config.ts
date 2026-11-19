// Capacitor wraps the web build (the `dist` folder that `npm run build`
// makes) in a native Android app. This file tells it the app's id and name
// and where the web build is. `npx cap sync android` copies `dist` into the
// Android project under android/ (issue #64, the early phone preview).
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The Android package name. It can never change once an app is on the
  // Play Store, so it was chosen by the owner.
  appId: 'com.dachhack.mininggame',
  appName: 'Mining Game',
  webDir: 'dist',
};

export default config;
