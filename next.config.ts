import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const r2Origin = process.env.R2_ENDPOINT
  ? new URL(process.env.R2_ENDPOINT).origin
  : process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "";
// Presigned URLs may use the bucket-subdomain form.
const r2Sources = r2Origin ? `${r2Origin} https://*.r2.cloudflarestorage.com` : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${r2Sources}`.trim(),
  `media-src 'self' blob: ${r2Sources}`.trim(),
  `connect-src 'self' ${r2Sources}${dev ? " ws:" : ""}`.trim(),
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const config: NextConfig = {
  // Plain `next start` (Docker installs prod deps); standalone tracing struggles with pnpm symlinks + native binaries.
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [
    "sharp",
    "@electric-sql/pglite",
    "ffmpeg-static",
    "@ffprobe-installer/ffprobe",
    "postgres",
    "yauzl",
    "exifr",
  ],
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*", "./assets/fonts/**/*"],
  },
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/((?!_next/static|fonts|icon|manifest).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default config;
