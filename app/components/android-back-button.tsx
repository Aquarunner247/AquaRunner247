"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/**
 * The three screens a back press should minimize from rather than try to navigate past: the
 * marketing homepage, and the signed-in landing page for each kind of account (technician/admin,
 * customer portal). Checked as exact paths, not prefixes -- "/dashboard/schedule" still has
 * "/dashboard" to go back to.
 */
const HOME_PATHS = new Set(["/", "/dashboard", "/portal"]);

/**
 * Makes Android's hardware/gesture back action navigate the web app instead of closing it.
 *
 * MainActivity is a bare `BridgeActivity` with no `onBackPressed` override, so without this,
 * every back press -- on any screen, regardless of the "Back to ..." links some pages have --
 * finishes the Activity and the app just quits. @capacitor/app installs an
 * `OnBackPressedCallback` that intercepts the press, but only acts on its own (calling the
 * WebView's native goBack()) when nothing is listening for the `backButton` event; once a
 * listener is registered, as here, it's on that listener to decide what happens, and doing
 * nothing would make back a dead button at the end of history instead of a working one.
 *
 * `window.history.back()` rather than reaching for the WebView's native history directly: Next's
 * router pushes to the same `history` the WebView tracks, so this mirrors what tapping a browser
 * back button would do.
 *
 * The event's own `canGoBack` is NOT trusted at the marketing homepage ("/"), even though it's
 * the very first page the WebView ever loads. On a real device it still comes back `true`
 * there -- Android WebView appears to seed the history list with an entry (effectively
 * `about:blank`) before the first real navigation, so `goBack()` lands somewhere invisible that
 * the app then redirects straight back from, which looks like the back press did nothing at all.
 * Cheaper than relying on WebView history semantics: minimize outright at a known "home" screen
 * (`HOME_PATHS`) regardless of what `canGoBack` claims, since there's never a meaningful
 * in-app "back" from one of these anyway.
 *
 * `minimizeApp()` rather than `exitApp()`: a technician can easily be mid-visit with an unsaved
 * reading, and `exitApp()` tears the Activity down, forcing a full reload next launch.
 * Minimizing matches pressing Home and keeps that state alive in the background.
 */
export function AndroidBackButton() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;

    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && !HOME_PATHS.has(pathnameRef.current)) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
