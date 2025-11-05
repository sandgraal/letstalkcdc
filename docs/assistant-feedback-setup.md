# Assistant Feedback Collection Setup

This runbook provisions the Appwrite collection required by the Lightweight Assistant Mode. Follow these steps in your target environment before enabling the assistant in production.

## 1. Confirm project context

1. Sign in to your Appwrite console.
2. Select the project that will receive assistant feedback.
3. Identify the database ID you plan to use. The exported manifest assumes a database ID of `main`; adjust the steps below if your project uses a different name.

## 2. Create the `assistant_feedback` collection

1. Navigate to **Database → Collections → Create collection**.
2. Choose **Custom ID** and enter `assistant_feedback` so it matches the value referenced in `appwrite.collections.json` and the front-end configuration.
3. Enable **Document security** so per-document permissions can be tuned later if required.
4. Leave the collection otherwise enabled and save it.

## 3. Add attributes

Add the following attributes to mirror the payload produced by `src/js/assistant.js`:

| Key       | Type     | Required | Array | Notes                                 |
|-----------|----------|----------|-------|---------------------------------------|
| `question`| String   | Yes      | No    | Length 512 is sufficient for prompts. |
| `intentId`| String   | No       | No    | Length 128; stores the matched intent.|
| `helpful` | Boolean  | Yes      | No    | Captures 👍/👎 feedback.              |
| `ts`      | Datetime | Yes      | No    | ISO timestamp captured in the browser.|

When adding the string attributes, set the maximum length to the values listed above.

## 4. Create an index

1. Open the **Indexes** tab for the collection.
2. Add a key index named `byTime` on the `ts` attribute in **Descending** order.
3. Save the index so recent entries can be queried efficiently.

## 5. Configure permissions

1. From the collection view select **Settings → Permissions**.
2. Grant **Create** access to `Any` so unauthenticated visitors can submit feedback. (If you prefer authenticated submissions, substitute your chosen role and ensure the browser establishes a session accordingly.)
3. Grant **Read**, **Update**, and **Delete** access to your administrative role or API key holders. This keeps feedback private while still allowing operational review.

## 6. Wire environment variables

Update the deployment environment with the following variables so the browser SDK can locate the collection:

- `APPWRITE_ENDPOINT` – HTTPS endpoint of your Appwrite instance
- `APPWRITE_PROJECT` – Project ID from the console
- `APPWRITE_DB_ID` – Database ID (e.g., `main`)
- `COL_ASSISTANT_ID` – `assistant_feedback`

Rebuild and redeploy after setting the variables. At runtime, open the site, trigger the assistant, and submit feedback to verify that the document appears in Appwrite.

## Optional: Import via manifest

If you manage infrastructure as code, you can also import the updated `appwrite.collections.json` with the Appwrite CLI:

```bash
appwrite login
appwrite projects select <PROJECT_ID>
appwrite databases import --file appwrite.collections.json
```

Refer to the [Appwrite CLI documentation](https://appwrite.io/docs/command-line) for additional flags and authentication methods.
