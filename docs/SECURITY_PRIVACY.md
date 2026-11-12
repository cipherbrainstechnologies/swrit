# Security & privacy

## Access

- **No public sign-up.** Better Auth `disableSignUp`; the single owner is created by `pnpm owner:bootstrap`,
  which refuses to run once any user exists. No default credentials exist anywhere.
- Passwords hashed by Better Auth (scrypt). Minimum 12 characters.
- Sessions are stored in PostgreSQL, 14-day expiry, HttpOnly + `SameSite=Lax`, `Secure` (with `__Secure-` prefix)
  in production. *Settings → Sign out everywhere* revokes every session (lost phone). Changing the password
  signs out other devices.
- Login is rate-limited (5 attempts / 5 minutes per IP), persisted in PostgreSQL so restarts don't reset it.
  Errors are generic ("That email and password don't match"). Upload, render and export endpoints have their own
  persistent limits.
- Every page and API route checks the session **on the server** (middleware is only a convenience redirect).
  Every query is scoped to the caller's child profile: guessing another ID returns 404 (tested).
- Mutations require a same-origin `Origin` header (CSRF), plus `SameSite` cookies; Better Auth checks its own.

## Files

- Originals live in a **private** R2 bucket under random UUID keys, never in `public/`, never on Railway disks,
  never in Git. They are stored byte-for-byte (verified by test).
- Browsers never receive storage keys. `/api/media/:id/access` checks the session and ownership, then redirects to
  a signed URL for that single object, valid for 180 s (`MEDIA_SIGNED_URL_TTL_SECONDS`).
- Uploads use presigned PUT URLs bound to one random key and content type, expiring in 15 minutes. Completion
  verifies size with HEAD and the real type from magic bytes; anything else is deleted and rejected.
- Previews strip EXIF/GPS. Originals keep their metadata and are downloadable only by the authorised family.
- ZIP import defends against traversal, symlinks, bombs, nested archives and disguised files (see tests).

## Pages

- `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: private, no-store` on all pages and APIs.
- No Open Graph images; the login page shows no photos.
- CSP (`default-src 'self'`, images/media only from self, blob: and R2), `frame-ancestors 'none'`, HSTS,
  `Referrer-Policy: no-referrer`, `nosniff`.
- No analytics, no third-party scripts, no external fonts (fonts are bundled).

## What is not done (honest list)

- No TOTP/passkeys yet (optional per spec, after P0).
- CSP allows `'unsafe-inline'` scripts (Next.js inline bootstrapping); a nonce-based CSP is a later hardening.
- Time-capsule encryption is not implemented (P2); nothing claims it is.
- No AI processing of family media exists. `ENABLE_AI_CAPTIONS` is `false` and has no implementation.
- No facial recognition, geotag maps or social sharing.

## Logs

Structured JSON logs carry only identifiers and technical facts: no captions, file names, signed URLs or secrets.
The `audit_events` table records sign-ins, uploads, edits, renders and exports (no content).
