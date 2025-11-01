# Hosting Platform Decision Record

**Date**: November 1, 2025  
**Status**: Accepted  
**Deciders**: Project Team

## Context

The Let's Talk CDC project requires:
1. Static site hosting (Eleventy-generated HTML/CSS/JS)
2. Serverless function hosting for `migrateUser` (Appwrite progress sync)
3. CI/CD integration
4. Environment variable management
5. Low cost for public educational project

## Decision

**Static Site**: GitHub Pages  
**Serverless Function**: User's choice (Vercel, Cloudflare Workers, AWS Lambda, or Netlify)

## Rationale

### Why GitHub Pages for Static Site?

✅ **Already Deployed**: Existing GitHub Actions workflow (`.github/workflows/deploy.yml`)  
✅ **Zero Cost**: Free for public repositories  
✅ **Native Integration**: Built into GitHub, no additional accounts needed  
✅ **Simple Workflow**: Automatic deployment on push to main  
✅ **Custom Domains**: Supported with free SSL/TLS  
✅ **Git-Based**: Version control and deployment in one place

### Why Separate Serverless Hosting?

GitHub Pages serves static content only. The `migrateUser` serverless function requires:
- Server-side execution
- Environment variable access (including secrets)
- API endpoint functionality

### Recommended Serverless Providers

1. **Vercel** (Recommended)
   - Free tier includes serverless functions
   - Simple API routes (`/api/migrateUser`)
   - Easy environment variable management
   - Automatic HTTPS

2. **Cloudflare Workers**
   - Generous free tier (100k requests/day)
   - Global edge network
   - Fast performance

3. **AWS Lambda**
   - Industry standard
   - Flexible configuration
   - 1M free requests/month

4. **Netlify** (Legacy Option)
   - Existing configuration in repository
   - Works well for hybrid deployment

## Alternatives Considered

### Full Netlify Hosting
❌ Would require reverting GitHub Pages deployment  
❌ Additional platform account required  
❌ Less integrated with GitHub workflow

### Full Vercel Hosting
❌ Would require new deployment configuration  
❌ Moving away from working GitHub Pages setup  
✅ Could be considered if GitHub Pages becomes limiting

### GitHub Actions + API Gateway
❌ Complex to set up workflow_dispatch as API  
❌ Not designed for real-time API endpoints  
❌ Would require custom implementation

## Consequences

### Positive
- Leverages existing working deployment
- Minimal migration effort required
- Separation of concerns (static vs. serverless)
- Freedom to choose best serverless provider
- Can switch serverless providers independently

### Negative
- Requires two platforms instead of one
- Need to update endpoint URL when switching providers
- Slightly more complex deployment documentation

### Neutral
- Users must choose and configure serverless provider
- Documentation needed for multiple deployment options

## Implementation

### Completed
- ✅ Documented hosting decision in `docs/HOSTING.md`
- ✅ Updated `README.md` with deployment instructions
- ✅ Updated `INTEGRATION_README.md` for serverless function deployment
- ✅ Marked `netlify.toml` as legacy/optional
- ✅ Added TODO comment in `scripts/progress.js` for endpoint update

### Required for Full Migration (If switching from Netlify)
- [ ] Choose serverless provider
- [ ] Deploy `migrateUser` function to chosen provider
- [ ] Update endpoint URL in `scripts/progress.js`
- [ ] Configure environment variables in serverless platform
- [ ] Test progress migration functionality
- [ ] Update OAuth redirect URLs in Appwrite

## Monitoring

After deployment:
- Monitor GitHub Actions workflow success rate
- Monitor serverless function error rates and latency
- Track costs (should remain zero or very low)
- Collect user feedback on deployment process

## Review

This decision should be reviewed if:
- GitHub Pages limitations are encountered
- Serverless provider costs become significant
- A single-platform solution becomes more appealing
- Project requirements change significantly

## References

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [AWS Lambda](https://aws.amazon.com/lambda/)
- [Netlify Functions](https://docs.netlify.com/functions/overview/)

## Document History

- 2025-11-01: Initial decision documented
