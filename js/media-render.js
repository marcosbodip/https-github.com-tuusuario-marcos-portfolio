const portfolioLazyMedia = (() => {
  const loadedMedia = new WeakSet();
  const visibleMedia = new WeakSet();

  function prepareAutoplayVideo(video) {
    video.autoplay = true;
    video.defaultMuted = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.removeAttribute("controls");
  }

  function playVideo(video) {
    prepareAutoplayVideo(video);
    const playAttempt = video.play();

    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {});
    }
  }

  function requestVideoAutoplay(video) {
    video.preload = "auto";
    playVideo(video);

    if (video.readyState >= 2) {
      return;
    }

    const playWhenReady = () => playVideo(video);

    video.addEventListener("loadedmetadata", playWhenReady, { once: true });
    video.addEventListener("canplay", playWhenReady, { once: true });
  }

  function load(media, options = {}) {
    if (!media || loadedMedia.has(media)) {
      return media;
    }

    const src = media.dataset.src;

    if (src) {
      media.src = src;
      media.removeAttribute("data-src");
    }

    loadedMedia.add(media);
    media.load?.();

    if (
      options.autoplay !== false &&
      media.tagName === "VIDEO" &&
      media.dataset.lazyAutoplay === "true" &&
      visibleMedia.has(media)
    ) {
      requestVideoAutoplay(media);
    }

    return media;
  }

  function shouldLoadMedia(media) {
    const carousel = media.closest(".project-media-carousel");

    if (!carousel) {
      return true;
    }

    if (media.tagName !== "VIDEO" && media.dataset.lazyCarousel !== "true") {
      return true;
    }

    const item = media.closest(".project-media-item");

    return Boolean(item?.classList.contains("is-active") || item?.classList.contains("is-hovered"));
  }

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const media = entry.target;

        if (entry.isIntersecting) {
          visibleMedia.add(media);

          if (!shouldLoadMedia(media)) {
            return;
          }

          load(media);

          if (media.tagName === "VIDEO" && media.dataset.lazyAutoplay === "true") {
            requestVideoAutoplay(media);
          }

          return;
        }

        visibleMedia.delete(media);

        if (media.tagName === "VIDEO" && !media.closest(".project-media-carousel")) {
          media.pause();
        }
      });
    }, {
      rootMargin: "180px 0px",
      threshold: 0.01
    })
    : null;

  function observe(media) {
    if (!media) {
      return;
    }

    if (!observer) {
      load(media);
      return;
    }

    observer.observe(media);
  }

  return { load, observe, prepareAutoplayVideo, requestVideoAutoplay };
})();

window.PORTFOLIO_MEDIA_LAZY = portfolioLazyMedia;

function createMediaElement(media, basePath, className = "", options = {}) {
  const mediaPath = media.previewUrl || `${basePath}/${media.file}`;

  if (media.type === "video" || /\.(mp4|webm|mov)$/i.test(media.file)) {
    const video = document.createElement("video");
    video.className = className;
    video.dataset.src = mediaPath;
    video.dataset.lazyAutoplay = "true";
    portfolioLazyMedia.prepareAutoplayVideo(video);
    video.preload = "none";
    video.setAttribute("aria-label", media.alt || "");

    if (!options.deferObserve) {
      portfolioLazyMedia.observe(video);
    }

    return video;
  }

  const img = document.createElement("img");
  const isGif = /\.gif$/i.test(mediaPath);
  img.className = className;
  img.alt = media.alt || "";
  img.loading = "lazy";
  img.decoding = "async";

  if (isGif) {
    img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    img.dataset.src = mediaPath;
    img.dataset.lazyCarousel = "true";

    if (!options.deferObserve) {
      portfolioLazyMedia.observe(img);
    }
  } else {
    img.src = mediaPath;
  }

  return img;
}

function getMediaRatioClass(media) {
  const ratio = media.ratio;

  if (!ratio) {
    return "";
  }

  if (ratio === "full-row") {
    return "project-media-full-row";
  }

  return `project-media-${ratio}`;
}
