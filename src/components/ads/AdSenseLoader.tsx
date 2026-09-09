"use client";

import { useEffect } from "react";
import { ADSENSE_CLIENT } from "@/lib/adsense";

const SCRIPT_ID = "gdm-adsense-loader";

/**
 * Adds Google's exact loader to the document head after React has hydrated.
 * Loading it earlier lets AdSense mutate <head> while React is still claiming
 * the page, which produces hydration errors. next/script is intentionally not
 * used because its data-nscript attribute is rejected by the AdSense loader.
 */
export default function AdSenseLoader() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }, []);

  return null;
}
