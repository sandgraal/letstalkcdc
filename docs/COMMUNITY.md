# Community Engagement Guide

This guide outlines how to set up and moderate the Let's Talk CDC community spaces.

## GitHub Discussions Setup

### Enabling Discussions

1. Go to the repository settings: https://github.com/sandgraal/letstalkcdc/settings
2. Scroll down to the "Features" section
3. Check the "Discussions" checkbox
4. Click "Set up discussions" to create the initial discussion categories

### Recommended Discussion Categories

Create the following categories to organize community conversations:

1. **📋 Announcements** (Announcement type)
   - Site updates and new content releases
   - Community events or office hours

2. **💡 Show and Tell** (Open-ended discussion)
   - Share your CDC stack and architecture
   - Production implementation stories
   - Tool comparisons and benchmarks

3. **🐛 Debugging War Stories** (Open-ended discussion)
   - Share challenging CDC issues you've solved
   - Lessons learned from production incidents
   - Performance optimization experiences

4. **❓ Q&A** (Q&A type)
   - Technical questions about CDC concepts
   - Implementation help
   - Best practices and recommendations

5. **💬 General** (Open-ended discussion)
   - General discussion about CDC
   - Feature requests for the site
   - Feedback and suggestions

6. **🏗️ Use Cases** (Open-ended discussion)
   - Real-world CDC use cases
   - Industry-specific patterns
   - Event-driven architecture patterns

### Seed Discussion Topics

To kickstart community engagement, use the automated seeding script or manually create these initial discussions:

#### Automated Seeding (Recommended)

Use the `seed-discussions.mjs` script to automatically create all starter threads:

```bash
# Generate a GitHub token with 'repo' and 'discussion' permissions.
# Pass it via your shell environment (or `gh auth token`) — don't
# inline real PATs in command lines.
export GITHUB_TOKEN="$(gh auth token)"
npm run seed:discussions
```

The script will:

- Create 4 pinned starter discussions
- Skip any discussions that already exist
- Automatically categorize each thread
- Provide a summary of created/skipped discussions

**For detailed instructions, see [DISCUSSIONS_SEED.md](DISCUSSIONS_SEED.md)**

**Prerequisites:**

- GitHub Discussions must be enabled for the repository
- GitHub personal access token with `repo` and `discussion` scopes
- Discussion categories must exist (see above section)

#### Manual Creation

Alternatively, manually create these discussions:

#### Show Your CDC Stack

```markdown
**Title:** Share your CDC stack!

**Body:**
What tools and technologies are you using for Change Data Capture in your organization?

Share details about:

- Source databases (PostgreSQL, MySQL, Oracle, etc.)
- CDC tools (Debezium, Maxwell, Striim, etc.)
- Message brokers (Kafka, Pulsar, Kinesis, etc.)
- Sink destinations (data warehouses, lakes, caches, etc.)
- Monitoring and observability tools

We'd love to hear what's working well and what challenges you've faced!
```

#### Debugging War Stories

```markdown
**Title:** Your most challenging CDC bug - and how you fixed it

**Body:**
CDC can be tricky, and we've all hit hard-to-debug issues. Share your war stories!

What to include:

- What was the symptom? (data loss, lag, corruption, etc.)
- How did you diagnose it?
- What was the root cause?
- How did you fix it?
- What did you learn?

Your story could help someone else avoid the same pitfall!
```

#### Production Patterns

```markdown
**Title:** What CDC patterns are you using in production?

**Body:**
Let's talk about real-world CDC architectures.

Share your experience with:

- Log-based vs. trigger-based vs. timestamp-based CDC
- Full snapshots vs. incremental replication
- Schema evolution handling
- Multi-tenancy patterns
- Partitioning strategies
- Exactly-once semantics

What patterns have worked well for your use case?
```

#### Tool Requests / Future Labs

```markdown
**Title:** Tool Requests / Future Labs - What would you like to see?

**Body:**
Help shape the future of this learning platform!

What would you like to see added?

- New CDC tool tutorials or quick starts
- Hands-on labs for specific scenarios
- Deep dives into advanced topics
- Troubleshooting guides for common issues
- Integration patterns and examples
- Video content or interactive demos

Popular CDC tools we could cover:

- Debezium (PostgreSQL, MySQL, MongoDB, SQL Server, Oracle)
- AWS DMS (Database Migration Service)
- Google Datastream
- Azure Data Factory CDC
- Matillion CDC
- Qlik Replicate / Attunity
- Striim
- Airbyte
- Fivetran

Tell us what you want to learn, and we'll prioritize based on community interest!
```

#### Got Stuck in a Lab?

```markdown
**Title:** Got stuck in a lab? Ask for help here!

**Body:**
Running into issues with one of the hands-on labs or quick starts? This is the place to get help!

When asking for help, please include:

1. Which lab or module you're working on
2. What step you're stuck at
3. What error message or unexpected behavior you're seeing
4. What you've already tried
5. Your environment details (OS, Docker version, database version, etc.)

The more details you provide, the easier it is for others to help troubleshoot.

Before posting:

- Check the troubleshooting section for common issues
- Verify prerequisites are met (Docker installed, required ports available, etc.)
- Try the "clean slate" approach: `docker compose down -v` and restart

Don't hesitate to ask - we're all learning together!
```

## Community Moderation

### Moderation Guidelines

1. **Be welcoming**: Encourage questions and discussions at all skill levels
2. **Stay on topic**: Keep discussions focused on CDC and related data engineering topics
3. **Be respectful**: Maintain a professional and inclusive environment
4. **Give credit**: Acknowledge contributors and cite sources
5. **Encourage specifics**: Ask for details, code snippets, and error messages when troubleshooting

### Response Templates

#### Welcoming New Members

```markdown
Welcome to the Let's Talk CDC community! Thanks for sharing your question/experience.

[Provide helpful response or ask for clarification]

If you haven't already, check out [relevant section of the site] for more background on this topic.
```

#### Redirecting to Better Category

```markdown
Thanks for your post! This would be a great fit for the [Category Name] category.

Could you repost it there? That way more people interested in [topic] will see it.
```

#### Closing Resolved Discussions

```markdown
Great discussion! It looks like this has been resolved.

I'm marking this as answered. If anyone has follow-up questions, feel free to start a new discussion and reference this one.
```

## Office Hours (Optional)

Consider hosting regular "office hours" for real-time community support:

### Format Options

1. **Live Q&A**: Schedule monthly video calls for live questions
2. **AMA (Ask Me Anything)**: Guest experts answer questions asynchronously
3. **Code Review Sessions**: Review community CDC implementations together
4. **Deep Dives**: Monthly topic deep dives on specific CDC patterns

### Scheduling

- Choose a consistent schedule (e.g., first Tuesday of each month)
- Rotate times to accommodate different time zones
- Announce at least 2 weeks in advance
- Record sessions and share recordings

## Discord/Slack Setup (Future)

When ready to add real-time chat:

### Discord Setup

1. Create server with these channels:
   - `#general` - General discussion
   - `#help` - Technical questions
   - `#showcase` - Share implementations
   - `#announcements` - Site updates
   - `#resources` - Useful links and articles

2. Set up moderation bots (MEE6, Dyno)
3. Create onboarding message and rules
4. Update `src/_data/community.mjs`:
   ```javascript
   discord: {
     enabled: true,
     url: "https://discord.gg/YOUR_INVITE_CODE",
     label: "Discord Community",
     description: "Join our Discord server for real-time chat and community support"
   }
   ```

### Slack Setup

1. Create workspace or community Slack
2. Set up channels similar to Discord structure
3. Configure Slack apps for moderation
4. Update `src/_data/community.mjs`:
   ```javascript
   slack: {
     enabled: true,
     url: "https://your-workspace.slack.com/join/shared_invite/...",
     label: "Slack Workspace",
     description: "Connect with other CDC practitioners in our Slack community"
   }
   ```

## Metrics to Track

Monitor community health with these metrics:

- Number of active discussions
- Response time to questions
- Contributor diversity (new vs. returning)
- Quality of answers (marked as solved)
- Community growth rate
- Engagement per discussion

## Resources

- [GitHub Discussions Documentation](https://docs.github.com/en/discussions)
- [Community Building Best Practices](https://opensource.guide/building-community/)
- [Moderation Guidelines](https://opensource.guide/code-of-conduct/)
