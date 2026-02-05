/**
 * Community touchpoints configuration
 * Links to discussions, chat, and community resources
 */

export default {
  discussions: {
    enabled: true,
    url: "https://github.com/sandgraal/letstalkcdc/discussions",
    label: "GitHub Discussions",
    description: "Ask questions, share your CDC stack, and discuss best practices",
    // Specific discussion threads by category
    threads: {
      lab: {
        url: "https://github.com/sandgraal/letstalkcdc/discussions/4",
        title: "Got stuck in a lab? Ask for help here!",
        description: "Get help with labs and quickstarts"
      },
      general: {
        url: "https://github.com/sandgraal/letstalkcdc/discussions/3",
        title: "Tool Requests / Future Labs - What would you like to see?",
        description: "Share ideas and discuss CDC topics"
      },
      share: {
        url: "https://github.com/sandgraal/letstalkcdc/discussions/1",
        title: "Share your CDC stack!",
        description: "Share your CDC implementation"
      }
    }
  },
  discord: {
    enabled: false,
    url: null,
    label: "Discord Community",
    description: "Join our Discord server for real-time chat and community support"
  },
  slack: {
    enabled: false,
    url: null,
    label: "Slack Workspace",
    description: "Connect with other CDC practitioners in our Slack community"
  }
};
