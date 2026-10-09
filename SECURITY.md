# Security Policy

This is a static, vendor-agnostic learning site (HTML/CSS/JS). There’s **no server, DB, or auth** in this repo. Security issues will mainly involve client-side JS, Markdown rendering, third-party libraries, and accidental secret leaks.

## Supported Versions

| Version  | Supported         |
| -------- | ----------------- |
| `v0.1.x` | ✅ Active support |

---

## Reporting a Vulnerability

**Preferred:** Use GitHub’s private reporting: **Security → Report a vulnerability**

Please include:

- A clear description and impact of the vulnerability.
- Steps to reproduce (URLs, payloads, screenshots, PoC).
- Proposed mitigation if available.

## Secret Management

- Never commit secrets or API keys to version control. Use environment variables in your deployment platform (Netlify, Vercel, GitHub Actions, etc.) or a local `.env` file ignored by Git.
- For the optional Supabase integration, only the project URL and the _publishable_ key (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) reach the browser; they are public by design and protected by row-level security. Never expose a `service_role`/secret key.
- Rotate credentials immediately if a secret is accidentally exposed.

## Key Rotation

- If a secret key is committed, generate a new key in the provider's dashboard and update your environment variables accordingly.
- Remove the compromised key from all environments and revoke it at the provider.
- Consider using tools like `git filter-repo` to remove exposed secrets from history.

## Recent Security Update

- In October 2025, an Appwrite API key was inadvertently committed to the repository. The key was rotated and removed. Please ensure future contributions do not expose secrets.
