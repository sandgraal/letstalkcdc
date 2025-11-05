# Important: OpenTelemetry Browser Bundling

## Current Limitation

The OpenTelemetry JavaScript packages installed are **Node.js modules** that need to be bundled for browser use. The current setup won't work directly in the browser without a bundler like:

- **Webpack**
- **Rollup**
- **esbuild**
- **Parcel**

## Solutions

### Option 1: Add esbuild Bundling (Recommended)

Install esbuild:

```bash
npm install --save-dev esbuild
```

Create `scripts/bundle-tracing.mjs`:

```javascript
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/assets/js/tracing.js'],
  bundle: true,
  format: 'esm',
  outfile: 'src/assets/js/tracing.bundle.js',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  minify: false,
  external: [], // Bundle all dependencies
});

console.log('✓ Tracing bundle created');
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "bundle:tracing": "node scripts/bundle-tracing.mjs",
    "build": "npm run bundle:tracing && npm run build:css && npm run minify:css && eleventy --config=eleventy.config.cjs"
  }
}
```

Update `src/assets/js/app.js` import:

```javascript
import { getEducationTracer } from './tracing.bundle.js';
```

### Option 2: Use CDN (Quick Alternative)

For quick testing, use pre-bundled OpenTelemetry from CDN.

Create `src/assets/js/tracing-cdn.js`:

```javascript
/**
 * Lightweight tracing using Performance API and Beacon API
 * No external dependencies - works immediately
 */

export class EducationTracer {
  constructor() {
    this.sessionId = this._getSessionId();
    this.endpoint = 'http://localhost:4318/v1/traces';
  }

  trackModuleView(moduleKey, moduleTitle) {
    this._sendEvent('module.view', {
      'module.key': moduleKey,
      'module.title': moduleTitle,
    });
  }

  trackProgress(moduleKey, step, percentComplete) {
    this._sendEvent('learning.progress', {
      'module.key': moduleKey,
      'learning.step': step,
      'learning.percent_complete': percentComplete,
    });
  }

  trackInteraction(interactionType, elementId, success = true) {
    this._sendEvent('learning.interaction', {
      'interaction.type': interactionType,
      'interaction.element_id': elementId,
      'interaction.success': success,
    });
  }

  trackSearch(query, resultsCount) {
    this._sendEvent('search.query', {
      'search.query': query,
      'search.results_count': resultsCount,
    });
  }

  trackWebVital(name, value, rating) {
    this._sendEvent('web.vital', {
      'vital.name': name,
      'vital.value': value,
      'vital.rating': rating,
      'page.path': window.location.pathname,
    });
  }

  _sendEvent(name, attributes) {
    const span = {
      name,
      timestamp: Date.now() * 1000000, // nanoseconds
      attributes: {
        ...attributes,
        'user.session_id': this.sessionId,
        'page.url': window.location.href,
      },
    };

    // Send via fetch (non-blocking)
    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(span),
      keepalive: true,
    }).catch(() => {
      // Silently fail - tracing should not break the app
      console.debug('Tracing beacon failed:', name);
    });
  }

  _getSessionId() {
    let sessionId = sessionStorage.getItem('trace_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('trace_session_id', sessionId);
    }
    return sessionId;
  }
}

export function getEducationTracer() {
  if (!window._educationTracer) {
    window._educationTracer = new EducationTracer();
    console.log('✓ Education tracing initialized');
  }
  return window._educationTracer;
}

export function initTracing() {
  return getEducationTracer();
}
```

Then update `app.js` to import from `./tracing-cdn.js` instead.

### Option 3: Use Import Maps (Modern Browsers)

Add to your HTML `<head>`:

```html
<script type="importmap">
{
  "imports": {
    "@opentelemetry/api": "https://cdn.jsdelivr.net/npm/@opentelemetry/api@1.9.0/+esm",
    "@opentelemetry/sdk-trace-web": "https://cdn.jsdelivr.net/npm/@opentelemetry/sdk-trace-web@2.2.0/+esm"
  }
}
</script>
```

Note: This requires modern browser support and may not work with all OpenTelemetry packages.

## Recommended Approach

**For this project, use Option 1 (esbuild bundling)** because:

✅ Works with all OpenTelemetry features
✅ Optimized bundle size (tree-shaking)
✅ Source maps for debugging
✅ Integrates with existing build process
✅ Production-ready

## Next Steps

1. Choose a bundling approach
2. Update the build scripts
3. Test in the browser
4. Verify traces appear in AI Toolkit

## Current Status

⚠️ **The tracing code is installed but needs bundling to work in the browser.**

The code structure and logic are correct, but browser module resolution needs to be handled by a bundler.
