const isExport = process.env.NEXT_OUTPUT === "export";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Thumbnails are mostly remote YouTube stills, and the site is fully static,
  // so skip the optimizer entirely. This also keeps `output: 'export'` viable.
  images: { unoptimized: true },

  // `eslint` was removed from next.config in Next 16: the key is now
  // unrecognised and warns on every build. It was setting ignoreDuringBuilds,
  // which suppressed a linter that no longer exists either, since `next lint`
  // was removed in the same release. Both are gone rather than left looking
  // like they still do something. There is currently NO linter configured; see
  // .claude/reference/verification.md.

  // Hides the Next.js dev-tools badge in the corner during `next dev`.
  // It never shipped in production builds, so this is a local-comfort setting only.
  devIndicators: false,

  // Vercel wants the default build; GitHub Pages needs a static export into out/.
  // The Pages workflow sets these two env vars, so neither host needs a config edit.
  output: isExport ? "export" : undefined,
  basePath: process.env.NEXT_BASE_PATH || undefined,

  // `public/.well-known/discord` has no file extension, so it would otherwise be
  // served as application/octet-stream, which makes browsers download it instead
  // of showing it. Verification crawlers generally cope either way, but text/plain
  // is what the file actually is.
  //
  // Skipped for static export, where a headers() rule has no server to run on.
  ...(isExport
    ? {}
    : {
        async headers() {
          return [
            // Vercel can generate conditional 304 responses from its CDN
            // without invoking the route. Apply public API CORS at routing
            // level too, so those responses remain readable by browser clients.
            {
              source: "/api/v1/:path*",
              headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
                { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "If-None-Match" },
                { key: "Access-Control-Expose-Headers", value: "ETag" },
                { key: "X-Content-Type-Options", value: "nosniff" },
              ],
            },
            {
              source: "/.well-known/:path*",
              headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
            },
          ];
        },
      }),
};

export default nextConfig;
