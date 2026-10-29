(() => {
  const root = document.documentElement;
  const storageKey = "portfolio-theme";
  let theme = "dark";

  try {
    theme = localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch {
    // The switch still works when browser storage is unavailable.
  }

  root.dataset.theme = theme;

  function syncButton(button) {
    const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", String(theme === "light"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector("[data-theme-toggle]");
    if (!button) return;

    syncButton(button);
    button.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      root.dataset.theme = theme;
      syncButton(button);
      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        // Theme persistence is optional.
      }
      window.dispatchEvent(new CustomEvent("portfolio:themechange"));
    });
  }, { once: true });
})();
