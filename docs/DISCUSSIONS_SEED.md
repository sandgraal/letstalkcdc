# GitHub Discussions Seeding Guide

This guide explains how to populate GitHub Discussions with starter threads to kickstart community engagement.

## Quick Start

```bash
# Generate a GitHub personal access token with 'repo' and 'discussion' scopes
# Then run:
GITHUB_TOKEN=ghp_your_token_here node scripts/seed-discussions.mjs
```

## What Gets Created

The script creates 4 pinned starter discussions:

1. **"Share your CDC stack!"** (Show and Tell)
   - Invites users to share their CDC technology stacks
   - Source databases, tools, brokers, sinks, monitoring

2. **"Your most challenging CDC bug - and how you fixed it"** (Debugging War Stories)
   - Encourages sharing war stories and lessons learned
   - Symptoms, diagnosis, root cause, fixes

3. **"Tool Requests / Future Labs - What would you like to see?"** (General)
   - Captures roadmap ideas and feature requests
   - New tutorials, labs, deep dives

4. **"Got stuck in a lab? Ask for help here!"** (Q&A)
   - General help thread for lab troubleshooting
   - Step-by-step assistance

## Prerequisites

### 1. Enable GitHub Discussions

1. Go to repository settings: https://github.com/sandgraal/letstalkcdc/settings
2. Scroll to "Features" section
3. Check the "Discussions" checkbox
4. Click "Set up discussions"

### 2. Create Discussion Categories

The script expects these categories to exist:

- **Show and Tell** (Open-ended discussion)
- **Debugging War Stories** (Open-ended discussion) or similar name containing "debug" or "war"
- **General** (Open-ended discussion)
- **Q&A** (Q&A type)

The script uses fuzzy matching, so category names don't need to be exact.

### 3. Generate GitHub Token

1. Go to https://github.com/settings/tokens/new
2. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `discussion` (Full control of discussions)
3. Generate token and copy it

## Running the Script

### Standard Usage

```bash
GITHUB_TOKEN=ghp_xxx node scripts/seed-discussions.mjs
```

### Custom Repository

```bash
GITHUB_REPOSITORY_OWNER=myorg \
GITHUB_REPOSITORY_NAME=myrepo \
GITHUB_TOKEN=ghp_xxx \
node scripts/seed-discussions.mjs
```

## Script Behavior

- **Idempotent**: Safe to run multiple times - skips existing discussions
- **Rate limiting**: Waits 1 second between API calls
- **Error handling**: Continues on errors, reports failures
- **Verbose output**: Shows progress for each discussion

## Example Output

```
🌱 GitHub Discussions Seeder

📍 Target repository: sandgraal/letstalkcdc

🔍 Fetching repository information...
✅ Repository ID: R_kgDOL1234567
📁 Available categories: Announcements, Show and Tell, Q&A, General

📝 Processing: "Share your CDC stack!"
   ✅ Created: https://github.com/sandgraal/letstalkcdc/discussions/1
   📌 Pinned

📝 Processing: "Your most challenging CDC bug - and how you fixed it"
   ✅ Created: https://github.com/sandgraal/letstalkcdc/discussions/2
   📌 Pinned

📝 Processing: "Tool Requests / Future Labs - What would you like to see?"
   ✅ Created: https://github.com/sandgraal/letstalkcdc/discussions/3
   📌 Pinned

📝 Processing: "Got stuck in a lab? Ask for help here!"
   ✅ Created: https://github.com/sandgraal/letstalkcdc/discussions/4
   📌 Pinned

==================================================
📊 Summary:
   ✅ Created: 4
   📌 Pinned: 4
   ⏭️  Skipped: 0
==================================================

🎉 Success! Visit your discussions at:
   https://github.com/sandgraal/letstalkcdc/discussions
```

## Troubleshooting

### "Category not found" Errors

**Symptom**: Script says category not found

**Solution**:

1. Check category names match what's in your repository
2. The script uses fuzzy matching, so close names should work
3. Create the missing category in GitHub Discussions settings

### "GraphQL errors" Response

**Symptom**: API returns GraphQL errors

**Solution**:

1. Verify your token has correct permissions (`repo`, `discussion`)
2. Check that Discussions are enabled for the repository
3. Ensure you're not rate limited (wait a few minutes)

### "Already exists" Behavior

**Symptom**: Script skips discussions that don't appear to exist

**Solution**:

- The search uses GitHub's API which may have indexing delays
- Check manually if the discussion exists
- Wait a few minutes for GitHub's search index to update

## Customizing Seed Topics

To modify the starter discussions:

1. Edit `scripts/seed-discussions.mjs`
2. Update the `SEED_DISCUSSIONS` array
3. Each entry needs: `title`, `body`, `category`, `pin` (boolean)

Example:

```javascript
{
  title: "Your Custom Thread Title",
  body: `Your markdown content here

**Can include:**
- Lists
- **Bold** and *italic*
- Code blocks
- Links`,
  category: "General",  // Must match a category in your repo
  pin: true             // Whether to pin the discussion
}
```

## Next Steps

After seeding:

1. **Monitor**: Check discussions regularly for new posts
2. **Engage**: Respond to questions and welcome contributors
3. **Moderate**: Follow the guidelines in [docs/COMMUNITY.md](COMMUNITY.md)
4. **Promote**: Share the discussions link on social media, docs, etc.

## Related Documentation

- [Community Engagement Guide](COMMUNITY.md) - Full moderation guidelines
- [GitHub Discussions Documentation](https://docs.github.com/en/discussions) - Official docs
