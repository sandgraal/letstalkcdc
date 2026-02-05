# Authentication Setup Guide

This guide explains how to set up user authentication and cloud progress sync for Let's Talk CDC.

## Overview

The site now supports user authentication with cloud-synced progress tracking using Appwrite. Users can:

- Create an account with email and password
- Log in to access their progress from any device
- Have their module completion progress automatically synced to the cloud
- Merge local progress with cloud progress when logging in

## Prerequisites

1. **Appwrite Instance**: Cloud (https://cloud.appwrite.io) or self-hosted Appwrite instance
2. **Appwrite Project**: Created with database and collections imported from `appwrite.collections.json`

## Setup Instructions

### 1. Configure Appwrite Collections

Import the collections from `appwrite.collections.json` into your Appwrite database:

1. In Appwrite Console, navigate to **Databases → main**
2. Click **Import Collections**
3. Upload `appwrite.collections.json`
4. Verify these collections exist:
   - `progress` - Stores user module completion progress
   - `events` - Logs user activity and progress events
   - `assistant_feedback` - Stores AI assistant feedback (optional)

### 2. Set Collection Permissions

For authenticated user access, configure permissions for each collection:

#### Progress Collection Permissions

Navigate to **Databases → main → progress → Settings → Permissions**

Add these permissions:
- **Any authenticated user** (`role:users`)
  - ✓ Create documents
  - ✓ Read documents (only their own)
  - ✓ Update documents (only their own)
  - ✓ Delete documents (only their own)

#### Events Collection Permissions

Navigate to **Databases → main → events → Settings → Permissions**

Add these permissions:
- **Any authenticated user** (`role:users`)
  - ✓ Create documents
  - ✓ Read documents (only their own)

#### Assistant Feedback Collection Permissions

Navigate to **Databases → main → assistant_feedback → Settings → Permissions**

Add these permissions:
- **Any** (`role:any`) - Allows anonymous feedback
  - ✓ Create documents

### 3. Configure Environment Variables

Update your `.env` file with your Appwrite credentials:

```bash
# Required for authentication
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=your_project_id_here
APPWRITE_DB_ID=main

# Optional - defaults to "assistant_feedback" if not set
COL_ASSISTANT_ID=assistant_feedback
```

### 4. Deploy to Production

When deploying to GitHub Pages, set these repository variables:

1. Go to **Settings → Secrets and variables → Actions → Variables**
2. Add/update:
   - `APPWRITE_ENDPOINT`: Your Appwrite endpoint
   - `APPWRITE_PROJECT`: Your Appwrite project ID
   - `APPWRITE_DB_ID`: `main`

## User Experience

### First-Time Users

1. User visits the site → sees "Log In" button in header
2. Clicks "Log In" → modal opens with login/signup tabs
3. Clicks "Sign Up" tab → enters name, email, password
4. Submits form → account is created and user is logged in
5. Any local progress is immediately synced to cloud

### Returning Users

1. User visits the site → sees "Log In" button
2. Clicks "Log In" → enters credentials
3. Upon successful login:
   - User profile appears in header with avatar and name
   - Local progress is merged with cloud progress
   - Going forward, all progress is synced to cloud

### Logged-In Users

1. Progress bar in header shows overall completion
2. User profile button displays user avatar/name
3. Clicking profile opens menu with logout option
4. Completing modules automatically syncs to cloud
5. Can access progress from any device

### Logout

1. User clicks profile button → clicks "Log Out"
2. User is logged out (session cleared)
3. Local progress remains in browser localStorage
4. "Log In" button appears again in header

## Progressive Enhancement

The authentication system follows progressive enhancement principles:

- **Without Appwrite**: Site works fully with local storage only
- **With Appwrite, logged out**: Site works with local storage
- **With Appwrite, logged in**: Site syncs to cloud + local storage as backup

## Security Considerations

### Password Security

- Passwords are handled entirely by Appwrite
- Never stored or transmitted in plain text
- Minimum 8 characters required
- Hashed using industry-standard bcrypt

### HTTPS Required

- All authentication requests must use HTTPS in production
- Appwrite enforces HTTPS for cloud instances
- GitHub Pages automatically provides HTTPS

### Data Privacy

- User progress data is only accessible to the authenticated user
- No personal data is shared with third parties
- Users can delete their account and data through Appwrite console

### CORS Configuration

Appwrite automatically configures CORS for your project domain. For GitHub Pages:

1. In Appwrite Console, go to **Settings → Platforms**
2. Add **Web Platform**:
   - Name: `Let's Talk CDC`
   - Hostname: `yourusername.github.io` or your custom domain

## Troubleshooting

### Login Fails with "Invalid Credentials"

- Verify email and password are correct
- Check if user account exists (try "Sign Up" if new user)
- Ensure Appwrite endpoint and project ID are correct in environment variables

### Progress Not Syncing

- Check browser console for Appwrite connection errors
- Verify collections exist and have correct permissions
- Ensure user is logged in (check for profile button in header)
- Verify network connectivity to Appwrite endpoint

### "Authentication not configured" Error

- Ensure `APPWRITE_ENDPOINT` and `APPWRITE_PROJECT` are set
- Build and deploy the site with environment variables
- Check browser console for module loading errors

### User Can't Create Account

- Verify email doesn't already exist
- Check password is at least 8 characters
- Ensure Appwrite project allows user registration
- Check Appwrite console for error logs

## Testing Locally

To test authentication locally:

1. Set up `.env` file with Appwrite credentials
2. Run `npm run dev`
3. Visit `http://localhost:8080`
4. Click "Log In" and test signup/login flows
5. Open browser DevTools → Application → Local Storage to inspect data

## Migration from Local-Only Progress

Users with existing local progress don't need to do anything special:

1. When they log in for the first time, local progress is automatically merged with cloud
2. The merge takes the **union** of completed modules
3. Any modules completed locally are uploaded to cloud
4. Any modules completed on cloud are downloaded to local storage
5. Going forward, both stay in sync

## API Rate Limits

Appwrite Cloud free tier includes:

- **Requests**: 75,000/month
- **Bandwidth**: 2GB/month
- **Database**: 2GB storage

For typical usage:
- Each module completion = 2 requests (save progress + log event)
- Each login = 1 request
- Each page load = 0 requests (uses local storage primarily)

This should be sufficient for most educational use cases.

## Next Steps

1. **Enable Authentication**: Follow this guide to set up Appwrite
2. **Test Locally**: Verify authentication works in development
3. **Deploy**: Push to GitHub Pages with environment variables configured
4. **Monitor**: Check Appwrite console for usage and errors
5. **Iterate**: Gather user feedback and improve the experience

## Support

For issues related to:

- **Appwrite Setup**: Check [Appwrite Documentation](https://appwrite.io/docs)
- **Site Integration**: Open an issue on GitHub
- **General Questions**: Use GitHub Discussions
