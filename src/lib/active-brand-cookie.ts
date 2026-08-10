/**
 * The active-brand cookie name, in its own module with no imports.
 *
 * `active-brand.ts` reads `next/headers` and the fs-backed stores, so a Client
 * Component importing the constant from there would pull `fs` into the browser
 * bundle and fail the build — the same trap that `brand-types.ts` /
 * `run-types.ts` exist to avoid.
 */
export const ACTIVE_BRAND_COOKIE = "activeBrandId";
