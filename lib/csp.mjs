// Meta Content-Security-Policy (P17-24).
//
// GitHub Pages cannot send response headers, so the policy ships as a
// <meta http-equiv="Content-Security-Policy"> in the <head> of every page.
// base.njk emits the placeholder below; an Eleventy transform
// (eleventy.config.mjs) replaces it with the real policy once the page is
// rendered, because inline-script hashes can only be computed from the final
// HTML. A <meta> policy cannot express frame-ancestors, report-uri, report-to
// or sandbox (browsers ignore them there), so none are emitted.
import { createHash } from "node:crypto";

export const CSP_PLACEHOLDER = "__CDC_CSP__";

const META_RE =
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/i;

// Script types that are data blocks, not executed, so CSP does not govern
// them (JSON-LD is the only one the site uses).
const DATA_TYPE_RE = /^(application\/(ld\+)?json|text\/template)$/i;

// HTML-spec script tokens. A start tag is "<script" followed by whitespace,
// "/" or ">"; attributes may hold quoted ">" characters. The end tag is
// "</script" followed by whitespace, "/" or ">", then anything up to ">", so
// "</script >", "</SCRIPT\n>" and "</script/>" all close a script while
// "</scripts>" does not.
const SCRIPT_RE =
  /<script(?=[\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/script(?=[\s/>])[^>]*>/gi;

/**
 * Every inline script that the browser would execute: no src attribute and a
 * JavaScript (or module) type. Returns the exact text content of each.
 * @param {string} html
 * @returns {string[]}
 */
export function inlineScripts(html) {
  const found = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? "";
    if (DATA_TYPE_RE.test(type)) continue;
    found.push(m[2]);
  }
  return found;
}

export const sha256Source = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

const originOf = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : "";
  } catch {
    return "";
  }
};

/**
 * @param {object} o
 * @param {string[]} o.scriptHashes   'sha256-...' sources for inline scripts
 * @param {string} [o.supabaseUrl]    feedback endpoint (build variable)
 * @param {string} [o.goatcounterCode] visit-counting site code (build variable)
 * @param {boolean} [o.newsletter]    Buttondown signup enabled
 * @returns {string}
 */
export function buildCsp({
  scriptHashes = [],
  supabaseUrl = "",
  goatcounterCode = "",
  newsletter = false,
} = {}) {
  const supabase = originOf(supabaseUrl);
  const gcSite = goatcounterCode
    ? `https://${goatcounterCode}.goatcounter.com`
    : "";
  const scriptSrc = ["'self'", ...scriptHashes];
  if (gcSite) scriptSrc.push("https://gc.zgo.at");
  const connect = ["'self'", supabase, gcSite].filter(Boolean);
  const img = ["'self'", "https://img.youtube.com", gcSite].filter(Boolean);
  const form = ["'self'", newsletter ? "https://buttondown.com" : ""].filter(
    Boolean,
  );
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Styles keep 'unsafe-inline' (see docs/HOSTING.md): style
    // attributes and runtime-injected <style> cannot be hashed.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "frame-src https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${form.join(" ")}`,
  ].join("; ");
}

/**
 * Replace the placeholder in a rendered page with the real policy. Pages
 * without the placeholder are returned unchanged.
 * @param {string} html
 * @param {Parameters<typeof buildCsp>[0]} options  (scriptHashes is computed)
 */
export function applyCsp(html, options = {}) {
  if (!html.includes(CSP_PLACEHOLDER)) return html;
  const scriptHashes = [...new Set(inlineScripts(html).map(sha256Source))];
  const policy = buildCsp({ ...options, scriptHashes });
  return html.replace(CSP_PLACEHOLDER, policy);
}

/**
 * Check one built page. Returns a list of problems (empty when fine).
 * Redirect stubs (meta refresh, no scripts, no frames) are exempt.
 * @param {string} html
 * @returns {string[]}
 */
export function checkPageCsp(html) {
  const meta = META_RE.exec(html);
  if (!meta) {
    const stub =
      /http-equiv="refresh"/i.test(html) && !/<script\b|<iframe\b/i.test(html);
    return stub ? [] : ["no Content-Security-Policy meta tag"];
  }
  const problems = [];
  const policy = meta[1];
  if (policy.includes(CSP_PLACEHOLDER)) {
    problems.push("placeholder not replaced");
  }
  if (/unsafe-eval/.test(policy)) problems.push("allows unsafe-eval");
  const script = /(?:^|;\s*)script-src\s+([^;]*)/.exec(policy)?.[1] ?? "";
  if (/unsafe-inline/.test(script)) {
    problems.push("script-src allows unsafe-inline");
  }
  for (const text of inlineScripts(html)) {
    if (!script.includes(sha256Source(text))) {
      problems.push(
        `inline script not covered by a hash: ${text.trim().slice(0, 50)}`,
      );
    }
  }
  // Inline handlers are blocked by script-src (no 'unsafe-hashes'). Ignore
  // text inside code samples, where the markup is escaped anyway.
  const live = html.replace(/<(pre|code)\b[\s\S]*?<\/\1>/gi, "");
  if (/<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(live)) {
    problems.push("inline event-handler attribute");
  }
  if (/href\s*=\s*["']\s*javascript:/i.test(live)) {
    problems.push("javascript: URL");
  }
  return problems;
}
