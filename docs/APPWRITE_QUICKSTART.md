# Appwrite Assistant Quickstart

GitHub sign-in and Appwrite-backed progress sync have been removed. This quickstart now focuses solely on syncing assistant feedback to Appwrite (optional).

## 1. Create an Appwrite project

1. Sign in to [Appwrite Cloud](https://cloud.appwrite.io) and create a project.
2. Create a database named `main`.
3. Import `appwrite.collections.json` and ensure the `assistant_feedback` collection exists.

## 2. Configure environment variables

Create or update `.env`:

```bash
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=<your-project-id>
APPWRITE_DB_ID=main
COL_ASSISTANT_ID=assistant_feedback
```

If any value is missing the site keeps all feedback in local storage.

## 3. Run locally

```bash
npm run dev
```

- Visit `http://localhost:8080/`
- Trigger the assistant (`Ask the Playground` button)
- Submit a thumbs-up or thumbs-down response
- Check Appwrite → Database → `assistant_feedback` for the new document

## 4. Deploy

No serverless function is required. Deploy the static site (GitHub Pages, Netlify, Vercel static, etc.) and provide the same environment variables as build-time secrets if you want feedback syncing in production.

---

Need to reset? Remove the key `assistantFeedback` from `localStorage` and reload the page.
