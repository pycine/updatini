/* Theme switching for Updatini.
 *
 * The initial theme is set by a tiny inline script in each document's <head>
 * so the page never paints in the wrong palette. This file adds the toggle,
 * persists the choice, updates the browser chrome colour, and follows the
 * system preference until the visitor picks a theme explicitly.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "updatini-theme";
  const root = document.documentElement;
  const buttons = Array.from(document.querySelectorAll("[data-theme-toggle]"));
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const systemLight = window.matchMedia("(prefers-color-scheme: light)");

  const readStored = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  };

  const store = (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private mode / storage disabled */
    }
  };

  const updateUI = (theme) => {
    const nextLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    buttons.forEach((button) => {
      button.setAttribute("aria-label", nextLabel);
      button.setAttribute("title", nextLabel);
    });
    if (themeColor) {
      themeColor.setAttribute("content", theme === "light" ? "#eef2f4" : "#050a0e");
    }
  };

  const commit = (theme) => {
    root.dataset.theme = theme;
    updateUI(theme);
  };

  const setTheme = (theme, { persist = false, animate = false } = {}) => {
    if (persist) store(theme);

    if (animate && !reducedMotion.matches && typeof document.startViewTransition === "function") {
      try {
        document.startViewTransition(() => commit(theme));
        return;
      } catch {
        /* fall through to an instant switch */
      }
    }
    commit(theme);
  };

  const toggle = () => {
    setTheme(root.dataset.theme === "light" ? "dark" : "light", {
      persist: true,
      animate: true,
    });
  };

  buttons.forEach((button) => button.addEventListener("click", toggle));

  // If the visitor has not chosen a side, follow the OS while the page is open.
  const onSystemChange = (event) => {
    if (readStored()) return;
    setTheme(event.matches ? "light" : "dark");
  };
  if (typeof systemLight.addEventListener === "function") {
    systemLight.addEventListener("change", onSystemChange);
  } else if (typeof systemLight.addListener === "function") {
    systemLight.addListener(onSystemChange);
  }

  // Keep other tabs in sync.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    if (event.newValue === "light" || event.newValue === "dark") {
      commit(event.newValue);
    }
  });

  const current = root.dataset.theme === "light" ? "light" : root.dataset.theme === "dark" ? "dark" : null;
  if (current) {
    updateUI(current);
  } else {
    commit(readStored() || (systemLight.matches ? "light" : "dark"));
  }
})();
