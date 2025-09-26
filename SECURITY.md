# Security Policy

This is a static, vendor-agnostic learning site (HTML/CSS/JS). There’s **no server, DB, or auth** in this repo. Security issues will mainly involve client-side JS, Markdown rendering, third-party libraries, and accidental secret leaks.

## Supported Versions

| Version  | Supported          |
|--------- |--------------------|
| `v0.1.x` | ✅ Active support  |


---

## Reporting a Vulnerability

**Preferred:** Use GitHub’s private reporting: **Security → Report a vulnerability** on this repo.  

Please include:
- A clear description and impact (what can an attacker do?).
- Repro steps (URLs, payloads, screenshots, PoC).
- Affected files/paths and suggested fix if known.

**SLA & disclosure**
- Triage acknowledgment: **≤ 2 business days**.
- Status updates: **weekly** until resolution.
- Target fix windows (guideline, not a contract):
  - Critical: **7 days**
  - High: **14 days**
  - Medium: **30 days**
  - Low/Informational: **90 days**
- We coordinate disclosure via a GitHub Security Advisory. Please don’t disclose publicly until a fix/mitigation is available or **30 days** have elapsed (whichever is sooner), unless we mutually agree otherwise.

_No bug bounty at this time; we credit researchers unless you request anonymity._

---

## Scope

**In scope (examples)**
- XSS or HTML injection via Markdown rendering or query params.
- Unsafe client-side Markdown → HTML (e.g., missing sanitization).
- Supply-chain issues in vendored/linked scripts under `assets/js/vendors/`.
- Leaked secrets committed to the repo (tokens, API keys, credentials).
- Insecure CSP/SRI configuration or missing integrity attributes for CDN scripts.
- Mixed content issues that downgrade security.

**Out of scope (examples)**
- Hosting provider vulnerabilities (GitHub Pages / NearlyFreeSpeech) not caused by this repo.
- DoS against the static host/CDN.
- Issues requiring repo write access (e.g., “you can XSS yourself if you edit HTML”).
- Best-effort wishlists without demonstrable security impact.

---

## Hardening Guidelines (for contributors)

- **Sanitize Markdown:** If rendering Markdown in the browser, use a sanitizer (e.g., DOMPurify) after the renderer. Disable dangerous options (HTML, iframes, inline events).
- **Content Security Policy (CSP):** Prefer headers on your host. Example baseline:
  ```text
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests
