// Style-guide theme toggle (standalone, no bundler). Flips data-theme on
// the root so a reviewer can preview both themes; default (no attribute)
// follows the OS via the stylesheet's prefers-color-scheme block.
const root = document.documentElement;
const btn = document.getElementById("sg-theme");

if (btn) {
  const sysDark = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  btn.addEventListener("click", () => {
    const cur = root.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : sysDark();
    const next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
  });
}
