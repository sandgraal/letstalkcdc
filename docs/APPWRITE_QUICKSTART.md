# Quick Start: Appwrite Progress Tracking

This guide will get you up and running with the Appwrite progress tracking feature in under 15 minutes.

## Prerequisites

- Node.js and npm installed
- An Appwrite account (sign up at https://cloud.appwrite.io)
- A GitHub account (for OAuth login)

## Step 1: Create Appwrite Project

1. Log in to [Appwrite Cloud](https://cloud.appwrite.io)
2. Click "Create Project"
3. Name it "CDC Playground" (or your preference)
4. Note your **Project ID** (you'll need this)

## Step 2: Set Up Database

1. In your Appwrite project, go to **Databases**
2. Click "Create Database"
3. Name it `main`
4. Click the database to open it
5. Click "Import Collections"
6. Upload the `appwrite.collections.json` file from this repo
7. Confirm two collections are created: `progress` and `events`

## Step 3: Generate API Key

1. In Appwrite Console, go to **Settings → API Keys**
2. Click "Create API Key"
3. Name: "Server Migration Function"
4. Scopes: Check **Database → Read** and **Database → Write**
5. Copy the generated key (you won't see it again!)

## Step 4: Configure GitHub OAuth

1. Go to **GitHub Settings → Developer settings → OAuth Apps**
2. Click "New OAuth App"
3. Fill in:
   - Application name: "CDC Playground Local Dev"
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/?auth=success`
4. Click "Register application"
5. Note your **Client ID**
6. Click "Generate a new client secret"
7. Note your **Client Secret**

8. In Appwrite Console, go to **Authentication → Providers**
9. Find **GitHub** and click to configure
10. Enter your GitHub Client ID and Client Secret
11. Add these Success URLs:
    - `http://localhost:8080/?auth=success`
    - `http://localhost:8080/?auth=failed`
12. Click "Update" and ensure GitHub provider is enabled

## Step 5: Configure Environment Variables

1. In your project root, copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your actual values:

   ```bash
   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   APPWRITE_PROJECT=YOUR_PROJECT_ID_FROM_STEP_1
   APPWRITE_DB_ID=main
   COL_PROGRESS_ID=progress
   COL_EVENTS_ID=events
   APPWRITE_API_KEY=YOUR_API_KEY_FROM_STEP_3
   ```

3. Save the file

## Step 6: Run Locally

1. Install dependencies (if not already done):

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open http://localhost:8080/intro/ in your browser

## Step 7: Test the Features

### Test Anonymous Progress:

1. Open the intro page: http://localhost:8080/intro/
2. Open browser Developer Tools (F12)
3. Look for "CDCProgress" messages in console
4. Scroll through the page content
5. Check the progress toolbar (should show percentage)
6. In Appwrite Console → Databases → main → progress
7. You should see a new document with an anonymous userId

### Test GitHub Login:

1. Click "Sign in with GitHub" button in the progress toolbar
2. Authorize the app on GitHub
3. You'll be redirected back to the site
4. Progress toolbar should now say "Synced across devices"
5. Your anonymous progress is migrated to your GitHub account
6. In Appwrite Console, check that the progress document now has your GitHub user ID

### Test Progress Persistence:

1. Make some progress on the intro page (scroll, interact)
2. Note the progress percentage in the toolbar
3. Close your browser completely
4. Reopen http://localhost:8080/intro/
5. Sign in with GitHub again
6. Your progress should be restored!

### Test Resume Feature:

1. Start a journey and make 20-30% progress
2. Close the browser
3. Reopen the journey page
4. A toast notification should appear: "Resume where you left off?"
5. Click "Resume" to jump to your last position

## Troubleshooting

### "Failed to load Appwrite SDK"

- Check your internet connection
- Verify the CDN is accessible: https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js

### "OAuth login fails"

- Verify callback URLs in Appwrite match exactly
- Check GitHub OAuth app configuration
- Look for `?auth=failed` in the URL after redirect

### "Progress not saving"

- Check Appwrite Console → Databases → main → progress
- Look for permission errors in browser console
- Verify API key has database read/write permissions

### "Dashboard doesn't show"

- Dashboard only shows for authenticated users
- Sign in with GitHub first
- Check browser console for JavaScript errors

## Next Steps

Once everything works locally:

1. **Deploy to Production**: See `docs/HOSTING.md` for deployment guides
2. **Configure CI/CD**: Add secrets to GitHub Actions
3. **Deploy Serverless Function**: Choose Vercel, Cloudflare Workers, or AWS Lambda

## Resources

- [Appwrite Documentation](https://appwrite.io/docs)
- [INTEGRATION_README.md](../INTEGRATION_README.md) - Full integration guide
- [docs/HOSTING.md](HOSTING.md) - Deployment options
- [docs/appwrite-progress-login-handoff.txt](appwrite-progress-login-handoff.txt) - Implementation details

## Need Help?

Check the troubleshooting section in `docs/appwrite-progress-login-handoff.txt` for detailed debugging steps.
