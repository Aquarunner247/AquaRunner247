"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

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
 * `minimizeApp()` rather than `exitApp()` at the end of history (the admin dashboard, a
 * technician's day view): a technician can easily be mid-visit with an unsaved reading, and
 * `exitApp()` tears the Activity down, forcing a full reload next launch. Minimizing matches
 * pressing Home and keeps that state alive in the background.
 */
export function AndroidBackButton() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;

    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
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
