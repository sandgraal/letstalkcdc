// Web Vitals Dashboard
// Real-time performance monitoring display

export function createWebVitalsDashboard() {
  const dashboard = document.createElement("div");
  dashboard.id = "web-vitals-dashboard";
  dashboard.className = "web-vitals-dashboard";
  dashboard.innerHTML = `
    <div class="vitals-header">
      <h3>⚡ Performance Vitals</h3>
      <button class="vitals-close" aria-label="Close dashboard">×</button>
    </div>
    <div class="vitals-metrics">
      <div class="vital-metric" data-vital="lcp">
        <div class="vital-label">LCP</div>
        <div class="vital-value">—</div>
        <div class="vital-description">Largest Contentful Paint</div>
        <div class="vital-target">Target: &lt; 2.5s</div>
      </div>
      <div class="vital-metric" data-vital="fid">
        <div class="vital-label">FID</div>
        <div class="vital-value">—</div>
        <div class="vital-description">First Input Delay</div>
        <div class="vital-target">Target: &lt; 100ms</div>
      </div>
      <div class="vital-metric" data-vital="cls">
        <div class="vital-label">CLS</div>
        <div class="vital-value">—</div>
        <div class="vital-description">Cumulative Layout Shift</div>
        <div class="vital-target">Target: &lt; 0.1</div>
      </div>
    </div>
    <div class="vitals-footer">
      <small>Collected on this page load</small>
    </div>
  `;

  // Close button
  const closeBtn = dashboard.querySelector(".vitals-close");
  closeBtn.addEventListener("click", () => {
    dashboard.remove();
    localStorage.setItem("webVitalsDashboardClosed", "true");
  });

  // Add to page
  document.body.appendChild(dashboard);

  return {
    update(metric, value, rating) {
      const metricEl = dashboard.querySelector(
        `[data-vital="${metric.toLowerCase()}"]`
      );
      if (!metricEl) return;

      const valueEl = metricEl.querySelector(".vital-value");
      const formattedValue =
        metric === "CLS" ? value.toFixed(3) : `${value.toFixed(0)}ms`;

      valueEl.textContent = formattedValue;
      metricEl.classList.remove("good", "needs-improvement", "poor");
      metricEl.classList.add(rating);

      // Add rating indicator
      const ratingIcons = {
        good: "✓",
        "needs-improvement": "⚠",
        poor: "✗",
      };
      valueEl.setAttribute("data-rating", ratingIcons[rating]);
    },

    show() {
      dashboard.style.display = "block";
    },

    hide() {
      dashboard.style.display = "none";
    },

    remove() {
      dashboard.remove();
    },
  };
}

// Initialize dashboard only in development or when explicitly enabled
export function initWebVitalsDashboard() {
  // Skip if user closed it before
  if (localStorage.getItem("webVitalsDashboardClosed") === "true") {
    console.log("[vitals] Dashboard dismissed by user");
    return null;
  }

  // Only show in development or when ?vitals=1 query param present
  const isDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const forceShow =
    new URLSearchParams(window.location.search).get("vitals") === "1";

  if (!isDev && !forceShow) {
    console.log(
      "[vitals] Dashboard disabled in production (use ?vitals=1 to enable)"
    );
    return null;
  }

  console.log("[vitals] Creating dashboard...");
  return createWebVitalsDashboard();
}

// Auto-initialize and connect to tracer
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    const dashboard = initWebVitalsDashboard();

    if (dashboard && window.educationTracer) {
      // Hook into tracer's Web Vitals tracking
      const originalTrackWebVital = window.educationTracer.trackWebVital;

      window.educationTracer.trackWebVital = function (name, value, rating) {
        // Call original method
        originalTrackWebVital.call(this, name, value, rating);

        // Update dashboard
        dashboard.update(name, value, rating);
      };

      console.log("[vitals] ✓ Dashboard connected to tracer");
    }
  });
}
