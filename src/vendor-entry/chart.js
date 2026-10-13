/**
 * Chart.js entry for the Vite build (P17-23).
 *
 * Built as its own hashed chunk and imported lazily by src/scripts/dashboard.js
 * (via the URL in <meta name="cdc-vendor-chart">), so pages without a chart
 * never download it. Registers every controller, element and scale the
 * dashboard may use.
 */
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

export { Chart, registerables };
