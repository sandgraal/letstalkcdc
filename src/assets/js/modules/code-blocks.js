/**
 * Code Blocks Module
 * Handles legacy code copy buttons and enhanced code block wrappers
 * with language labels, copy functionality, and toast notifications.
 *
 * @module code-blocks
 * @exports {function} initCodeBlocks - Initialize code block enhancements
 * @exports {function} initHeadingAnchors - Add anchor links to headings
 */

const doc = document;

/**
 * Add anchor links to prose headings (h2, h3) for deep linking.
 */
const initHeadingAnchors = () => {
  doc.querySelectorAll(".prose h2, .prose h3").forEach((heading) => {
    const slug =
      heading.id ||
      heading.textContent
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-");
    heading.id = slug;
    if (heading.querySelector(".anchor")) return;
    const anchor = Object.assign(doc.createElement("a"), {
      href: `#${slug}`,
      className: "anchor",
      ariaLabel: "Link to section",
    });
    heading.appendChild(anchor);
  });
};

/**
 * Initialize legacy code copy buttons on pre > code elements.
 * Adds a "Copy" button to code blocks that don't already have one.
 *
 * @param {object} tracer - OpenTelemetry education tracer instance
 */
const initLegacyCopyButtons = (tracer) => {
  doc.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;

    // Skip if already enhanced by the wrapper system
    if (pre.closest(".code-block-wrapper")) return;

    let button = pre.querySelector(".copy-btn, .copy-snippet");
    if (!button) {
      button = Object.assign(doc.createElement("button"), {
        textContent: "Copy",
        className: "copy-snippet",
        type: "button",
      });
      pre.style.position = "relative";
      pre.appendChild(button);
    }

    const restore = (label) => {
      setTimeout(() => {
        button.textContent = label;
      }, 1200);
    };

    const label = button.textContent;

    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.innerText);
        button.textContent = "Copied!";
        restore(label);

        try {
          const codeId = pre.id || code.className || "unnamed-code-block";
          tracer.trackInteraction("code-copy", codeId, true);
        } catch (error) {
          console.debug("Code copy tracking failed:", error);
        }
      } catch (_) {
        button.textContent = "Failed";
        restore(label);
      }
    });
  });
};

/**
 * Enhance code blocks by wrapping them with a header containing
 * language label and copy button. Uses toast notifications on copy.
 *
 * @param {object} tracer - OpenTelemetry education tracer instance
 */
const enhanceCodeBlocks = (tracer) => {
  const codeBlocks = doc.querySelectorAll("pre > code");

  codeBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;

    // Skip if already enhanced
    if (pre.closest(".code-block-wrapper")) return;

    // Detect language from class (e.g., language-javascript)
    const languageClass = Array.from(codeBlock.classList).find((cls) =>
      cls.startsWith("language-"),
    );
    const language = languageClass
      ? languageClass.replace("language-", "").toUpperCase()
      : "CODE";

    // Create wrapper
    const wrapper = doc.createElement("div");
    wrapper.className = "code-block-wrapper";

    // Create header
    const header = doc.createElement("div");
    header.className = "code-block-header";

    const languageLabel = doc.createElement("span");
    languageLabel.className = "code-block-language";
    languageLabel.textContent = language;

    const copyButton = doc.createElement("button");
    copyButton.className = "code-copy-button";
    copyButton.textContent = "Copy";
    copyButton.type = "button";
    copyButton.setAttribute("aria-label", `Copy ${language} code`);

    header.appendChild(languageLabel);
    header.appendChild(copyButton);

    // Wrap the pre element
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    // Add copy functionality
    copyButton.addEventListener("click", async () => {
      const code = codeBlock.textContent;

      try {
        await navigator.clipboard.writeText(code);
        copyButton.textContent = "Copied!";
        copyButton.setAttribute("data-copied", "true");

        if (window.showToast) {
          window.showToast({
            title: "Code copied!",
            message: `${language} code copied to clipboard`,
            type: "success",
            duration: 2000,
          });
        }

        try {
          const blockId = `code-${language.toLowerCase()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          tracer.trackInteraction("code-copy", blockId, true);
        } catch (error) {
          console.debug("Code copy tracking failed:", error);
        }

        setTimeout(() => {
          copyButton.textContent = "Copy";
          copyButton.removeAttribute("data-copied");
        }, 2000);
      } catch (error) {
        console.error("Failed to copy code:", error);
        copyButton.textContent = "Failed";

        if (window.showToast) {
          window.showToast({
            title: "Copy failed",
            message: "Unable to copy code to clipboard",
            type: "error",
            duration: 3000,
          });
        }

        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 2000);
      }
    });
  });
};

/**
 * Initialize all code block enhancements: heading anchors, legacy copy
 * buttons, and enhanced code block wrappers.
 *
 * @param {object} tracer - OpenTelemetry education tracer instance
 */
const initCodeBlocks = (tracer) => {
  initHeadingAnchors();
  initLegacyCopyButtons(tracer);
  enhanceCodeBlocks(tracer);
};

export { initCodeBlocks, initHeadingAnchors };
