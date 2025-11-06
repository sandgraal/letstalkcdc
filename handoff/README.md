# Handoff Ritual — Let’s Talk CDC

This folder contains a complete, repo-local **Nightly Prompt Sync** system.

## Quick Start
```bash
cd handoff
chmod +x nightly-sync.sh
./nightly-sync.sh
```

## Automate (GitHub Actions)
Nightly sync runs automatically from the repository via [`.github/workflows/handoff-nightly.yml`](../.github/workflows/handoff-nightly.yml).
It executes `nightly-sync.sh`, commits the parsed log entry, and publishes the dashboard through the Pages workflow.

## Automate (Cron)
```bash
crontab -e
0 21 * * * /absolute/path/to/repo/handoff/nightly-sync.sh >> /absolute/path/to/repo/handoff/nightly-sync.log 2>&1
```

## Automate (launchd on macOS)
Create `~/Library/LaunchAgents/com.handoff.sync.plist` (see example inside previous messages).

## GitHub Pages
Enable **Settings → Pages → Source: GitHub Actions**. The included workflow publishes only the `handoff` folder.
