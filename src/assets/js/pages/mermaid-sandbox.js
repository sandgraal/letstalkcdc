import { getMermaidScript } from "../utils/vendor-scripts.js";

const doc = document;

const loadScript = (src, integrity) =>
  new Promise((resolve, reject) => {
    const existing = [...doc.scripts].find((s) => s.src === src);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      if (existing.dataset.loaded === "true") {
        resolve();
      }
      return;
    }
    const script = doc.createElement("script");
    script.src = src;
    script.setAttribute("integrity", integrity);
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () =>
      reject(new Error(`Failed to load ${src}`)),
    );
    doc.head.appendChild(script);
  });

const initMermaid = async () => {
  if (!window.mermaid) {
    const mermaidScript = getMermaidScript();
    if (!mermaidScript) return;
    await loadScript(mermaidScript.src, mermaidScript.integrity);
  }
  const mermaid = window.mermaid;
  if (!mermaid) return;

  const hash = (location.hash || "").slice(1);
  const definitions = {
    outbox: `
        sequenceDiagram
          autonumber
          participant App as App Service
          participant DB as OLTP DB
          participant OB as Outbox Table
          participant Bus as Event Bus
          participant Sink as Consumer

          App->>DB: BEGIN TX
          App->>DB: UPDATE domain rows
          App->>OB: INSERT event record
          DB-->>App: COMMIT
          OB-->>Bus: Outbox relay publishes
          Bus-->>Sink: Consume and apply (idempotent)
      `,
  };

  const node = doc.querySelector(".mermaid");
  if (!node) return;
  if (hash && definitions[hash]) {
    node.textContent = definitions[hash];
  }

  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
    });
    mermaid.run({ querySelector: ".mermaid" });
  } catch (error) {
    node.outerHTML = `<pre class="error">${String(error && error.stack ? error.stack : error)}</pre>`;
  }
};

if (doc.readyState === "loading") {
  doc.addEventListener("DOMContentLoaded", initMermaid, { once: true });
} else {
  initMermaid();
}
