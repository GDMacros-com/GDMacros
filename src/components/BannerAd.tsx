"use client";

import { useAdvertisingChoice } from "./AdvertisingPreferences";

const bannerUnits = {
  "300x250": { width: 300, height: 250, key: "40ee6b5689f7e7c0c786ea0a7929d1ba" },
  "160x600": { width: 160, height: 600, key: "79a65f15f45e41f834389f765355f998" },
  "320x50": { width: 320, height: 50, key: "f05a13c90851214c3e5504c716269b3a" },
} as const;

type BannerSize = keyof typeof bannerUnits;

// Each slot gets its own document so the provider's global options stay local to it.
function bannerDocument(size: BannerSize) {
  const { key, height, width } = bannerUnits[size];
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>Advertisement</title></head>
<body style="margin:0;background:transparent">
<script>
  atOptions = {
    key: '${key}',
    format: 'iframe',
    height: ${height},
    width: ${width},
    params: {}
  };
</script>
<script data-cfasync="false" src="https://bauval.org/22/${key}"></script>
</body>
</html>`;
}

export default function BannerAd({ size = "300x250", className = "col-span-full my-3" }: { size?: BannerSize; className?: string }) {
  const choice = useAdvertisingChoice();
  if (choice !== "allowed") return null;
  const { height, width } = bannerUnits[size];

  return (
    <aside aria-label="Advertisement" className={`hidden text-center min-[300px]:block ${className}`}>
      <p className="mb-2 text-[11px] font-medium tracking-wide text-muted">Advertisement</p>
      <div className="grid justify-center">
        <iframe
          title="Advertisement banner"
          width={width}
          height={height}
          loading="lazy"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          srcDoc={bannerDocument(size)}
          className="block rounded-lg border-0 bg-transparent [color-scheme:light]"
        />
      </div>
    </aside>
  );
}
