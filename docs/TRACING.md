# Client-side tracing — removed

The lightweight in-browser tracer (`src/assets/js/tracing-lite.js`) was
**removed in May 2026**. It had been shipped as dead weight: the default
endpoint hardcoded to `http://localhost:4318/v1/traces`, so every
visitor's browser POSTed traces to _their own_ `localhost`, where every
request was silently swallowed by the fetch `catch`. The full
OpenTelemetry build had been removed earlier (PR #261) along with nine
`@opentelemetry/*` dev dependencies.

The tracer-shaped no-op object survives in `src/assets/js/app.js` as
the `educationTracer` const, and the per-module `init*(tracer)` call
sites still accept it — so existing unit tests that pass their own mock
tracers continue to work. No data is collected.

## If you ever want browser tracing back

Build it as an opt-in module, not a default import. Pattern:

1. Source an endpoint from a build-time env var (e.g.
   `OTLP_TRACING_ENDPOINT`); refuse to instantiate if unset.
2. Gate it behind a query param or `localStorage` flag in dev.
3. Do not `console.log` "✓ Tracing initialized" on every page load —
   that pollutes the console for readers debugging their own code.
4. Wire the new client at module-call sites via the existing `tracer`
   parameter; do not add new no-op fallbacks.
5. Add an end-to-end test that asserts the collector receives at
   least one span from a real page load.

Until then, do not reintroduce the tracer skeleton.
