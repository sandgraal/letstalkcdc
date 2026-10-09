export type ScenarioGuidanceBullet = {
  title: string;
  detail: string;
};

export type ScenarioGuidance = {
  summary?: string;
  controls: ScenarioGuidanceBullet[];
  observations: ScenarioGuidanceBullet[];
};

const GUIDANCE_BY_SCENARIO: Record<string, ScenarioGuidance> = {
  "account changes": {
    summary:
      "Three accounts get updates, an insert and a delete. There is no snapshot phase and no handoff: compare what each capture method reports for the same writes.",
    controls: [
      {
        title: "Enable Log, Trigger and Polling",
        detail:
          "Run all three lanes over the same writes and compare how many events each reports and when.",
      },
      {
        title: "Apply on commit",
        detail:
          "Toggle it to see whether grouped writes reach the destination together or one at a time.",
      },
    ],
    observations: [
      {
        title: "Delete capture",
        detail:
          "Check which lanes report the delete of AC-301. Polling only sees what is still in the table when it polls.",
      },
      {
        title: "last_change_id",
        detail:
          "Each row carries a rising last_change_id. The simulator does not use it; it shows the kind of marker a real sink would compare.",
      },
    ],
  },
  "re-insert after update": {
    summary:
      "Follow one ledger row through an update, a re-insert of its older values, and a later update. The re-insert is a new source write, not a redelivered event.",
    controls: [
      {
        title: "Enable Log and Trigger",
        detail:
          "Both report every write in order, so the re-insert shows up as its own event between the two updates.",
      },
      {
        title: "Add Polling to compare",
        detail:
          "Polling samples the table, so it can collapse the update and the re-insert into one observed change.",
      },
    ],
    observations: [
      {
        title: "Later write wins",
        detail:
          "The sink ends on the last update because it was the last write. The re-insert is applied in order, not rejected.",
      },
      {
        title: "Not a replay",
        detail:
          "No old event is delivered a second time here, so this scenario cannot show a stale record losing to a newer one.",
      },
    ],
  },
  "orders + items transactions": {
    summary:
      "Highlight multi-table atomicity and why apply-on-commit matters for transactional feeds.",
    controls: [
      {
        title: "Enable apply-on-commit",
        detail:
          "Group transaction events so orders/items stay consistent even if a lane pauses mid-flight.",
      },
      {
        title: "Toggle consumer pause",
        detail:
          "Pause apply during a multi-row commit to show how partial apply would drift if atomic grouping is off.",
      },
      {
        title: "Keep log + trigger on",
        detail:
          "Contrast log ordering guarantees with trigger write amplification when commits include multiple tables.",
      },
    ],
    observations: [
      {
        title: "Out-of-order risk",
        detail:
          "Use the lane diff overlay to surface any sequence gaps when apply-on-commit is disabled.",
      },
      {
        title: "Write amplification",
        detail:
          "Inspect trigger metrics to show the extra writes incurred versus log capture for the same transaction.",
      },
    ],
  },
  "outbox relay": {
    summary: "Compare an application-managed outbox with log capture and where each shines.",
    controls: [
      {
        title: "Disable polling",
        detail:
          "Keep focus on outbox vs. log/trigger capture; polling collapses the ordering story to diffs.",
      },
      {
        title: "Filter to outbox table",
        detail:
          "Use the event log table filter to spotlight outbox_events entries and their ordering keys.",
      },
      {
        title: "Keep apply-on-commit off",
        detail:
          "Allow partial apply to show how outbox can still preserve business ordering when consumers lag.",
      },
    ],
    observations: [
      {
        title: "Idempotent keys",
        detail:
          "Point out the stable event_key on each outbox row. Every event is delivered once here, so this shows the key a downstream sink could dedupe on, not a dedupe or a retry.",
      },
      {
        title: "Stable ids on re-run",
        detail:
          "Reset and run again: the same writes produce the same outbox ids (EVT-221-*). Nothing is redelivered.",
      },
    ],
  },
  "retention & erasure": {
    summary: "Demonstrate privacy deletes, masking, and soft-delete visibility across methods.",
    controls: [
      {
        title: "Enable soft delete column",
        detail:
          "Turn on the polling soft-delete marker so diffs retain tombstones instead of dropping rows silently.",
      },
      {
        title: "Keep polling slower",
        detail:
          "Use a longer poll interval (1–2s) to show how lag makes soft-delete visibility diverge from log capture.",
      },
      {
        title: "Use event search",
        detail:
          "Filter for delete ops (d) to compare how each method surfaces erasure events and masking updates.",
      },
    ],
    observations: [
      {
        title: "Hard vs. soft delete",
        detail:
          "Point out that polling without the marker loses hard deletes, while log/trigger lanes emit explicit tombstones.",
      },
      {
        title: "Compliance lag",
        detail:
          "Watch lag spread to discuss how quickly each method propagates erasure, especially under throttled apply.",
      },
    ],
  },
  "burst updates": {
    summary: "Stress test lag/ordering under rapid-fire updates to the same keys.",
    controls: [
      {
        title: "Throttle apply",
        detail:
          "Enable the apply rate limiter to build backlog and make ordering differences visible in the diff overlay.",
      },
      {
        title: "Tighten log fetch interval",
        detail:
          "Drop the log fetch interval toward 50–100ms to show near-real-time log capture versus slower polling.",
      },
      {
        title: "Disable generator",
        detail:
          "Keep the synthetic generator off so the scenario traffic stays focused on the curated burst pattern.",
      },
    ],
    observations: [
      {
        title: "Last-write wins",
        detail:
          "Use the event log search to show how polling collapses intermediate updates when bursts occur.",
      },
      {
        title: "Lag hotspots",
        detail:
          "Check metrics dashboard to spot which lane accumulates the largest p95 lag under sustained bursts.",
      },
    ],
  },
};

export function getScenarioGuidance(scenarioName: string | undefined | null): ScenarioGuidance | null {
  if (!scenarioName) return null;
  const key = scenarioName.trim().toLowerCase();
  return GUIDANCE_BY_SCENARIO[key] ?? null;
}
