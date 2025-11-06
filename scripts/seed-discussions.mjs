#!/usr/bin/env node
/**
 * Seed GitHub Discussions with starter threads
 * 
 * This script creates initial discussion threads to kickstart community engagement.
 * It uses the GitHub GraphQL API to create discussions in the specified repository.
 * 
 * Prerequisites:
 * - GitHub Discussions must be enabled for the repository
 * - GITHUB_TOKEN environment variable with repo and discussion permissions
 * - Repository categories must be created (Show and Tell, Q&A, etc.)
 * 
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/seed-discussions.mjs
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'sandgraal';
const REPO_NAME = process.env.GITHUB_REPOSITORY_NAME || 'letstalkcdc';
const RATE_LIMIT_DELAY_MS = parseInt(process.env.RATE_LIMIT_DELAY_MS || '1000', 10);

// Starter discussion threads based on docs/COMMUNITY.md
const SEED_DISCUSSIONS = [
  {
    title: "Share your CDC stack!",
    body: `What tools and technologies are you using for Change Data Capture in your organization?

**Share details about:**
- Source databases (PostgreSQL, MySQL, Oracle, SQL Server, etc.)
- CDC tools (Debezium, Maxwell, Striim, Airbyte, etc.)
- Message brokers (Kafka, Pulsar, Kinesis, RabbitMQ, etc.)
- Sink destinations (data warehouses, lakes, caches, analytics platforms, etc.)
- Monitoring and observability tools
- Deployment approach (self-hosted, managed service, cloud-native)

We'd love to hear what's working well and what challenges you've faced! 🚀

**Example:**
> We use Debezium + Kafka Connect to capture changes from PostgreSQL and MySQL databases, streaming to both Snowflake (analytics) and Redis (caching). For monitoring, we rely on Prometheus + Grafana to track lag and throughput.`,
    category: "Show and Tell",
    pin: true
  },
  {
    title: "Your most challenging CDC bug - and how you fixed it",
    body: `CDC can be tricky, and we've all hit hard-to-debug issues. Share your war stories! 🐛

**What to include:**
- What was the symptom? (data loss, lag, corruption, ordering issues, etc.)
- How did you diagnose it? (logs, metrics, testing approach)
- What was the root cause?
- How did you fix it?
- What did you learn? Any preventive measures?

Your story could help someone else avoid the same pitfall!

**Bonus points for:**
- Sharing code snippets or config examples
- Linking to relevant monitoring dashboards or log patterns
- Documenting what didn't work before finding the solution`,
    category: "Debugging War Stories",
    pin: true
  },
  {
    title: "Tool Requests / Future Labs - What would you like to see?",
    body: `Help shape the future of this learning platform! 💡

**What would you like to see added?**
- New CDC tool tutorials or quick starts
- Hands-on labs for specific scenarios
- Deep dives into advanced topics
- Troubleshooting guides for common issues
- Integration patterns and examples
- Video content or interactive demos

**Popular CDC tools we could cover:**
- Debezium (PostgreSQL, MySQL, MongoDB, SQL Server, Oracle)
- AWS DMS (Database Migration Service)
- Google Datastream
- Azure Data Factory CDC
- Matillion CDC
- Qlik Replicate / Attunity
- Striim
- Airbyte
- Fivetran

Tell us what you want to learn, and we'll prioritize based on community interest!`,
    category: "General",
    pin: true
  },
  {
    title: "Got stuck in a lab? Ask for help here!",
    body: `Running into issues with one of the hands-on labs or quick starts? This is the place to get help! 🆘

**When asking for help, please include:**
1. Which lab or module you're working on
2. What step you're stuck at
3. What error message or unexpected behavior you're seeing
4. What you've already tried
5. Your environment details (OS, Docker version, database version, etc.)

The more details you provide, the easier it is for others to help troubleshoot.

**Before posting:**
- Check the troubleshooting section for common issues
- Verify prerequisites are met (Docker installed, required ports available, etc.)
- Try the "clean slate" approach: \`docker compose down -v\` and restart

Don't hesitate to ask - we're all learning together! 🤝`,
    category: "Q&A",
    pin: true
  }
];

/**
 * Fetch repository ID and discussion categories
 */
async function getRepositoryInfo() {
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 20) {
          nodes {
            id
            name
            slug
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        owner: REPO_OWNER,
        name: REPO_NAME
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.repository;
}

/**
 * Create a discussion
 */
async function createDiscussion(repositoryId, categoryId, title, body) {
  const mutation = `
    mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repositoryId,
        categoryId: $categoryId,
        title: $title,
        body: $body
      }) {
        discussion {
          id
          number
          title
          url
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        repositoryId,
        categoryId,
        title,
        body
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.createDiscussion.discussion;
}

/**
 * Pin a discussion
 */
async function pinDiscussion(discussionId) {
  const mutation = `
    mutation($discussionId: ID!) {
      pinDiscussion(input: {
        discussionId: $discussionId
      }) {
        discussion {
          id
          title
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        discussionId
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    console.warn(`Warning: Could not pin discussion: ${JSON.stringify(data.errors)}`);
    return null;
  }

  return data.data.pinDiscussion.discussion;
}

/**
 * Check if a discussion with the same title already exists
 * Note: GitHub's search index may have delays, so this check might produce false negatives
 * for discussions created very recently.
 */
async function discussionExists(title) {
  const query = `
    query($owner: String!, $name: String!, $query: String!) {
      search(query: $query, type: DISCUSSION, first: 5) {
        nodes {
          ... on Discussion {
            title
          }
        }
      }
    }
  `;

  const searchQuery = `repo:${REPO_OWNER}/${REPO_NAME} "${title}" in:title`;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        owner: REPO_OWNER,
        name: REPO_NAME,
        query: searchQuery
      }
    })
  });

  if (!response.ok) {
    console.warn(`Warning: Could not check for existing discussions`);
    return false;
  }

  const data = await response.json();
  
  if (data.errors) {
    console.warn(`Warning: Could not check for existing discussions`);
    return false;
  }

  return data.data.search.nodes.some(node => node.title === title);
}

/**
 * Find category ID by name or slug with fuzzy matching
 */
function findCategoryId(categories, targetName) {
  const normalized = targetName.toLowerCase().trim();
  
  // Try exact match first
  let category = categories.find(cat => 
    cat.name.toLowerCase() === normalized ||
    cat.slug.toLowerCase() === normalized
  );
  
  if (category) {
    return category.id;
  }
  
  // Try partial match
  category = categories.find(cat => 
    cat.name.toLowerCase().includes(normalized) ||
    normalized.includes(cat.slug.toLowerCase())
  );

  if (category) {
    console.log(`   ℹ️  Matched category "${targetName}" to "${category.name}" (fuzzy match)`);
  }

  return category?.id;
}

/**
 * Main execution
 */
async function main() {
  console.log('🌱 GitHub Discussions Seeder\n');

  // Validate prerequisites
  if (!GITHUB_TOKEN) {
    console.error('❌ Error: GITHUB_TOKEN environment variable is required');
    console.error('\nUsage:');
    console.error('  GITHUB_TOKEN=ghp_xxx node scripts/seed-discussions.mjs\n');
    console.error('The token needs "repo" and "discussion" permissions.\n');
    process.exit(1);
  }

  console.log(`📍 Target repository: ${REPO_OWNER}/${REPO_NAME}\n`);

  try {
    // Fetch repository info
    console.log('🔍 Fetching repository information...');
    const repo = await getRepositoryInfo();
    console.log(`✅ Repository ID: ${repo.id}`);
    console.log(`📁 Available categories: ${repo.discussionCategories.nodes.map(c => c.name).join(', ')}\n`);

    let created = 0;
    let skipped = 0;
    let pinned = 0;

    // Create each seed discussion
    for (const seed of SEED_DISCUSSIONS) {
      console.log(`\n📝 Processing: "${seed.title}"`);

      // Check if discussion already exists
      const exists = await discussionExists(seed.title);
      if (exists) {
        console.log(`   ⏭️  Skipped (already exists)`);
        skipped++;
        continue;
      }

      // Find category ID
      const categoryId = findCategoryId(repo.discussionCategories.nodes, seed.category);
      if (!categoryId) {
        console.error(`   ⚠️  Warning: Category "${seed.category}" not found, skipping`);
        skipped++;
        continue;
      }

      // Create discussion
      try {
        const discussion = await createDiscussion(repo.id, categoryId, seed.title, seed.body);
        console.log(`   ✅ Created: ${discussion.url}`);
        created++;

        // Pin if requested
        if (seed.pin) {
          const pinResult = await pinDiscussion(discussion.id);
          if (pinResult) {
            console.log(`   📌 Pinned`);
            pinned++;
          }
        }

        // Rate limiting: wait between requests
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      } catch (error) {
        console.error(`   ❌ Failed to create: ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   📌 Pinned: ${pinned}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log('='.repeat(50) + '\n');

    if (created > 0) {
      console.log('🎉 Success! Visit your discussions at:');
      console.log(`   https://github.com/${REPO_OWNER}/${REPO_NAME}/discussions\n`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
