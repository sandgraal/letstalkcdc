# Finding the Import Collections Button in Appwrite

## Current Location

You're at: **Databases** (main list)

- ✓ You can see the "playground" database

## Step 1: Enter the Database

**ACTION**: Click on the **"playground"** row in the database list

This will take you inside the database where you can see collections.

## Step 2: Look for Import Button

Once inside the "playground" database, look for one of these:

### Option A: Direct Import Button

Look at the top right corner for a button that says:

- "Import Collections"
- "Import"
- Or an icon that looks like an upload arrow ↑

### Option B: In the Actions Menu

If you don't see a direct button, look for:

- A **three-dot menu icon (⋮)** at the top right
- Or a **Settings/Options** button
- Click it to see a dropdown with "Import Collections"

### Option C: Alternative Locations

Sometimes Appwrite puts the import option:

- In the **Settings** tab (after entering the database)
- Under a **Tools** or **Actions** dropdown
- Next to the "Create Collection" button

## Step 3: Upload the File

Once you find the Import button:

1. Click it
2. A file picker will appear
3. Select: `appwrite.collections.json` from your project folder
4. Confirm the import

## If You Still Can't Find It

Appwrite might have changed the UI or your version might not have the import feature. In that case, you have two options:

### Option 1: Create Collection Manually

I can guide you through creating the "progress" collection manually with all the right fields.

### Option 2: Use Appwrite CLI

Install and use the Appwrite CLI to import collections:

```bash
# Install Appwrite CLI
npm install -g appwrite-cli

# Login to Appwrite
appwrite login

# Import collections
appwrite deploy collection --from appwrite.collections.json
```

## Next Steps

**Please try clicking on "playground" first**, then take a screenshot of what you see. That will help me guide you to the exact location of the import button!

If the import feature isn't available in your version of Appwrite, I'll help you create the `progress` collection manually (it only takes 2-3 minutes).
