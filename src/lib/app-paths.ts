import path from "path";

/**
 * Where the app reads and writes at runtime.
 *
 * In development that is the project folder, exactly as before. In the
 * packaged desktop app it can't be: the install directory (Program Files) is
 * read-only for a normal user, and `process.cwd()` for a packaged Electron
 * process isn't the app folder anyway. Electron's main process therefore
 * points these at the user's own profile directory before starting the server.
 *
 * Everything that touches disk goes through here, so there is exactly one
 * place to change if the storage location ever moves again.
 */

/** Records — the JSON files acting as the database. */
export function dataDir(): string {
  const configured = (process.env.CONTENT_ENGINE_DATA_DIR ?? "").trim();
  return configured || path.join(process.cwd(), "data");
}

/**
 * Generated media — images, reel videos, uploaded clips.
 *
 * Kept apart from `dataDir` because it is large (tens of megabytes and
 * growing) while the records are a couple of hundred kilobytes, and because
 * only this directory needs to be reachable over HTTP.
 *
 * In development it stays `public/generated`, so Next serves the files
 * statically and existing data keeps working untouched. When packaged it
 * moves to the user profile and is served by the `/generated` route instead.
 */
export function mediaDir(): string {
  const configured = (process.env.CONTENT_ENGINE_MEDIA_DIR ?? "").trim();
  return configured || path.join(process.cwd(), "public", "generated");
}

/**
 * Resolve a stored public path ("/generated/x.jpg") to a real file.
 *
 * The stored form is a URL, not a filesystem path — it has to keep working in
 * the browser — so this is the one place that translates between the two.
 * Traversal is rejected rather than sanitised: a stored path that escapes the
 * media directory means something is already wrong.
 */
export function mediaPathFor(publicPath: string): string {
  const relative = publicPath.replace(/^\/+/, "").replace(/^generated\/+/, "");
  const resolved = path.resolve(mediaDir(), relative);
  const root = path.resolve(mediaDir());
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to read outside the media directory: ${publicPath}`);
  }
  return resolved;
}
