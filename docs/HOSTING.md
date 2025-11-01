# Hosting Platform Documentation

## Current Platform: GitHub Pages

This project is deployed using **GitHub Pages** with **GitHub Actions** for CI/CD. The static site is built with Eleventy and deployed automatically on every push to the `main` branch.

### Why GitHub Pages?

- **Zero cost** for public repositories
- **Built-in CI/CD** via GitHub Actions
- **Simple deployment** - no additional platform accounts needed
- **Git-based workflow** - deploy on push to main
- **Custom domain support** with free SSL/TLS
- **Version control integration** - automatic deployment from repository

### Deployment Architecture

```
GitHub Repository (main branch)
    ↓
GitHub Actions Workflow (.github/workflows/deploy.yml)
    ↓
Build Eleventy Site (npm run build)
    ↓
Deploy to GitHub Pages (_site/ directory)
```

## Setting Up GitHub Pages Deployment

### 1. Enable GitHub Pages

1. Go to repository **Settings → Pages**
2. Under "Build and deployment", select **GitHub Actions** as the source
3. The workflow will automatically trigger on the next push to `main`

### 2. Configure Environment Variables

Define these repository variables under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `SITE_HOST` | Full URL where the site is hosted | `https://sandgraal.github.io` or `https://yourdomain.com` |
| `ELEVENTY_PATH_PREFIX` | Path prefix for project pages (leave blank for user/org pages) | `/letstalkcdc` or blank |

### 3. Automatic Deployment

The site automatically rebuilds and deploys when:
- Changes are pushed to the `main` branch
- The workflow is manually triggered via Actions tab

## Serverless Function Hosting: Appwrite Progress Migration

The `migrateUser` serverless function handles migrating user progress from anonymous to authenticated sessions. Since GitHub Pages only serves static content, the serverless function requires a separate hosting solution.

### Recommended Options

#### Option 1: Vercel Serverless Functions (Recommended)

**Pros:**
- Free tier includes serverless functions
- Simple API route deployment
- Automatic HTTPS and edge network
- Environment variable support
- Zero-config deployment

**Setup:**
1. Create a Vercel account and connect your GitHub repository
2. Move `netlify/functions/migrateUser.js` to `api/migrateUser.js`
3. Configure environment variables in Vercel dashboard:
   - `APPWRITE_ENDPOINT`
   - `APPWRITE_PROJECT`
   - `APPWRITE_API_KEY`
   - `APPWRITE_DB_ID`
   - `COL_PROGRESS_ID`
   - `COL_EVENTS_ID`
4. Update `scripts/progress.js` to use Vercel endpoint: `/api/migrateUser`
5. Configure CORS to allow requests from GitHub Pages domain

#### Option 2: Cloudflare Workers

**Pros:**
- Generous free tier (100,000 requests/day)
- Global edge network
- Fast cold starts
- Supports Web Standards API (Fetch API)

**Setup:**
1. Create Cloudflare account
2. Install Wrangler CLI: `npm install -g wrangler`
3. Adapt `migrateUser.js` for Cloudflare Workers format
4. Deploy: `wrangler publish`
5. Configure environment variables in Cloudflare dashboard
6. Update `scripts/progress.js` with Worker URL

#### Option 3: AWS Lambda with API Gateway

**Pros:**
- Industry standard
- Flexible configuration
- Generous free tier (1M requests/month)

**Setup:**
1. Create AWS account
2. Use AWS SAM or Serverless Framework
3. Deploy function and API Gateway endpoint
4. Configure environment variables in AWS Console
5. Update `scripts/progress.js` with API Gateway URL

#### Option 4: Keep on Netlify (Hybrid Approach)

**Pros:**
- Netlify configuration already exists
- Serverless functions natively supported
- Simple environment variable management

**Setup:**
1. Create Netlify account
2. Configure netlify.toml to only deploy functions (not the site)
3. Set environment variables in Netlify dashboard
4. Keep GitHub Pages for static site
5. Point function endpoint to Netlify: `https://your-netlify-site.netlify.app/.netlify/functions/migrateUser`

### Current Implementation

The `migrateUser` function is currently referenced in:
- `scripts/progress.js` - calls `/.netlify/functions/migrateUser`
- `netlify/functions/migrateUser.js` - function implementation
- `netlify/functions/migrateUser.test.js` - function tests

**To migrate to a different serverless provider**, update the endpoint URL in `scripts/progress.js`.

## Environment Variables

### Static Site (GitHub Actions)

Set in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Scope | Required | Description |
|----------|-------|----------|-------------|
| `SITE_HOST` | Build | Yes | Canonical domain for the site |
| `ELEVENTY_PATH_PREFIX` | Build | No | Path prefix for subdirectory hosting |

### Serverless Function (Provider-Specific)

Set in your chosen serverless platform:

| Variable | Required | Description |
|----------|----------|-------------|
| `APPWRITE_ENDPOINT` | Yes | Appwrite API endpoint URL |
| `APPWRITE_PROJECT` | Yes | Appwrite project ID |
| `APPWRITE_API_KEY` | Yes | **Secret** - Appwrite server API key |
| `APPWRITE_DB_ID` | Yes | Appwrite database ID |
| `COL_PROGRESS_ID` | Yes | Progress collection ID |
| `COL_EVENTS_ID` | Yes | Events collection ID |

**Security Note:** Never commit `APPWRITE_API_KEY` to version control. Always use environment variables or secrets management.

## Migration from Netlify (If Needed)

If you were previously hosting on Netlify and want to fully migrate to GitHub Pages:

1. ✅ **Static Site**: Already handled by GitHub Actions workflow
2. ⚠️ **Serverless Function**: Choose one of the options above
3. 🔄 **Environment Variables**: Migrate from Netlify to chosen platform
4. 🔄 **Update Code**: Change function endpoint in `scripts/progress.js`
5. ✅ **Remove**: Delete `netlify.toml` after migration is complete

## Custom Domain Setup (Optional)

### For GitHub Pages

1. Add a `CNAME` file to the repository root with your domain
2. Configure DNS:
   - For apex domain: Add A records to GitHub's IPs
   - For subdomain: Add CNAME record pointing to `<username>.github.io`
3. Enable HTTPS in repository settings

### For Serverless Function

Configure your DNS to point to your chosen serverless provider's domain.

## Testing and Validation

Before considering the migration complete:

1. ✅ Static site builds and deploys successfully
2. ✅ All pages load correctly at the deployed URL
3. ⚠️ Serverless function responds correctly
4. ⚠️ Anonymous user progress is saved
5. ⚠️ OAuth login triggers migration successfully
6. ⚠️ Progress persists after migration

## Costs

| Component | Platform | Cost |
|-----------|----------|------|
| Static Site | GitHub Pages | Free for public repos |
| Serverless Function | Vercel (free tier) | Free (100GB bandwidth, 100 hours) |
| Serverless Function | Cloudflare Workers | Free (100k requests/day) |
| Serverless Function | AWS Lambda | Free tier (1M requests/month) |
| Serverless Function | Netlify | Free tier (125k requests/month) |

## Decision Log

**Date**: 2025-11-01

**Decision**: Continue using **GitHub Pages** for static site hosting + separate serverless provider for `migrateUser` function

**Context**: 
- Static site successfully deployed to GitHub Pages
- GitHub Actions workflow already configured
- Netlify configuration exists but not actively used for deployment
- Single serverless function needs hosting

**Considered Alternatives**:
1. **Full Netlify Hosting**: Would require migrating static site back to Netlify
2. **Full Vercel Hosting**: Would require new deployment configuration
3. **Current Hybrid Approach**: Keep working GitHub Pages setup, choose serverless provider

**Chosen Approach**: GitHub Pages (static) + Serverless Provider (function)
- Leverages existing working deployment
- Minimal migration effort
- Separation of concerns
- Freedom to choose best serverless provider

**Next Steps**:
1. Choose and document serverless function provider (Vercel recommended)
2. Update `scripts/progress.js` with correct endpoint
3. Remove or clearly mark `netlify.toml` as legacy
