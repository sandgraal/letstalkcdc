/**
 * OpenTelemetry Web Tracing Configuration
 *
 * Tracks client-side performance, user interactions, and learning progress
 * for the Let's Talk CDC educational site.
 */

import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-web";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { trace, context } from "@opentelemetry/api";

/**
 * Initialize OpenTelemetry tracing for the web application
 */
export function initTracing() {
  // Create resource with service information
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: "letstalkcdc-web",
    [SEMRESATTRS_SERVICE_VERSION]: "1.0.0",
    "deployment.environment":
      window.location.hostname === "localhost" ? "development" : "production",
  });

  // Configure OTLP exporter to send traces to AI Toolkit
  const exporter = new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces", // AI Toolkit OTLP HTTP endpoint
    headers: {},
  });

  // Create tracer provider
  const provider = new WebTracerProvider({
    resource: resource,
  });

  // Add batch span processor
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  // Register the provider
  provider.register();

  // Register automatic instrumentations
  registerInstrumentations({
    instrumentations: [
      // Document load timing (page load performance)
      new DocumentLoadInstrumentation({
        applyCustomAttributesOnSpan: (span) => {
          span.setAttribute("page.path", window.location.pathname);
          span.setAttribute("page.title", document.title);
        },
      }),

      // User interaction tracking (clicks, etc.)
      new UserInteractionInstrumentation({
        eventNames: ["click", "submit", "keypress"],
        shouldPreventSpanCreation: (eventType, element, span) => {
          // Only track meaningful interactions
          const trackableElements = [
            "button",
            "a",
            'input[type="submit"]',
            "form",
          ];
          const tagName = element.tagName.toLowerCase();
          const isTrackable = trackableElements.some((selector) => {
            if (selector.includes("[")) {
              const [tag, attr] = selector.split("[");
              return tagName === tag && element.matches(selector);
            }
            return tagName === selector;
          });
          return !isTrackable;
        },
      }),

      // XMLHttpRequest instrumentation
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [/.+/], // Propagate to all origins
      }),

      // Fetch API instrumentation
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/.+/],
        clearTimingResources: true,
      }),
    ],
  });

  console.log("✓ OpenTelemetry tracing initialized");

  return trace.getTracer("letstalkcdc-web");
}

/**
 * Custom tracing utilities for educational content
 */
export class EducationTracer {
  constructor(tracer) {
    this.tracer = tracer;
  }

  /**
   * Track module navigation
   */
  trackModuleView(moduleKey, moduleTitle) {
    const span = this.tracer.startSpan("module.view", {
      attributes: {
        "module.key": moduleKey,
        "module.title": moduleTitle,
        "user.session_id": this._getSessionId(),
      },
    });
    span.end();
  }

  /**
   * Track learning progress events
   */
  trackProgress(moduleKey, step, percentComplete) {
    const span = this.tracer.startSpan("learning.progress", {
      attributes: {
        "module.key": moduleKey,
        "learning.step": step,
        "learning.percent_complete": percentComplete,
        "user.session_id": this._getSessionId(),
      },
    });
    span.end();
  }

  /**
   * Track interactive element completion (e.g., quiz, exercise)
   */
  trackInteraction(interactionType, elementId, success = true) {
    const span = this.tracer.startSpan("learning.interaction", {
      attributes: {
        "interaction.type": interactionType,
        "interaction.element_id": elementId,
        "interaction.success": success,
        "user.session_id": this._getSessionId(),
      },
    });
    span.end();
  }

  /**
   * Track search queries
   */
  trackSearch(query, resultsCount) {
    const span = this.tracer.startSpan("search.query", {
      attributes: {
        "search.query": query,
        "search.results_count": resultsCount,
        "user.session_id": this._getSessionId(),
      },
    });
    span.end();
  }

  /**
   * Track Core Web Vitals
   */
  trackWebVital(name, value, rating) {
    const span = this.tracer.startSpan("web.vital", {
      attributes: {
        "vital.name": name,
        "vital.value": value,
        "vital.rating": rating,
        "page.path": window.location.pathname,
      },
    });
    span.end();
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
}

/**
 * Setup Core Web Vitals tracking
 */
export function setupWebVitalsTracking(educationTracer) {
  // Track Largest Contentful Paint (LCP)
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "largest-contentful-paint") {
        const value = entry.renderTime || entry.loadTime;
        const rating =
          value < 2500 ? "good" : value < 4000 ? "needs-improvement" : "poor";
        educationTracer.trackWebVital("LCP", value, rating);
      }
    }
  });

  try {
    observer.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
    console.warn("LCP observation not supported");
  }

  // Track First Input Delay (FID)
  const fidObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const value = entry.processingStart - entry.startTime;
      const rating =
        value < 100 ? "good" : value < 300 ? "needs-improvement" : "poor";
      educationTracer.trackWebVital("FID", value, rating);
    }
  });

  try {
    fidObserver.observe({ type: "first-input", buffered: true });
  } catch (e) {
    console.warn("FID observation not supported");
  }

  // Track Cumulative Layout Shift (CLS)
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    }
  });

  try {
    clsObserver.observe({ type: "layout-shift", buffered: true });

    // Report CLS when page is hidden
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        const rating =
          clsValue < 0.1
            ? "good"
            : clsValue < 0.25
            ? "needs-improvement"
            : "poor";
        educationTracer.trackWebVital("CLS", clsValue, rating);
      }
    });
  } catch (e) {
    console.warn("CLS observation not supported");
  }
}

// Export singleton instance
let educationTracer = null;

export function getEducationTracer() {
  if (!educationTracer) {
    const tracer = initTracing();
    educationTracer = new EducationTracer(tracer);
    setupWebVitalsTracking(educationTracer);
  }
  return educationTracer;
}
