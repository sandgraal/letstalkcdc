# OpenTelemetry Tracing - Quick Start Guide

## What Was Added

✅ **Client-side tracing** with a **lightweight OpenTelemetry-compatible implementation**

### Implementation Approach

The site uses **`tracing-lite.js`** — a custom, zero-dependency tracer that:

- ✅ **No bundler required** — Works directly in browsers
- ✅ **No npm dependencies at runtime** — Uses only browser fetch API
- ✅ **OTLP-compatible** — Sends standard OpenTelemetry protocol traces
- ✅ **Progressive enhancement** — Site works even if tracing fails

> **Note**: This replaces the full OpenTelemetry npm packages (`@opentelemetry/*`) which would require bundling. The lite version provides equivalent functionality with browser-native APIs.

### Key Features

1. **Automatic Performance Tracking**

   - Page load performance (uses PerformanceNavigationTiming API)
   - Core Web Vitals (LCP, FID, CLS)
   - Resource load metrics

2. **Custom Educational Tracking**

   - Module views (tracks which learning modules users visit)
   - Learning progress (step completion, percentage)
   - Code copy events (when users copy code snippets)
   - Search queries (search usage and result counts)

3. **Session Management**
   - Unique session IDs for correlation
   - Stored in sessionStorage (cleared on tab close)
   - No persistent tracking or PII collection

## Files Modified/Created

### Current Implementation

- ✨ `src/assets/js/tracing-lite.js` - **Lightweight tracer (IN USE)**

  - Custom OTLP implementation
  - No external dependencies
  - ~364 lines of vanilla JavaScript

- 🔧 `src/assets/js/app.js` - Integrated tracing calls
  - Imports from `tracing-lite.js`
  - Graceful fallback if tracing fails

### Alternative (Not Used)

- ⚠️ `src/assets/js/tracing.js` - Full OpenTelemetry SDK (requires bundling)
  - Uses `@opentelemetry/*` npm packages
  - Would require webpack/rollup/esbuild
  - Not used to avoid build complexity

### Documentation

- 📖 `docs/TRACING.md` - Complete documentation (updated)
- 📝 `docs/TRACING-QUICKSTART.md` - This file (updated)

## How to Use

### 1. View Traces in AI Toolkit

The tracing viewer has already been opened in VS Code. You can access it via:

**View → AI Toolkit → Tracing**

### 2. Test the Tracing

With the dev server running at http://localhost:8080/:

1. **Open your browser** and navigate to http://localhost:8080/
2. **Browse modules** - Visit any learning module (e.g., `/intro/`, `/snapshotting/`)
3. **Search** - Press `/` and search for something (e.g., "kafka")
4. **Copy code** - Click any "Copy" button on code blocks
5. **Complete tasks** - Check off items in learning modules

### 3. View the Traces

Return to VS Code and check the **AI Toolkit Tracing panel**. You should see:

- **documentLoad** spans - Page load performance
- **module.view** spans - When you visited a module
- **search.query** spans - Your search queries
- **learning.interaction** spans - Code copy events
- **web.vital** spans - Core Web Vitals metrics
- **user-interaction** spans - Click events
- **fetch** spans - Network requests

### 4. Inspect Trace Details

Click any span to see:

- **Timing information** - Duration, start time
- **Attributes** - Module keys, search queries, success flags
- **Context** - Session ID, page path, user agent
- **Relationships** - Parent/child span connections

## What Gets Tracked

### Page Views

```javascript
educationTracer.trackModuleView("intro", "Interactive Introduction to CDC");
```

- Module key (e.g., 'intro', 'snapshotting')
- Page title
- Session ID

### Learning Progress

```javascript
educationTracer.trackProgress("intro", 5, 65);
```

- Module key
- Current step number
- Completion percentage

### Search Queries

```javascript
educationTracer.trackSearch("kafka connector", 12);
```

- Search query text
- Number of results found

### Code Copy Events

```javascript
educationTracer.trackInteraction("code-copy", "setup-script", true);
```

- Interaction type
- Element ID
- Success status

### Core Web Vitals

```javascript
educationTracer.trackWebVital("LCP", 1250, "good");
```

- Metric name (LCP, FID, CLS)
- Measured value
- Rating (good/needs-improvement/poor)

## Trace Flow Example

Here's what a typical user session looks like in traces:

```
documentLoad (2.3s)
├─ documentFetch (850ms)
├─ resourceFetch: styles.css (120ms)
├─ resourceFetch: app.js (95ms)
└─ performancePaint (1.8s)

module.view (1ms)
├─ module.key: "intro"
└─ module.title: "Interactive Introduction to CDC"

user-interaction: click (2ms)
└─ target: "button.copy-btn"

learning.interaction (1ms)
├─ interaction.type: "code-copy"
├─ interaction.element_id: "setup-compose"
└─ interaction.success: true

search.query (15ms)
├─ search.query: "kafka"
└─ search.results_count: 8

learning.progress (1ms)
├─ module.key: "intro"
├─ learning.step: 3
└─ learning.percent_complete: 60

web.vital (0ms)
├─ vital.name: "LCP"
├─ vital.value: 1250
└─ vital.rating: "good"
```

## Troubleshooting

### No Traces Appearing?

1. **Check Console** - Look for "✓ OpenTelemetry tracing initialized"
2. **Check Network** - Look for POST requests to `localhost:4318/v1/traces`
3. **Restart AI Toolkit** - Sometimes the collector needs a restart
4. **Clear Cache** - Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+F5)

### Browser Console Errors?

The tracing has graceful error handling. If initialization fails, a no-op tracer is created and the site continues to work normally. Check `console.debug` for details:

```javascript
// Enable debug logging
localStorage.debug = "@opentelemetry/*";
```

Then reload the page to see detailed OpenTelemetry logs.

### CORS Errors?

The AI Toolkit OTLP endpoint should handle CORS automatically. If you see CORS errors:

1. Restart VS Code
2. Ensure no other process is using port 4318
3. Check AI Toolkit extension is active

## Next Steps

### Production Deployment

For production, you'll need to:

1. **Configure a production OTLP endpoint** (e.g., Honeycomb, Datadog, Jaeger)
2. **Add authentication** to the exporter
3. **Implement sampling** to reduce data volume
4. **Add environment detection** to only trace in specific environments

See `docs/TRACING.md` for production configuration examples.

### Advanced Analytics

You can extend the tracing to:

- Track quiz completion and scores
- Measure time spent on each module
- Correlate Core Web Vitals with user paths
- Build learning analytics dashboards
- A/B test different educational approaches

### Performance Optimization

Monitor these key metrics:

- **LCP < 2.5s** - Fast page loads
- **FID < 100ms** - Responsive interactions
- **CLS < 0.1** - Stable layouts
- **Search latency** - Quick search results
- **Module completion rates** - Effective content

## Documentation

For complete documentation, see:

- 📖 **Full Documentation**: `docs/TRACING.md`
- 🔧 **OpenTelemetry JS Docs**: https://opentelemetry.io/docs/instrumentation/js/
- 🎯 **AI Toolkit**: View → AI Toolkit → Tracing

## Dependencies Installed

```json
{
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/sdk-trace-web": "^2.2.0",
  "@opentelemetry/instrumentation-document-load": "^0.53.0",
  "@opentelemetry/instrumentation-user-interaction": "^0.52.0",
  "@opentelemetry/instrumentation-xml-http-request": "^0.207.0",
  "@opentelemetry/instrumentation-fetch": "^0.207.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.207.0",
  "@opentelemetry/resources": "^2.2.0",
  "@opentelemetry/semantic-conventions": "^1.37.0"
}
```

Total size: ~450KB (minified)

---

**🎉 That's it! Your educational site now has comprehensive observability.**

Happy tracing! 📊✨
