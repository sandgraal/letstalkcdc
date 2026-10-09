# Security Policy

This is a static, vendor-agnostic learning site (HTML/CSS/JS). There’s **no server or auth** in this repo, and the only database is an optional Supabase table that receives assistant feedback. Security issues will mainly involve client-side JS, Markdown rendering, third-party libraries, and accidental secret leaks.

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
- The only browser-exposed credentials are `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (assistant feedback). The publishable key is safe to expose because row-level security limits it to `INSERT` on one table. Never put a secret or service-role key in this repo or in the browser.
- Rotate credentials immediately if a secret is accidentally exposed.

## Assistant Feedback Data

When a visitor clicks 👍 or 👎 in the assistant, their last typed question, the matched topic id, the vote and a timestamp are stored in the project's Supabase database. Rows are readable only by the maintainer in the Supabase dashboard; since 2026-10-09 a scheduled database job deletes rows older than 12 months (see the [privacy page](https://sandgraal.github.io/letstalkcdc/privacy/)). That job covers only this table. The Change Feed Playground tables (`events`, `scenarios`) have their own daily jobs that delete rows older than 30 days (a row can live up to about 31 days, and a shared scenario link stops working once its row is deleted); `events` are readable by anyone and streamed live to other playground visitors, and the playground asks visitors to use made-up data only. Visitors should not paste secrets or connection strings into the assistant.

## Key Rotation

- If a secret (such as an API key or a Supabase service-role key) is committed, generate a new key in the provider's console and update your environment variables accordingly.
- Remove the compromised key from all environments and revoke it with the provider.
- Consider using tools like `git filter-repo` to remove exposed secrets from history.

## Recent Security Update

- In October 2025, an Appwrite API key was inadvertently committed to the repository. The key was rotated and removed. Please ensure future contributions do not expose secrets.
- The Appwrite integration has since been removed from the repository (assistant feedback now uses Supabase). The maintainer deleted the Appwrite project and its API key in October 2026.
