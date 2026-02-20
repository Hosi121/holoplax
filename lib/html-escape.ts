/**
 * Minimal HTML entity escaping for safe interpolation of user-controlled
 * strings into HTML email templates.
 *
 * Covers the five characters that are meaningful in HTML / attribute contexts:
 *   & → &amp;   < → &lt;   > → &gt;   " → &quot;   ' → &#39;
 *
 * Use this whenever interpolating user data (workspace names, display names,
 * etc.) into HTML strings. Does NOT sanitise for rich HTML — it is purely for
 * text nodes and attribute values.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
