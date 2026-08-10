/**
 * Brand types and constants — no Node built-ins, so this is safe to import
 * from Client Components.
 *
 * `brand-store.ts` does the filesystem work and re-exports everything here.
 * Importing a runtime value (not just a type) from the store into a client
 * component pulls `fs` into the browser bundle and fails the build, which is
 * why the shared constants live in this separate module.
 */

export type Brand = {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  /** What the brand sells and how it positions itself. */
  description?: string;
  /** Who it is for. */
  audience?: string;
  /** How it should sound. */
  voice?: string;
  /** Claims, topics or words to avoid — enters every generation prompt. */
  neverSay?: string;
  /** Where the audience is, for market-scoped research and local post times. */
  markets?: string;
  /**
   * Visual things this brand never shows — enters every image prompt.
   *
   * Separate from `neverSay`, which governs words. A brand can be perfectly
   * happy to *say* "premium" while banning studio-lit product shots.
   */
  avoidVisuals?: string;
  /**
   * Fixed seed for image generation, so a brand's look stays reproducible.
   *
   * Empty means a fresh seed per image, which is what you want while
   * exploring. Pinning it makes regenerating a post return the same frame,
   * which is what you want once a look is approved.
   */
  imageSeed?: number;
  /** Language for captions, hooks and on-screen text. Defaults to English. */
  language?: string;
  /** Which platforms this brand posts on. */
  platforms?: string[];
  createdAt: string;
  updatedAt: string;
};

export type BrandInput = Omit<Brand, "id" | "createdAt" | "updatedAt">;

export const PLATFORM_OPTIONS = [
  "Instagram",
  "TikTok",
  "LinkedIn",
  "YouTube",
  "Facebook",
  "X",
] as const;
