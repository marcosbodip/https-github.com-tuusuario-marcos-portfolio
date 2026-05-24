(() => {
  const loader = document.querySelector("[data-index-loader]");

  if (!loader) {
    document.body.classList.remove("is-index-loading");
    window.PORTFOLIO_INDEX_LOADER = {
      register() {},
      ready() {}
    };
    return;
  }

  const state = {
    items: new Map(),
    ready: false,
    hidden: false,
    maxItems: window.innerWidth <= 760 ? 2 : 6
  };

  function setProgress(value) {
    loader.style.setProperty("--loader-progress", Math.max(0.04, Math.min(value, 1)).toFixed(3));
  }

  function getAverageProgress() {
    if (!state.items.size) {
      return state.ready ? 1 : 0.04;
    }

    let total = 0;
    state.items.forEach((value) => {
      total += value;
    });

    return total / state.items.size;
  }

  function hideLoader() {
    if (state.hidden || !state.ready) {
      return;
    }

    const progress = getAverageProgress();

    if (state.items.size && progress < 0.88) {
      return;
    }

    state.hidden = true;
    setProgress(1);
    loader.setAttribute("aria-hidden", "true");
    loader.style.pointerEvents = "none";

    document.body.classList.remove("is-index-loading");
    document.body.classList.add("is-index-loaded");
    window.dispatchEvent(new CustomEvent("portfolio:index-loader-hidden"));
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("portfolio:index-loader-hidden"));
    });
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("portfolio:index-loader-hidden"));
    }, 320);
    loader.addEventListener("transitionend", () => loader.remove(), { once: true });
    window.setTimeout(() => loader.remove(), 700);
  }

  function updateItem(media, value) {
    if (!state.items.has(media) || state.hidden) {
      return;
    }

    state.items.set(media, Math.max(state.items.get(media), value));
    setProgress(getAverageProgress());
    hideLoader();
  }

  function registerVideo(video) {
    video.preload = "auto";
    window.PORTFOLIO_MEDIA_LAZY?.load(video);

    const requestAutoplay = () => {
      if (video.dataset.lazyAutoplay === "true") {
        window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(video);
      }
    };

    requestAutoplay();

    if (video.readyState >= 3) {
      updateItem(video, 1);
      requestAutoplay();
      return;
    }

    if (video.readyState >= 1) {
      updateItem(video, 0.42);
    }

    video.addEventListener("loadedmetadata", () => updateItem(video, 0.42), { once: true });
    video.addEventListener("loadeddata", () => {
      updateItem(video, 0.72);
      requestAutoplay();
    }, { once: true });
    video.addEventListener("canplay", () => {
      updateItem(video, 1);
      requestAutoplay();
    }, { once: true });
    video.addEventListener("error", () => updateItem(video, 1), { once: true });
    video.addEventListener("progress", () => {
      if (!video.duration || !video.buffered.length) {
        updateItem(video, 0.34);
        return;
      }

      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const bufferedRatio = Math.min(bufferedEnd / video.duration, 1);
      updateItem(video, 0.42 + bufferedRatio * 0.46);
    });
  }

  function registerImage(image) {
    if (image.complete && image.naturalWidth) {
      updateItem(image, 1);
      return;
    }

    image.addEventListener("load", () => updateItem(image, 1), { once: true });
    image.addEventListener("error", () => updateItem(image, 1), { once: true });
  }

  function register(media) {
    if (!media || state.items.size >= state.maxItems || state.hidden) {
      return;
    }

    state.items.set(media, 0.04);

    if (media.tagName === "VIDEO") {
      registerVideo(media);
    } else {
      registerImage(media);
    }

    setProgress(getAverageProgress());
  }

  function ready() {
    state.ready = true;

    if (!state.items.size) {
      setProgress(1);
    }

    hideLoader();
  }

  window.PORTFOLIO_INDEX_LOADER = {
    register,
    ready
  };

  setProgress(0.04);

  window.setTimeout(() => {
    if (!state.hidden) {
      state.ready = true;
      state.items.forEach((value, media) => {
        if (value < 0.88) {
          state.items.set(media, 0.88);
        }
      });
      setProgress(getAverageProgress());
      hideLoader();
    }
  }, 12000);
})();
