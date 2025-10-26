# Security Policy

This is a static, vendor-agnostic learning site (HTML/CSS/JS). There’s **no server, DB, or auth** in this repo. Security issues will mainly involve client-side JS, Markdown rendering, third-party libraries, and accidental secret leaks.

## Supported Versions

| Version | Supported |
|---------|-----------|
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
- For Appwrite integration, set `APPWRITE_API_KEY`, `APPWRITE_PROJECT`, `APPWRITE_ENDPOINT`, and other IDs as environment variables. Only non-secret values should be exposed to the browser; the API key must remain server-side.
- Rotate credentials immediately if a secret is accidentally exposed.

## Key Rotation

- If a secret (such as `APPWRITE_API_KEY`) is committed, generate a new key in Appwrite and update your environment variables accordingly.
- Remove the compromised key from all environments and revoke it in Appwrite.
- Consider using tools like `git filter-repo` to remove exposed secrets from history.

## Recent Security Update

- In October 2025, an Appwrite API key was inadvertently committed to the repository. The key was rotated and removed. Please ensure future contributions do not expose secrets.
