(() => {
  const root = document.documentElement;
  const themeSession = root.dataset.themeSession;
  const defaultTheme = root.dataset.themeDefault === "light" ? "light" : "dark";
  const storageKey = themeSession ? `portfolio-theme:${themeSession}` : "portfolio-theme";
  const getStorage = () => themeSession ? sessionStorage : localStorage;
  let theme = defaultTheme;

  try {
    const saved = getStorage().getItem(storageKey);
    if (saved === "dark" || saved === "light") theme = saved;
  } catch {
    // The switch still works when browser storage is unavailable.
  }

  root.dataset.theme = theme;

  function syncButton(button) {
    const label = root.lang === "es"
      ? (theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro")
      : (theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
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
        getStorage().setItem(storageKey, theme);
      } catch {
        // Theme persistence is optional.
      }
      window.dispatchEvent(new CustomEvent("portfolio:themechange"));
    });
  }, { once: true });
})();
