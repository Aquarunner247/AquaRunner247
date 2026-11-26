import type { ExpoConfig } from "expo/config";

/**
 * The React Native shell's native configuration -- what the Capacitor project's
 * AndroidManifest.xml, build.gradle and Info.plist say today, restated in the one place Expo
 * generates them from.
 *
 * The native projects are NOT committed: `npm run prebuild` regenerates android/ and ios/ from
 * this file. That is deliberate while two shells exist side by side. A committed android/ here
 * would sit next to the Capacitor one at the repo root, and the first mistake anyone makes is
 * editing the wrong one -- including the automation that signs a release.
 */
const PRODUCTION_URL = "https://aquarunner247.com";

/**
 * A development build, pointed at a local `next dev`/`next start` instead of production.
 *
 * One switch, not two, so the loosened settings cannot be turned on independently: cleartext
 * HTTP and a trusted localhost origin only ever travel together, and a shipped build has
 * neither. Nothing reads this at runtime -- it decides what goes into the native project at
 * prebuild time, so a production binary has no code path to a local server at all.
 */
const ALLOW_DEVELOPMENT_ORIGIN = process.env.AQ_ALLOW_DEV_ORIGIN === "1";

const config: ExpoConfig = {
  name: "AquaRunner 24/7 Pro",
  slug: "aquarunner247-pro",
  // What a user sees. Still 1.0 -- the launch version is 1.0 however many bundles it took, same
  // reasoning as the Capacitor project's versionName.
  version: "1.0",
  orientation: "portrait",
  icon: "../public/icons/icon-512.png",
  scheme: "aquarunner247",
  userInterfaceStyle: "light",
  /**
   * COLOR.warmFoam, written out rather than imported.
   *
   * Expo evaluates this file with its own loader before Metro exists, so it cannot resolve a .ts
   * import outside node_modules -- `Cannot find module '../lib/design-tokens'`. Same situation as
   * public/sw.js, and the same answer: the literal is pinned by a drift test
   * (lib/__tests__/native-shell-config.test.ts) rather than left to be noticed by eye.
   *
   * White is also what the Capacitor build actually shows today: its splash.png is the stock
   * near-white placeholder (measured -- 99% luminance), not the #06333B in
   * public/manifest.webmanifest, which is a leftover from the retired teal palette and is not a
   * token in lib/design-tokens.ts at all.
   */
  backgroundColor: "#FFFFFF",
  assetBundlePatterns: ["**/*"],

  android: {
    /**
     * INHERITED, NOT NEW. Play has seen com.aquarunner247.pro (submitted 2026-10-31), so it is
     * permanent: a new id means a new listing and losing reviews, ratings and installs.
     *
     * The consequence to know about: two apps cannot share an applicationId on one device, so
     * this build REPLACES the Capacitor build when installed. There is no side-by-side A/B on a
     * single handset during the transition -- comparing them means two devices, or uninstalling.
     */
    package: "com.aquarunner247.pro",
    /**
     * 100, not 6.
     *
     * Play rejects a versionCode it has already seen and requires each upload to climb. The
     * Capacitor project is at 5 and will keep climbing while it is still the shipping shell, so
     * starting this one at 100 leaves 6-99 to it and makes the number itself say which shell a
     * bundle came from. Phase 4 keeps counting from here.
     */
    versionCode: 100,
    adaptiveIcon: {
      foregroundImage: "../public/icons/icon-512-maskable.png",
      backgroundColor: "#FFFFFF",
    },
    permissions: [
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      // Lets GPS auto-arrival and departure detection keep working while a tech has the app
      // backgrounded (navigating with Maps, phone locked). This is the one permission that is the
      // app's own responsibility to justify -- Play Console requires a separate "Background
      // location" disclosure for it, and the in-app disclosure the policy also requires is
      // app/components/background-location-disclosure.tsx, which gates the call that reaches it.
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      // Required at runtime on Android 13+ for ANY notification to show, including the persistent
      // "tracking your route" one the OS requires while the location foreground service runs.
      // Without it Android silently stops delivering background location.
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_LOCATION",
    ],
    /**
     * Permissions the Expo plugins contribute that THIS APP HAS NEVER ASKED FOR, removed.
     *
     * Not housekeeping. Measured against the shipping Capacitor bundle's merged manifest, which
     * declares exactly ten permissions, a plain prebuild added six more: microphone, both
     * external-storage permissions, boot-completed, display-over-other-apps and vibrate. Play
     * shows that list to users and a new entry on an existing listing is a visible change plus a
     * Data safety update -- a pool-service app that starts asking for the microphone is a
     * question from every technician who reads it, and an honest answer would be "a library we
     * added wanted it".
     *
     * Each one is removable because nothing here uses it:
     *  - RECORD_AUDIO: expo-image-picker declares it for video capture. Only stills are ever
     *    taken, through launchCameraAsync with mediaTypes ["images"].
     *  - READ/WRITE_EXTERNAL_STORAGE: the capture path returns base64 in memory and never saves
     *    to the gallery -- a compliance photo must not land in a personal camera roll. The
     *    Capacitor camera worked without these, on the same minSdk.
     *  - RECEIVE_BOOT_COMPLETED: expo-task-manager wants it so a background task resumes after a
     *    reboot. That is the opposite of wanted here: it would mean location tracking restarting
     *    on a phone nobody has opened the app on.
     *  - SYSTEM_ALERT_WINDOW, VIBRATE: neither is used, and the first is one of the permissions
     *    users are most suspicious of.
     */
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.VIBRATE",
    ],
  },

  ios: {
    bundleIdentifier: "com.aquarunner247.pro",
    buildNumber: "100",
    supportsTablet: false,
    infoPlist: {
      // The strings a reviewer reads in the permission dialogs. Each says what the app does with
      // the data, not that it would like access -- a vague purpose string is a review rejection.
      NSCameraUsageDescription:
        "AquaRunner uses the camera to photograph pool equipment and water test results for the service record.",
      NSLocationWhenInUseUsageDescription:
        "AquaRunner uses your location to log your arrival and departure at each stop on your route automatically.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "AquaRunner logs your arrival and departure at each stop even while the app is in the background, so your route is recorded without you having to open it at every pool.",
      UIBackgroundModes: ["location"],
      NSPhotoLibraryAddUsageDescription:
        "AquaRunner never saves service photos to your personal library; this is only requested by the system camera.",
    },
  },

  plugins: [
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "AquaRunner logs your arrival and departure at each stop even while the app is in the background.",
        locationWhenInUsePermission:
          "AquaRunner uses your location to log your arrival at each stop on your route automatically.",
        // Both required for the background watcher: the first adds ACCESS_BACKGROUND_LOCATION
        // handling, the second generates the foreground-service declaration the OS needs before
        // it will keep delivering fixes with the app backgrounded.
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission:
          "AquaRunner uses the camera to photograph pool equipment and water test results for the service record.",
        // Nothing here ever opens the photo library: a compliance photo log must only contain a
        // live-taken photo, which is why the capture path is launchCameraAsync and never
        // launchImageLibraryAsync. The permission string exists because the plugin writes one
        // regardless.
        photosPermission: "AquaRunner does not read your photo library.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          // minSdk and targetSdk match the Capacitor project, which derives both from
          // rootProject.ext -- targetSdk especially, because it is what opts the app into new
          // runtime behaviour and a difference there would make the two shells behave
          // differently on the same phone.
          minSdkVersion: 24,
          targetSdkVersion: 36,
          /**
           * compileSdk 37, NOT 36, and that asymmetry is deliberate.
           *
           * Expo SDK 58's own modules are compiled against android-37 and Gradle refuses to link
           * them into a project on 36 ("requires ... version 37 or later"). compileSdk only says
           * which APIs the code may reference; targetSdk above is what changes behaviour at
           * runtime. So this is the one number that has to move ahead of the Capacitor project,
           * and moving it changes nothing a technician can observe.
           */
          compileSdkVersion: 37,
          // Matching capacitor.config.ts's `cleartext: false`. A build that needs to reach a
          // local server over http is a separate build, not a loosened production one.
          usesCleartextTraffic: ALLOW_DEVELOPMENT_ORIGIN,
        },
      },
    ],
    "expo-splash-screen",
  ],

  extra: {
    /**
     * Where the WebView points. Read through expo-constants at runtime rather than hardcoded in
     * App.tsx so a development build can be pointed at `next dev` by overriding it here, and so
     * the one place it is written is beside the origin-trust decision that depends on it.
     */
     webUrl: process.env.AQ_WEB_URL ?? PRODUCTION_URL,
    /**
     * Opts the bridge into trusting a localhost origin. Defaults OFF and must stay off in
     * anything shipped: see isTrustedBridgeOrigin for why a loose origin check means any page
     * could drive a technician's phone.
     */
    allowDevelopmentOrigin: ALLOW_DEVELOPMENT_ORIGIN,
  },
};

export default config;
