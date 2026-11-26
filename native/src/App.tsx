import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { createBridgeHost, type BridgeHost } from "@/lib/native-bridge-host";
import { NATIVE_SHELL_UA_TOKEN } from "@/lib/native-shell";
import { COLOR } from "@/lib/design-tokens";
import type { BridgeLocationFix, HostMessage } from "@/lib/native-bridge-protocol";
import { bootstrapSource, deliverySource } from "./bootstrap";
import { createCapabilities } from "./capabilities";

/**
 * The shell. One WebView over the live site, plus the bridge that gives it the hardware.
 *
 * Phase 2 of NATIVE-REBUILD-PLAN.md: this is deliberately NOT a port. The native binary contains
 * no app logic -- all ~68k lines of app/ and lib/ are still server-rendered Next.js, exactly as
 * under Capacitor. What changes is that the shell is now ours, so Phase 3 can replace one screen
 * at a time with native views while every screen that is not ported keeps rendering here.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as { webUrl?: string; allowDevelopmentOrigin?: boolean };
const WEB_URL = extra.webUrl ?? "https://aquarunner247.com";
const ALLOW_DEVELOPMENT_ORIGIN = extra.allowDevelopmentOrigin === true;
const SHELL_VERSION = Constants.expoConfig?.version ?? "0";

/**
 * Where the shell goes when the first load fails.
 *
 * /field is the one route in the app that a service worker is allowed to cache, because it is the
 * one route built to carry no identity -- the root layout renders the signed-in user's name and
 * their organization's name into every other document (see Phase 1d). So it is also the only
 * route that can answer a cold start with no network, and sending a failed launch here is the
 * difference between a technician in a dead zone seeing their day and seeing a browser error.
 */
const OFFLINE_FALLBACK_URL = `${WEB_URL}/field`;

/** The screens a back press should minimize from rather than navigate past is the PAGE's
 * decision (app/components/android-back-button.tsx). The shell only decides what happens before
 * the page is able to answer. */
void SplashScreen.preventAutoHideAsync();

export function App() {
  /**
   * `WebView<object>`, not `WebView`.
   *
   * The class is declared `WebView<P = undefined> extends Component<WebViewProps & P>`, and
   * `WebViewProps & undefined` collapses to `never` -- so a plain `useRef<WebView>` pins the
   * default and every prop on the element below becomes "not assignable to never". Upstream bug,
   * fixed in react-native-webview 17 by defaulting P to `{}`
   * (react-native-webview#3977); this workaround goes away when Expo's pinned version passes it.
   */
  const webviewRef = useRef<WebView<object>>(null);
  const hostRef = useRef<BridgeHost | null>(null);
  const currentUrlRef = useRef(WEB_URL);
  const canGoBackRef = useRef(false);
  /** Whether the page has loaded far enough to answer a back press itself. */
  const pageReadyRef = useRef(false);
  const [uri, setUri] = useState(WEB_URL);
  /** Bumped to force a fresh WebView. A WebView sitting on a failed load does not reliably
   * re-navigate when `source` changes -- it keeps rendering its error state -- so remounting is
   * what actually makes a retry retry. There is no history to lose on a load that failed. */
  const [attempt, setAttempt] = useState(0);
  const triedOfflineFallbackRef = useRef(false);

  const send = useCallback((message: HostMessage) => {
    webviewRef.current?.injectJavaScript(deliverySource(message));
  }, []);

  const capabilities = useMemo(
    () =>
      createCapabilities({
        emitFix: (watchIds: string[], fix: BridgeLocationFix) => {
          for (const watchId of watchIds) hostRef.current?.emit("location.fix", fix, watchId);
        },
        emitError: (watchIds, failure) => {
          for (const watchId of watchIds) hostRef.current?.emit("location.error", failure, watchId);
        },
      }),
    [],
  );

  const host = useMemo(
    () =>
      createBridgeHost({
        capabilities,
        // Read per message, not captured once: the technician navigates, and a trust decision
        // made at startup would outlive the page it was made about.
        currentUrl: () => currentUrlRef.current,
        allowDevelopment: ALLOW_DEVELOPMENT_ORIGIN,
        send,
        onRefusal: (reason, detail) => {
          // Visible in `adb logcat`/Xcode and nowhere else. A refusal is not the page's business
          // beyond the error it already gets, but somebody has to be able to see it happen.
          console.warn(`[aq-bridge] refused (${reason}): ${detail}`);
        },
      }),
    [capabilities, send],
  );
  hostRef.current = host;

  /**
   * The hardware back button.
   *
   * Always consumed (`true`), because Android's default at the root Activity is to FINISH it --
   * which quits the app and loses an unsaved reading. The page decides what a press means and
   * answers with either history.back() or app.minimize.
   *
   * Before the page can answer -- a cold start, or a load that failed -- minimizing is the
   * fallback. A dead back button on a white screen is the one outcome worth ruling out, and
   * replaying the press later instead would navigate the app in response to something the
   * technician did before the screen existed.
   */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!pageReadyRef.current) {
        void capabilities.minimizeApp();
        return true;
      }
      hostRef.current?.emit("app.backButton", { canGoBack: canGoBackRef.current });
      return true;
    });
    return () => subscription.remove();
  }, [capabilities]);

  const onNavigationStateChange = useCallback((navigation: WebViewNavigation) => {
    currentUrlRef.current = navigation.url;
    canGoBackRef.current = navigation.canGoBack;
  }, []);

  /**
   * Keep the WebView on our own site and hand everything else to the system browser.
   *
   * This is the first of the two origin controls; lib/native-bridge-host.ts's trust check is the
   * second. A tap on a directions link, the OpenStreetMap attribution or a Stripe page must leave
   * the app rather than render inside it -- rendering it in-app would put a third party's page
   * behind the same WebView that holds the camera and GPS bridge, and App Store review treats an
   * in-app browser chrome-less window around a payment page as its own problem.
   */
  const onShouldStartLoadWithRequest = useCallback((request: { url: string; isTopFrame?: boolean }) => {
    if (request.isTopFrame === false) return true;
    let sameOrigin = false;
    try {
      sameOrigin = new URL(request.url).origin === new URL(WEB_URL).origin;
    } catch {
      sameOrigin = false;
    }
    // about:blank and the data: URLs the WebView uses internally have no origin and must stay.
    if (request.url.startsWith("about:") || request.url.startsWith("data:")) return true;
    if (sameOrigin) return true;
    void Linking.openURL(request.url).catch(() => {});
    return false;
  }, []);

  const onLoadEnd = useCallback(() => {
    pageReadyRef.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  /**
   * A failed load gets one attempt at the offline shell, and only one.
   *
   * Once, not on every error: if /field is unreachable too -- a device that has never been there
   * with signal, so the service worker never cached it -- retrying would loop on a screen the
   * technician cannot leave.
   */
  const onError = useCallback(() => {
    if (triedOfflineFallbackRef.current) return;
    triedOfflineFallbackRef.current = true;
    pageReadyRef.current = false;
    setUri(OFFLINE_FALLBACK_URL);
    setAttempt((n) => n + 1);
  }, []);

  /** Start over from the real site. The technician has presumably driven out of the dead zone. */
  const retry = useCallback(() => {
    triedOfflineFallbackRef.current = false;
    pageReadyRef.current = false;
    setUri(WEB_URL);
    setAttempt((n) => n + 1);
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    /**
     * SafeAreaView, not a bare View.
     *
     * Android 15 forces edge-to-edge and Expo SDK 54 dropped the opt-out, so there is no status
     * bar colour to set any more -- without insets the page renders UNDER the status bar and the
     * gesture bar, which on a technician screen means the top of a form behind the clock and the
     * bottom button behind the navigation pill.
     */
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        {/* Light content, for the app's navy chrome underneath. */}
        <StatusBar style="light" />
        <WebView
          key={attempt}
          ref={webviewRef}
          source={{ uri }}
          style={styles.webview}
          // Appended to the stock WebView agent, which is what lib/native-shell.ts matches on to
          // know a request came from the app rather than a browser. MUST stay in step with that
          // module -- it is imported here rather than retyped so it cannot drift.
          applicationNameForUserAgent={NATIVE_SHELL_UA_TOKEN}
          injectedJavaScriptBeforeContentLoaded={bootstrapSource({
            platform: Platform.OS === "ios" ? "ios" : "android",
            shellVersion: SHELL_VERSION,
          })}
          // On every navigation, not just the first: the site is a multi-page app and a
          // server-rendered navigation replaces the whole document, taking the global with it.
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onMessage={(event) => void host.handleMessage(event.nativeEvent.data)}
          onNavigationStateChange={onNavigationStateChange}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onLoadEnd={onLoadEnd}
          onError={onError}
          renderError={() => <OfflineNotice onRetry={retry} />}
          // Supabase auth is cookie-based and the offline shell is IndexedDB plus a service worker,
          // so all three have to survive. sharedCookiesEnabled is iOS's; the rest are Android's.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          // The page never uses getUserMedia or the web geolocation API inside the app -- both go
          // through the bridge to the OS instead -- so the WebView is not granted either.
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
          // Pull-to-refresh is off: a technician mid-form who overscrolls must not lose the form.
          pullToRefreshEnabled={false}
          setSupportMultipleWindows={false}
          originWhitelist={[new URL(WEB_URL).origin]}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/**
 * What a technician sees when the app cannot reach the site AND the offline shell is not on the
 * device either -- a phone that has never opened Field mode with signal, so the service worker
 * never cached it.
 *
 * It exists because the alternative is react-native-webview's own error view, which reads
 * "Error loading page / Error Code: -6 / net::ERR_CONNECTION_REFUSED" and offers nothing to tap.
 * That is a dead end in a pump room, and it is the screen somebody photographs and sends to
 * support. Measured on the emulator before this was added, not imagined.
 */
function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>No connection</Text>
      <Text style={styles.noticeBody}>
        Your phone can&rsquo;t reach AquaRunner right now. Readings and photos you have already saved are
        still on the device and will sync when you have signal again.
      </Text>
      <Text style={styles.noticeBody}>
        Open Field mode once while you have signal and this screen will show your day instead, with no
        connection at all.
      </Text>
      <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
        <Text style={styles.retryLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

/**
 * Colours come from lib/design-tokens.ts, the same module Tailwind and the email templates read.
 * DESIGN-SYSTEM.md's rule against inlining a hex is not a web-only rule -- a fourth copy of the
 * palette here would drift exactly the way the three before it did.
 */
const styles = StyleSheet.create({
  // Matches the near-white splash and the page's own background, so there is no flash of another
  // colour between the two.
  root: { flex: 1, backgroundColor: COLOR.warmFoam },
  webview: { flex: 1 },

  notice: {
    // Absolutely filled and opaque, not `flex: 1`. react-native-webview renders this ALONGSIDE
    // the WebView rather than instead of it, so with flex the technician got Chromium's own
    // "Webpage not available / net::ERR_CONNECTION_REFUSED" page stacked above this one.
    // Measured on the emulator -- it is the first thing the screenshot showed.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: COLOR.warmFoam,
  },
  noticeTitle: { fontSize: 22, fontWeight: "700", color: COLOR.ink },
  // Ink, not muted: this is read in direct Nevada sun, and DESIGN-SYSTEM.md makes outdoor
  // legibility a functional requirement rather than a preference.
  noticeBody: { fontSize: 16, lineHeight: 24, color: COLOR.ink },
  retry: {
    marginTop: 12,
    // 44 is the minimum touch target for anything a technician taps while working.
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: COLOR.cta,
  },
  // Navy on coral is 4.8:1; white on coral is 3.0:1 and fails AA. That is the whole reason
  // ctaText exists as its own token.
  retryLabel: { fontSize: 16, fontWeight: "600", color: COLOR.ctaText },
});
