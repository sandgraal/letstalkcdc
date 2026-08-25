// Style-guide theme toggle (standalone, no bundler). Flips data-theme on
// the root so a reviewer can preview both themes; default (no attribute)
// follows the OS via the stylesheet's prefers-color-scheme block.
const root = document.documentElement;
const btn = document.getElementById("sg-theme");

if (btn) {
  const sysDark = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  // aria-pressed reflects whether the LIGHT theme is currently active.
  const isLight = () => {
    const cur = root.getAttribute("data-theme");
    return cur ? cur === "light" : !sysDark();
  };
  const syncPressed = () =>
    btn.setAttribute("aria-pressed", isLight() ? "true" : "false");

  // Sync on load so the control's state is correct before any click
  // (e.g. OS prefers light with no data-theme set).
  syncPressed();

  btn.addEventListener("click", () => {
    root.setAttribute("data-theme", isLight() ? "dark" : "light");
    syncPressed();
  });
}
