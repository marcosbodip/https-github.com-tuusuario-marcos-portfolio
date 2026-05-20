(() => {
  const loader = document.querySelector("[data-index-loader]");

  if (!loader) {
    return;
  }

  const state = {
    items: [],
    loaded: 0,
    ready: false,
    hidden: false,
    minDone: false
  };
  const maxTrackedItems = 9;
  const minVisibleTime = 5000;
  const maxVisibleTime = 7600;

  function setProgress(value) {
    loader.style.setProperty("--loader-progress", Math.max(0.08, Math.min(value, 1)).toFixed(3));
  }

  function hideLoader() {
    if (state.hidden || !state.ready || !state.minDone) {
      return;
    }

    const target = Math.max(1, Math.min(state.items.length, maxTrackedItems));

    if (target && state.loaded < Math.ceil(target * 0.72)) {
      return;
    }

    state.hidden = true;
    setProgress(1);
    document.body.classList.remove("is-index-loading");
    document.body.classList.add("is-index-loaded");
    loader.addEventListener("transitionend", () => loader.remove(), { once: true });
  }

  function markLoaded() {
    state.loaded += 1;
    const target = Math.max(1, Math.min(state.items.length || maxTrackedItems, maxTrackedItems));
    setProgress(state.loaded / target);
    hideLoader();
  }

  function register(media) {
    if (!media || state.items.length >= maxTrackedItems) {
      return;
    }

    state.items.push(media);

    if (media.tagName === "VIDEO") {
      if (media.readyState >= 1) {
        markLoaded();
        return;
      }

      media.addEventListener("loadedmetadata", markLoaded, { once: true });
      media.addEventListener("error", markLoaded, { once: true });
      return;
    }

    if (media.complete) {
      markLoaded();
      return;
    }

    media.addEventListener("load", markLoaded, { once: true });
    media.addEventListener("error", markLoaded, { once: true });
  }

  function ready() {
    state.ready = true;

    if (!state.items.length) {
      markLoaded();
    }

    hideLoader();
  }

  window.PORTFOLIO_INDEX_LOADER = {
    register,
    ready
  };

  setProgress(0.08);

  window.setTimeout(() => {
    state.minDone = true;
    hideLoader();
  }, minVisibleTime);

  window.setTimeout(() => {
    state.loaded = Math.max(state.loaded, Math.ceil(Math.min(state.items.length || maxTrackedItems, maxTrackedItems) * 0.72));
    state.ready = true;
    state.minDone = true;
    hideLoader();
  }, maxVisibleTime);
})();
