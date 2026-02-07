/**
 * Lightweight Education Tracing (No Dependencies)
 *
 * Simple telemetry for educational site that works without bundling.
 * Sends trace events to OpenTelemetry collector via fetch API.
 */

export class EducationTracer {
  constructor(endpoint = "http://localhost:4318/v1/traces") {
    this.sessionId = this._getSessionId();
    this.endpoint = endpoint;
    this.serviceName = "letstalkcdc-web";
    this.serviceVersion = "1.0.0";
    this.enabled = true;

    // Track page load performance
    this._trackPageLoad();

    // Setup Core Web Vitals tracking
    this._setupWebVitals();
  }

  /**
   * Track module view
   */
  trackModuleView(moduleKey, moduleTitle) {
    this._createSpan("module.view", {
      "module.key": moduleKey,
      "module.title": moduleTitle,
    });
  }

  /**
   * Track learning progress
   */
  trackProgress(moduleKey, step, percentComplete) {
    this._createSpan("learning.progress", {
      "module.key": moduleKey,
      "learning.step": step,
      "learning.percent_complete": percentComplete,
    });
  }

  /**
   * Track interactive element
   */
  trackInteraction(interactionType, elementId, success = true) {
    this._createSpan("learning.interaction", {
      "interaction.type": interactionType,
      "interaction.element_id": elementId,
      "interaction.success": success,
    });
  }

  /**
   * Track search query
   */
  trackSearch(query, resultsCount) {
    this._createSpan("search.query", {
      "search.query": query,
      "search.results_count": resultsCount,
    });
  }

  /**
   * Track Core Web Vital
   */
  trackWebVital(name, value, rating) {
    this._createSpan("web.vital", {
      "vital.name": name,
      "vital.value": value,
      "vital.rating": rating,
      "page.path": window.location.pathname,
    });
  }

  /**
   * Create and send a span
   */
  _createSpan(name, attributes = {}, durationMs = 0) {
    if (!this.enabled) return;

    const now = Date.now();
    const startTimeUnixNano = String((now - durationMs) * 1000000);
    const endTimeUnixNano = String(now * 1000000);

    // Create OTLP-compatible trace
    const trace = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              {
                key: "service.version",
                value: { stringValue: this.serviceVersion },
              },
              {
                key: "deployment.environment",
                value: { stringValue: this._getEnvironment() },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: this.serviceName,
                version: this.serviceVersion,
              },
              spans: [
                {
                  traceId: this._generateTraceId(),
                  spanId: this._generateSpanId(),
                  name: name,
                  kind: 1, // SPAN_KIND_INTERNAL
                  startTimeUnixNano: startTimeUnixNano,
                  endTimeUnixNano: endTimeUnixNano,
                  attributes: this._formatAttributes({
                    ...attributes,
                    "user.session_id": this.sessionId,
                    "page.url": window.location.href,
                    "page.path": window.location.pathname,
                    "user_agent.original": navigator.userAgent,
                  }),
                  status: { code: 1 }, // STATUS_CODE_OK
                },
              ],
            },
          ],
        },
      ],
    };

    this._sendTrace(trace);
  }

  /**
   * Format attributes for OTLP
   */
  _formatAttributes(attrs) {
    return Object.entries(attrs).map(([key, value]) => {
      let otlpValue;

      if (typeof value === "string") {
        otlpValue = { stringValue: value };
      } else if (typeof value === "number") {
        if (Number.isInteger(value)) {
          otlpValue = { intValue: String(value) };
        } else {
          otlpValue = { doubleValue: value };
        }
      } else if (typeof value === "boolean") {
        otlpValue = { boolValue: value };
      } else {
        otlpValue = { stringValue: String(value) };
      }

      return { key, value: otlpValue };
    });
  }

  /**
   * Send trace to OTLP endpoint
   */
  _sendTrace(trace) {
    // Use sendBeacon for better reliability on page unload
    const blob = new Blob([JSON.stringify(trace)], {
      type: "application/json",
    });

    if (navigator.sendBeacon && document.visibilityState === "hidden") {
      navigator.sendBeacon(this.endpoint, blob);
    } else {
      // Use fetch for normal cases
      fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trace),
        keepalive: true,
      }).catch((error) => {
        // Silently fail - tracing should not break the app
        console.debug("Tracing failed:", error);
      });
    }
  }

  /**
   * Track page load performance
   */
  _trackPageLoad() {
    if (!window.performance || !window.performance.timing) return;

    window.addEventListener("load", () => {
      setTimeout(() => {
        const timing = performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        const domReady =
          timing.domContentLoadedEventEnd - timing.navigationStart;
        const firstByte = timing.responseStart - timing.navigationStart;

        this._createSpan(
          "document.load",
          {
            "page.load_time_ms": loadTime,
            "page.dom_ready_ms": domReady,
            "page.first_byte_ms": firstByte,
            "page.title": document.title,
          },
          loadTime,
        );
      }, 0);
    });
  }

  /**
   * Setup Core Web Vitals tracking
   */
  _setupWebVitals() {
    // Track Largest Contentful Paint (LCP)
    if ("PerformanceObserver" in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          const value = lastEntry.renderTime || lastEntry.loadTime;
          const rating =
            value < 2500 ? "good" : value < 4000 ? "needs-improvement" : "poor";
          this.trackWebVital("LCP", value, rating);
        });
        lcpObserver.observe({
          type: "largest-contentful-paint",
          buffered: true,
        });
      } catch (_e) {
        console.debug("LCP observation not supported");
      }

      // Track First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            const value = entry.processingStart - entry.startTime;
            const rating =
              value < 100 ? "good" : value < 300 ? "needs-improvement" : "poor";
            this.trackWebVital("FID", value, rating);
          });
        });
        fidObserver.observe({ type: "first-input", buffered: true });
      } catch (_e) {
        console.debug("FID observation not supported");
      }

      // Track Cumulative Layout Shift (CLS)
      let clsValue = 0;
      try {
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });

        // Report CLS when page is hidden
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden" && clsValue > 0) {
            const rating =
              clsValue < 0.1
                ? "good"
                : clsValue < 0.25
                  ? "needs-improvement"
                  : "poor";
            this.trackWebVital("CLS", clsValue, rating);
          }
        });
      } catch (_e) {
        console.debug("CLS observation not supported");
      }
    }
  }

  /**
   * Get or create session ID
   */
  _getSessionId() {
    let sessionId = sessionStorage.getItem("trace_session_id");
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      sessionStorage.setItem("trace_session_id", sessionId);
    }
    return sessionId;
  }

  /**
   * Get deployment environment
   */
  _getEnvironment() {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "development";
    }
    return "production";
  }

  /**
   * Generate random trace ID (32 hex chars)
   */
  _generateTraceId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Generate random span ID (16 hex chars)
   */
  _generateSpanId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

/**
 * Initialize and return tracer singleton
 */
export function getEducationTracer() {
  if (!window._educationTracer) {
    try {
      window._educationTracer = new EducationTracer();
      console.log("✓ Education tracing initialized");
    } catch (error) {
      console.warn("Failed to initialize tracing:", error);
      // Return no-op tracer
      window._educationTracer = {
        trackModuleView: () => {},
        trackProgress: () => {},
        trackInteraction: () => {},
        trackSearch: () => {},
        trackWebVital: () => {},
      };
    }
  }
  return window._educationTracer;
}

/**
 * Alias for backwards compatibility
 */
export function initTracing() {
  return getEducationTracer();
}
