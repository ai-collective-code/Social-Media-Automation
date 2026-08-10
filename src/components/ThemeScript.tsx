/**
 * Applies the saved theme to <html> synchronously, while the browser is still
 * parsing the document. Running during parse (rather than in an effect) is what
 * keeps a light-theme user from seeing a dark flash before React hydrates.
 *
 * Paired with `suppressHydrationWarning` on <html> in the root layout, since
 * this mutates the DOM before React gets a chance to compare it.
 */
export const THEME_STORAGE_KEY = "theme";

const SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
