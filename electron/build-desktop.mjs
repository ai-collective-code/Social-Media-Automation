import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

/**
 * Assembles everything the installer ships, into `release-resources/`.
 *
 * Run after `next build`. Kept as a script rather than an electron-builder
 * config because two of the steps are judgement calls that a declarative file
 * copy would get wrong:
 *
 *   - Next's standalone output includes the whole project directory, which
 *     here means the developer's own `data/` records and 50MB of generated
 *     media. Shipping those would hand every colleague a copy of one person's
 *     brands and reels. They are removed deliberately.
 *   - API keys are read from `.env.local` at build time and written into the
 *     bundle. They are never committed and never appear in source; this is the
 *     only point at which they are handled.
 */

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const out = path.join(web, "release-resources");

const rm = (p) => fs.rm(p, { recursive: true, force: true });

async function copyDir(from, to, skip = () => false) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (skip(src, entry)) continue;
    if (entry.isDirectory()) await copyDir(src, dest, skip);
    else if (entry.isFile()) await fs.copyFile(src, dest);
  }
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else if (entry.isFile()) total += (await fs.stat(p)).size;
  }
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

async function main() {
  const standalone = path.join(web, ".next", "standalone");
  try {
    await fs.access(path.join(standalone, "server.js"));
  } catch {
    throw new Error("No standalone build found. Run `npm run build` first.");
  }

  await rm(out);
  const server = path.join(out, "app-server");

  // Everything the server does not execute at runtime is left behind: source,
  // configs, docs, and — critically — the developer's own data and media.
  const EXCLUDE = new Set([
    "data",
    "src",
    "electron",
    "release-resources",
    "tsconfig.json",
    "tsconfig.tsbuildinfo",
    "eslint.config.mjs",
    "postcss.config.mjs",
    "package-lock.json",
  ]);

  await copyDir(standalone, server, (src, entry) => {
    const rel = path.relative(standalone, src);
    if (EXCLUDE.has(rel)) return true;
    // Generated media belongs to whoever generated it, not to the installer.
    if (rel === path.join("public", "generated")) return true;
    if (entry.isFile() && rel.endsWith(".md")) return true;
    return false;
  });

  // Next does not copy the client bundle into standalone; without this the
  // app serves HTML with no JavaScript and every page renders unstyled.
  await copyDir(path.join(web, ".next", "static"), path.join(server, ".next", "static"));

  // ffmpeg and ffprobe travel with the app — a colleague's machine has neither.
  const bin = path.join(out, "bin");
  await fs.mkdir(bin, { recursive: true });
  const ffmpegSrc = require("ffmpeg-static");
  const ffprobeSrc = require("@ffprobe-installer/ffprobe").path;
  const exe = process.platform === "win32" ? ".exe" : "";
  await fs.copyFile(ffmpegSrc, path.join(bin, `ffmpeg${exe}`));
  await fs.copyFile(ffprobeSrc, path.join(bin, `ffprobe${exe}`));

  // Configuration. Read at build time so no key is ever written into source.
  const envSource = path.join(web, ".env.local");
  let keyCount = 0;
  try {
    const raw = await fs.readFile(envSource, "utf-8");
    const kept = raw
      .split(/\r?\n/)
      .filter((line) => {
        const t = line.trim();
        return t && !t.startsWith("#") && t.includes("=") && t.split("=").slice(1).join("=").trim();
      });
    keyCount = kept.length;
    await fs.writeFile(
      path.join(out, "app.env"),
      [
        "# Bundled at build time from .env.local.",
        "# Overridden by settings.env in the user's data folder.",
        "",
        ...kept,
        "",
      ].join("\n"),
      "utf-8",
    );
  } catch {
    await fs.writeFile(
      path.join(out, "app.env"),
      "# No .env.local was present at build time.\n",
      "utf-8",
    );
  }

  console.log(`app-server  ${mb(await dirSize(server))}`);
  console.log(`bin         ${mb(await dirSize(bin))}`);
  console.log(`app.env     ${keyCount} value${keyCount === 1 ? "" : "s"} bundled`);
  console.log(`\nStaged in ${out}`);
  if (keyCount > 0) {
    console.log(
      "\nNOTE: the installer will contain live API keys. Anyone with the\n" +
        "installer can extract them. Distribute inside the company only.",
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
