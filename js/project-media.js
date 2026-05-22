const pausedByGalleryHover = new Set();
const desktopMaxHoverScale = 1.28;
const viewportMargin = 32;

function playVideo(video) {
  window.PORTFOLIO_MEDIA_LAZY?.load(video);
  window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(video);
}

function pauseVideosAround(activeItem, grid) {
  const videos = grid.querySelectorAll(".project-media-item video");

  videos.forEach((video) => {
    if (activeItem.contains(video)) {
      if (pausedByGalleryHover.has(video)) {
        playVideo(video);
        pausedByGalleryHover.delete(video);
      }

      return;
    }

    if (!video.paused) {
      video.pause();
      pausedByGalleryHover.add(video);
    }
  });
}

function resumeGalleryVideos(grid) {
  const videos = grid.querySelectorAll(".project-media-item video");

  videos.forEach((video) => {
    if (pausedByGalleryHover.has(video)) {
      playVideo(video);
      pausedByGalleryHover.delete(video);
    }
  });
}

function classifyMediaItem(item) {
  const media = item.querySelector("img, video");

  if (!media) {
    return;
  }

  const applyClass = () => {
    const width = media.videoWidth || media.naturalWidth;
    const height = media.videoHeight || media.naturalHeight;

    if (!width || !height) {
      return;
    }

    const ratio = width / height;

    item.classList.remove(
      "project-media-auto-ultrawide",
      "project-media-auto-wide",
      "project-media-auto-square",
      "project-media-auto-portrait"
    );

    if (ratio >= 2.1) {
      item.classList.add("project-media-auto-ultrawide");
    } else if (ratio >= 1.25) {
      item.classList.add("project-media-auto-wide");
    } else if (ratio >= 0.8) {
      item.classList.add("project-media-auto-square");
    } else {
      item.classList.add("project-media-auto-portrait");
    }
  };

  if (media.tagName === "VIDEO") {
    if (media.readyState >= 1) {
      applyClass();
    } else {
      media.addEventListener("loadedmetadata", applyClass, { once: true });
    }
  } else if (media.complete && media.naturalWidth) {
    applyClass();
  } else {
    media.addEventListener("load", applyClass, { once: true });
  }
}

function setupProjectVideoPoster(video) {
  const item = video?.closest(".project-media-item");

  if (!video || !item || item.querySelector(".project-video-poster")) {
    return;
  }

  const poster = document.createElement("div");
  poster.className = "project-video-poster";
  poster.setAttribute("aria-hidden", "true");
  item.append(poster);

  let hasPlayed = false;
  const showPoster = () => poster.classList.remove("is-hidden");
  const hidePoster = () => poster.classList.add("is-hidden");
  const showPosterBeforePlayback = () => {
    if (!hasPlayed) {
      showPoster();
    }
  };

  const capturePosterFrame = () => {
    if (!video.videoWidth || !video.videoHeight || poster.dataset.posterReady === "true") {
      return;
    }

    const maxPosterWidth = 420;
    const scale = Math.min(1, maxPosterWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    try {
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      poster.style.backgroundImage = `url("${canvas.toDataURL("image/jpeg", 0.58)}")`;
      poster.dataset.posterReady = "true";
    } catch {}
  };

  showPoster();
  video.addEventListener("loadeddata", capturePosterFrame, { once: true });
  video.addEventListener("canplay", capturePosterFrame, { once: true });
  video.addEventListener("playing", () => {
    hasPlayed = true;
    hidePoster();
  });
  video.addEventListener("pause", showPosterBeforePlayback);
  video.addEventListener("waiting", showPosterBeforePlayback);
  video.addEventListener("stalled", showPosterBeforePlayback);
  video.addEventListener("emptied", showPosterBeforePlayback);
  video.addEventListener("error", showPoster);
}

function getResponsiveMaxHoverScale() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  let scale = desktopMaxHoverScale;

  if (width <= 1024) {
    scale = 1.08;
  } else if (width <= 1280) {
    scale = 1.14;
  } else if (width <= 1440) {
    scale = 1.18;
  } else if (width <= 1600) {
    scale = 1.22;
  }

  if (height <= 680) {
    scale = Math.min(scale, 1.06);
  } else if (height <= 760) {
    scale = Math.min(scale, 1.12);
  } else if (height <= 900) {
    scale = Math.min(scale, 1.18);
  }

  return scale;
}

function updateHoverScale(item) {
  const media = item.querySelector("img, video");

  if (!media) {
    item.style.setProperty("--hover-scale", getResponsiveMaxHoverScale());
    return;
  }

  const rect = media.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const availableWidthAroundMedia = 2 * Math.min(centerX, window.innerWidth - centerX) - viewportMargin;
  const availableHeightAroundMedia = 2 * Math.min(centerY, window.innerHeight - centerY) - viewportMargin;
  const responsiveMaxScale = getResponsiveMaxHoverScale();
  const maxScaledHeight = Math.min(window.innerHeight - viewportMargin, availableHeightAroundMedia);
  const maxScaledWidth = Math.min(window.innerWidth - viewportMargin, availableWidthAroundMedia);
  const scale = Math.min(
    responsiveMaxScale,
    maxScaledHeight / rect.height,
    maxScaledWidth / rect.width
  );

  item.style.setProperty("--hover-scale", Math.max(1, scale).toFixed(3));
}

const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const mobileCarouselLayout = window.matchMedia("(max-width: 860px)");
const edgeAutoScroll = {
  frame: null,
  speed: 0
};
let activeProjectMediaDetail = null;

function isMobileCarouselLayout() {
  return mobileCarouselLayout.matches;
}

function shouldUseMobileProjectMediaDetail() {
  return isMobileCarouselLayout() && Boolean(document.querySelector(".project-page"));
}

function getMediaRatio(media) {
  const width = media.videoWidth || media.naturalWidth;
  const height = media.videoHeight || media.naturalHeight;

  if (width && height) {
    return width / height;
  }

  const rect = media.getBoundingClientRect();

  if (rect.width && rect.height) {
    return rect.width / rect.height;
  }

  const item = media.closest(".project-media-item");

  if (item?.classList.contains("project-media-portrait") || item?.classList.contains("project-media-auto-portrait")) {
    return 0.72;
  }

  if (item?.classList.contains("project-media-square") || item?.classList.contains("project-media-auto-square")) {
    return 1;
  }

  return 1.6;
}

function getDetailVideoSource(video) {
  const desktopSource = video.dataset.desktopSrc || "";
  const currentSource = video.currentSrc || video.src || "";
  const defaultSource = currentSource || video.dataset.src || video.dataset.mobileSrc || desktopSource;
  const targetPixels = window.innerWidth * (window.devicePixelRatio || 1);

  if (desktopSource && targetPixels >= 1180) {
    return desktopSource;
  }

  return defaultSource;
}

function getCapturedPosterSource(video) {
  const poster = video.closest(".project-media-item")?.querySelector(".project-video-poster");
  const background = poster ? window.getComputedStyle(poster).backgroundImage : "";
  const match = background.match(/^url\(["']?(.+?)["']?\)$/);

  return match?.[1] || "";
}

function createProjectMediaDetailAsset(media, frame) {
  const ratio = getMediaRatio(media);
  frame.classList.toggle("is-portrait", ratio < 0.88);

  if (media.tagName === "VIDEO") {
    const video = document.createElement("video");
    const poster = media.poster || media.dataset.posterSrc || getCapturedPosterSource(media);

    video.className = "project-media-detail-asset";
    video.src = getDetailVideoSource(media);
    video.preload = "auto";
    video.controls = false;

    if (poster) {
      video.poster = poster;
    }

    if (media.dataset.loopTrim) {
      video.dataset.loopTrim = media.dataset.loopTrim;
    }

    window.PORTFOLIO_MEDIA_LAZY?.prepareAutoplayVideo(video);
    return video;
  }

  window.PORTFOLIO_MEDIA_LAZY?.load(media, { autoplay: false });

  const image = document.createElement("img");
  image.className = "project-media-detail-asset";
  image.alt = media.alt || "";
  image.decoding = "async";
  image.src = media.currentSrc || media.src || media.dataset.src || "";
  return image;
}

function playProjectMediaDetailAsset(asset) {
  if (asset.tagName !== "VIDEO") {
    return;
  }

  window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(asset);
  const playAttempt = asset.play();

  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {});
  }
}

function closeProjectMediaDetail() {
  const detail = activeProjectMediaDetail;

  if (!detail) {
    return;
  }

  activeProjectMediaDetail = null;
  detail.overlay.classList.remove("is-open");
  document.body.classList.remove("is-project-media-detail-open");
  document.removeEventListener("keydown", detail.handleKeydown);

  let didRemove = false;
  const removeDetail = () => {
    if (didRemove) {
      return;
    }

    didRemove = true;
    detail.asset.pause?.();
    detail.overlay.remove();

    if (detail.shouldResumeSource) {
      playVideo(detail.sourceMedia);
    }

    scheduleMobileProjectVideoSync();
  };

  detail.overlay.addEventListener("transitionend", removeDetail, { once: true });
  window.setTimeout(removeDetail, 560);
}

function openProjectMediaDetail(sourceMedia) {
  if (activeProjectMediaDetail) {
    closeProjectMediaDetail();
  }

  const overlay = document.createElement("div");
  const frame = document.createElement("div");
  const closeButton = document.createElement("button");
  const asset = createProjectMediaDetailAsset(sourceMedia, frame);
  const shouldResumeSource = sourceMedia.tagName === "VIDEO" && !sourceMedia.paused && !sourceMedia.ended;

  overlay.className = "project-media-detail";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  frame.className = `project-media-detail-frame${frame.classList.contains("is-portrait") ? " is-portrait" : ""}`;

  closeButton.className = "project-media-detail-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close media");

  if (sourceMedia.tagName === "VIDEO") {
    sourceMedia.pause();
  }

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      closeProjectMediaDetail();
    }
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeProjectMediaDetail();
    }
  });
  frame.addEventListener("click", (event) => event.stopPropagation());
  closeButton.addEventListener("click", closeProjectMediaDetail);
  document.addEventListener("keydown", handleKeydown);

  frame.append(asset);
  overlay.append(closeButton, frame);
  document.body.append(overlay);
  document.body.classList.add("is-project-media-detail-open");

  activeProjectMediaDetail = {
    asset,
    handleKeydown,
    overlay,
    shouldResumeSource,
    sourceMedia
  };

  window.requestAnimationFrame(() => overlay.classList.add("is-open"));
  playProjectMediaDetailAsset(asset);
}

function setupMobileProjectMediaDetail() {
  document.addEventListener("click", (event) => {
    if (!shouldUseMobileProjectMediaDetail() || event.defaultPrevented) {
      return;
    }

    const media = event.target.closest(".project-media-item img, .project-media-item video");

    if (!media) {
      return;
    }

    event.preventDefault();
    openProjectMediaDetail(media);
  });
}

function isElementNearViewport(element, before = 260, after = 420) {
  const rect = element.getBoundingClientRect();

  return rect.bottom >= -before && rect.top <= window.innerHeight + after;
}

function getElementVisibleRatio(element) {
  const rect = element.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;

  if (!area) {
    return 0;
  }

  return (visibleWidth * visibleHeight) / area;
}

function getElementCenterDistance(element) {
  const rect = element.getBoundingClientRect();
  const center = rect.top + rect.height / 2;

  return Math.abs(center - window.innerHeight / 2);
}

function stopEdgeAutoScroll() {
  edgeAutoScroll.speed = 0;

  if (edgeAutoScroll.frame) {
    cancelAnimationFrame(edgeAutoScroll.frame);
    edgeAutoScroll.frame = null;
  }
}

function getEdgeAutoScrollSpeed(clientY) {
  if (document.body.classList.contains("is-carousel-viewer-open")) {
    return 0;
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

  if (maxScroll <= 0) {
    return 0;
  }

  const edgeSize = Math.min(240, Math.max(140, window.innerHeight * 0.24));
  const maxSpeed = 30;

  if (clientY < edgeSize) {
    if (window.scrollY <= 0) {
      return 0;
    }

    const intensity = 1 - clientY / edgeSize;
    return -maxSpeed * Math.pow(intensity, 1.35);
  }

  if (clientY > window.innerHeight - edgeSize) {
    if (window.scrollY >= maxScroll - 1) {
      return 0;
    }

    const intensity = 1 - (window.innerHeight - clientY) / edgeSize;
    return maxSpeed * Math.pow(intensity, 1.35);
  }

  return 0;
}

function stepEdgeAutoScroll() {
  if (!edgeAutoScroll.speed) {
    stopEdgeAutoScroll();
    return;
  }

  window.scrollBy(0, edgeAutoScroll.speed);
  edgeAutoScroll.frame = requestAnimationFrame(stepEdgeAutoScroll);
}

function updateEdgeAutoScroll(event) {
  if (!supportsHover || !document.querySelector(".project-page")) {
    return;
  }

  edgeAutoScroll.speed = getEdgeAutoScrollSpeed(event.clientY);

  if (!edgeAutoScroll.speed) {
    stopEdgeAutoScroll();
    return;
  }

  if (!edgeAutoScroll.frame) {
    edgeAutoScroll.frame = requestAnimationFrame(stepEdgeAutoScroll);
  }
}

function getCarouselItems(carousel) {
  const track = carousel.querySelector(".project-media-carousel-track");

  if (!track) {
    return [];
  }

  return Array.from(track.querySelectorAll(".project-media-item"));
}

function getCarouselItemCount(carousel) {
  return getCarouselItems(carousel).length;
}

function getActiveCarouselIndex(carousel) {
  const count = getCarouselItemCount(carousel);
  const index = Number(carousel.dataset.carouselIndex || 0);

  if (!count) {
    return 0;
  }

  return ((index % count) + count) % count;
}

function getCarouselVirtualIndex(carousel) {
  return Number(carousel.dataset.carouselVirtualIndex || carousel.dataset.carouselIndex || 0);
}

function normalizeCarouselIndex(index, count) {
  if (!count) {
    return 0;
  }

  return ((index % count) + count) % count;
}

function getCarouselCircularOffset(index, activeIndex, count) {
  if (count <= 1) {
    return 0;
  }

  const rawOffset = index - activeIndex;
  let offset = rawOffset % count;

  if (offset > count / 2) {
    offset -= count;
  } else if (offset < count / -2) {
    offset += count;
  }

  return offset;
}

function prepareCarouselVideo(item) {
  const video = item.querySelector("video");

  if (!video) {
    return null;
  }

  if (video.dataset.carouselPrepared !== "true") {
    video.dataset.carouselPrepared = "true";
    video.preload = "none";
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.removeAttribute("controls");
  }

  return video;
}

function loadCarouselVideoPreview(video) {
  video.autoplay = false;
  video.removeAttribute("autoplay");
  video.preload = "auto";
  window.PORTFOLIO_MEDIA_LAZY?.load(video, { autoplay: false });
}

function syncCarouselVideo(item, shouldLoad, shouldPlay) {
  const video = prepareCarouselVideo(item);

  if (!video) {
    return;
  }

  if (isMobileCarouselLayout()) {
    video.autoplay = true;
    video.setAttribute("autoplay", "");

    if (shouldLoad) {
      window.PORTFOLIO_MEDIA_LAZY?.load(video);
    }

    return;
  }

  if (shouldPlay) {
    video.autoplay = true;
    video.setAttribute("autoplay", "");
  } else {
    video.autoplay = false;
    video.removeAttribute("autoplay");
  }

  if (shouldLoad) {
    loadCarouselVideoPreview(video);
  }

  if (shouldPlay) {
    playVideo(video);
    pausedByGalleryHover.delete(video);
  } else if (!video.paused) {
    video.pause();
  }
}

function syncCarouselLazyMedia(item, shouldLoad) {
  if (!shouldLoad) {
    return;
  }

  item.querySelectorAll("img[data-lazy-carousel='true']").forEach((image) => {
    window.PORTFOLIO_MEDIA_LAZY?.load(image);
  });
}

function shouldCarouselItemLoad(item) {
  if (isMobileCarouselLayout()) {
    return isElementNearViewport(item, 320, 520);
  }

  const offset = Math.abs(Number(item.dataset.carouselOffset || 0));

  return offset <= 2 && item.getAttribute("aria-hidden") !== "true";
}

function syncCarouselMedia(item, shouldLoad, shouldPlay) {
  syncCarouselLazyMedia(item, shouldLoad);
  syncCarouselVideo(item, shouldLoad, shouldPlay);
}

function isCarouselItemHovered(item) {
  return supportsHover && (item.matches(":hover") || item.classList.contains("is-hovered"));
}

function shouldCarouselItemPlay(item, carousel) {
  if (isMobileCarouselLayout()) {
    return false;
  }

  const offset = Number(item.dataset.carouselOffset || 0);

  if (offset === 0) {
    return true;
  }

  if (carousel.classList.contains("is-expanded")) {
    return false;
  }

  return Math.abs(offset) === 1 && isCarouselItemHovered(item);
}

function syncCarouselPlayback(carousel) {
  getCarouselItems(carousel).forEach((item) => {
    syncCarouselMedia(item, shouldCarouselItemLoad(item), shouldCarouselItemPlay(item, carousel));
  });
}

function setCarouselViewer(carousel, shouldExpand) {
  const isExpanded = carousel.classList.contains("is-expanded");
  const finishTimer = Number(carousel.dataset.viewerTransitionTimer || 0);

  if (finishTimer) {
    window.clearTimeout(finishTimer);
    delete carousel.dataset.viewerTransitionTimer;
  }

  if (shouldExpand && !isExpanded) {
    carousel.dataset.viewerScrollX = String(window.scrollX);
    carousel.dataset.viewerScrollY = String(window.scrollY);
    stopEdgeAutoScroll();
    carousel.classList.remove("is-viewer-closing");
    carousel.classList.add("is-expanded");
    document.body.classList.add("is-carousel-viewer-open");
    syncCarouselPlayback(carousel);
    window.requestAnimationFrame(() => {
      carousel.classList.add("is-viewer-ready");
    });
    return;
  }

  if (shouldExpand) {
    carousel.classList.remove("is-viewer-closing");
    carousel.classList.add("is-viewer-ready");
    document.body.classList.add("is-carousel-viewer-open");
    syncCarouselPlayback(carousel);
    return;
  }

  if (isExpanded) {
    const scrollX = Number(carousel.dataset.viewerScrollX || window.scrollX);
    const scrollY = Number(carousel.dataset.viewerScrollY || window.scrollY);
    const restoreScroll = () => window.scrollTo(scrollX, scrollY);
    const finishClosing = () => {
      carousel.classList.remove("is-expanded", "is-viewer-closing");
      document.body.classList.remove("is-carousel-viewer-open");
      delete carousel.dataset.viewerTransitionTimer;
      syncCarouselPlayback(carousel);
      restoreScroll();
      window.requestAnimationFrame(restoreScroll);
      window.setTimeout(restoreScroll, 80);
    };

    carousel.classList.remove("is-viewer-ready");
    carousel.classList.add("is-viewer-closing");
    syncCarouselPlayback(carousel);
    restoreScroll();
    carousel.dataset.viewerTransitionTimer = String(window.setTimeout(finishClosing, 520));
    return;
  }

  document.body.classList.remove("is-carousel-viewer-open");
  syncCarouselPlayback(carousel);
}

function getMediaVisibleRect(media) {
  const rect = media.getBoundingClientRect();
  const width = media.videoWidth || media.naturalWidth;
  const height = media.videoHeight || media.naturalHeight;

  if (!rect.width || !rect.height || !width || !height) {
    return rect;
  }

  const mediaRatio = width / height;
  const boxRatio = rect.width / rect.height;

  if (mediaRatio > boxRatio) {
    const visibleHeight = rect.width / mediaRatio;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top + (rect.height - visibleHeight) / 2,
      bottom: rect.top + (rect.height + visibleHeight) / 2,
      width: rect.width,
      height: visibleHeight
    };
  }

  const visibleWidth = rect.height * mediaRatio;
  return {
    left: rect.left + (rect.width - visibleWidth) / 2,
    right: rect.left + (rect.width + visibleWidth) / 2,
    top: rect.top,
    bottom: rect.bottom,
    width: visibleWidth,
    height: rect.height
  };
}

function isPointInsideRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getCarouselItemAtPoint(carousel, x, y) {
  const candidates = getCarouselItems(carousel)
    .filter((item) => Math.abs(Number(item.dataset.carouselOffset || 0)) <= 1)
    .map((item) => {
      const media = item.querySelector("img, video");

      if (!media) {
        return null;
      }

      const rect = getMediaVisibleRect(media);

      if (!isPointInsideRect(x, y, rect)) {
        return null;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(x - centerX, y - centerY);

      return { item, distance };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.item || null;
}

function setCarouselHoverItem(carousel, hoveredItem) {
  getCarouselItems(carousel).forEach((item) => {
    item.classList.toggle("is-hovered", item === hoveredItem && Math.abs(Number(item.dataset.carouselOffset || 0)) === 1);
  });

  syncCarouselPlayback(carousel);
}

function renderCarousel(carousel) {
  const items = getCarouselItems(carousel);
  const count = items.length;
  const activeIndex = getCarouselVirtualIndex(carousel);

  if (!count) {
    return;
  }

  items.forEach((item, index) => {
    const offset = getCarouselCircularOffset(index, activeIndex, count);
    const isActive = offset === 0;
    const isNear = isMobileCarouselLayout() || Math.abs(offset) <= 2;

    item.dataset.carouselIndex = String(index);
    item.dataset.carouselOffset = String(offset);
    item.style.setProperty("--carousel-offset", String(offset));
    item.classList.toggle("is-active", isActive);
    item.tabIndex = isActive || Math.abs(offset) === 1 ? 0 : -1;
    item.setAttribute("aria-hidden", String(!isNear));

    if (isActive) {
      item.setAttribute("aria-current", "true");
    } else {
      item.removeAttribute("aria-current");
    }

    classifyMediaItem(item);
  });

  carousel.dataset.carouselIndex = String(normalizeCarouselIndex(activeIndex, count));
  carousel.classList.add("is-ready");
  syncCarouselPlayback(carousel);
}

function setCarouselIndex(carousel, index) {
  const count = getCarouselItemCount(carousel);

  if (!count) {
    return;
  }

  carousel.dataset.carouselVirtualIndex = String(index);
  renderCarousel(carousel);
}

function scrollCarousel(carousel, direction) {
  const track = carousel.querySelector(".project-media-carousel-track");
  const count = getCarouselItemCount(carousel);

  if (!track || count <= 1 || carousel.classList.contains("is-expanded") || carousel.dataset.carouselAnimating === "true") {
    return;
  }

  carousel.dataset.carouselAnimating = "true";
  track.classList.remove("is-moving-next", "is-moving-prev", "is-resetting");
  track.classList.add("is-animating");
  setCarouselIndex(carousel, getCarouselVirtualIndex(carousel) + (direction > 0 ? 1 : -1));
  let didFinish = false;

  const finish = () => {
    if (didFinish) {
      return;
    }

    didFinish = true;
    track.classList.remove("is-animating");
    delete carousel.dataset.carouselAnimating;
  };

  const handleTransitionEnd = (event) => {
    if (!event.target.classList.contains("project-media-item") || event.propertyName !== "transform") {
      return;
    }

    track.removeEventListener("transitionend", handleTransitionEnd);
    finish();
  };

  track.addEventListener("transitionend", handleTransitionEnd);
  window.setTimeout(() => {
    if (carousel.dataset.carouselAnimating === "true") {
      track.removeEventListener("transitionend", handleTransitionEnd);
      finish();
    }
  }, 760);
}

function setupProjectCarousel(carousel) {
  const track = carousel.querySelector(".project-media-carousel-track");
  const items = getCarouselItems(carousel);

  if (!track || !items.length) {
    return;
  }

  carousel.dataset.carouselIndex = "0";
  carousel.dataset.carouselVirtualIndex = "0";

  track.classList.remove("is-moving-next", "is-moving-prev", "is-animating");
  track.classList.add("is-resetting");
  renderCarousel(carousel);
  track.offsetHeight;
  track.classList.remove("is-resetting");

  carousel.addEventListener("click", (event) => {
    if (isMobileCarouselLayout()) {
      return;
    }

    const item = getCarouselItemAtPoint(carousel, event.clientX, event.clientY);

    if (!item) {
      return;
    }

    const offset = Number(item.dataset.carouselOffset || 0);

    if (carousel.classList.contains("is-expanded")) {
      setCarouselViewer(carousel, false);
      return;
    }

    if (offset !== 0) {
      scrollCarousel(carousel, offset > 0 ? 1 : -1);
      return;
    }

    setCarouselViewer(carousel, true);
  });

  if (supportsHover) {
    track.addEventListener("pointermove", (event) => {
      if (carousel.classList.contains("is-expanded")) {
        setCarouselHoverItem(carousel, null);
        return;
      }

      setCarouselHoverItem(carousel, getCarouselItemAtPoint(carousel, event.clientX, event.clientY));
    });

    track.addEventListener("pointerleave", () => {
      setCarouselHoverItem(carousel, null);
    });
  }

  track.addEventListener("keydown", (event) => {
    if (isMobileCarouselLayout()) {
      return;
    }

    const item = event.target.closest(".project-media-item");

    if (!item || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    const offset = Number(item.dataset.carouselOffset || 0);

    if (offset !== 0) {
      scrollCarousel(carousel, offset > 0 ? 1 : -1);
    } else {
      setCarouselViewer(carousel, !carousel.classList.contains("is-expanded"));
    }
  });

  track.addEventListener("keydown", (event) => {
    if (isMobileCarouselLayout()) {
      return;
    }

    if (event.key === "Escape" && carousel.classList.contains("is-expanded")) {
      event.preventDefault();
      setCarouselViewer(carousel, false);
      return;
    }

    if (carousel.classList.contains("is-expanded")) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollCarousel(carousel, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollCarousel(carousel, 1);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && carousel.classList.contains("is-expanded")) {
      setCarouselViewer(carousel, false);
    }
  });

  window.addEventListener("resize", () => renderCarousel(carousel));
}

document.querySelectorAll(".project-media-item").forEach(classifyMediaItem);
document.querySelectorAll(".project-media-item video").forEach(setupProjectVideoPoster);
document.querySelectorAll(".project-media-carousel").forEach(setupProjectCarousel);
setupMobileProjectMediaDetail();

let mobileProjectVideoSyncFrame = null;

const mobileProjectVideoObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    if (!isMobileCarouselLayout()) {
      return;
    }

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.preload = "metadata";
        window.PORTFOLIO_MEDIA_LAZY?.load(entry.target);
      }
    });
    scheduleMobileProjectVideoSync();
  }, {
    rootMargin: "360px 0px",
    threshold: [0, 0.08, 0.24, 0.5]
  })
  : null;

function setupMobileProjectVideoPlayback() {
  document.querySelectorAll(".project-media-item video").forEach((video) => {
    if (mobileProjectVideoObserver) {
      mobileProjectVideoObserver.observe(video);
    }
  });
}

function syncMobileProjectVideos() {
  mobileProjectVideoSyncFrame = null;

  if (!isMobileCarouselLayout()) {
    return;
  }

  const videos = Array.from(document.querySelectorAll(".project-media-item video"));
  const activeVideo = videos
    .map((video) => ({
      video,
      ratio: getElementVisibleRatio(video),
      distance: getElementCenterDistance(video)
    }))
    .filter(({ ratio }) => ratio >= 0.08)
    .sort((left, right) => right.ratio - left.ratio || left.distance - right.distance)[0]?.video || null;

  videos.forEach((video) => {
    if (isElementNearViewport(video, 320, 520)) {
      video.preload = "metadata";
      window.PORTFOLIO_MEDIA_LAZY?.load(video);
    }

    if (video === activeVideo) {
      playVideo(video);
      return;
    }

    video.pause();
  });
}

function scheduleMobileProjectVideoSync() {
  if (mobileProjectVideoSyncFrame) {
    return;
  }

  mobileProjectVideoSyncFrame = window.requestAnimationFrame(syncMobileProjectVideos);
}

setupMobileProjectVideoPlayback();
scheduleMobileProjectVideoSync();

function autoplayInitialProjectVideos() {
  if (isMobileCarouselLayout()) {
    scheduleMobileProjectVideoSync();
    return;
  }

  document.querySelectorAll(".project-media-item video").forEach((video) => {
    const item = video.closest(".project-media-item");
    const carousel = video.closest(".project-media-carousel");

    if (carousel && !isMobileCarouselLayout() && !item?.classList.contains("is-active")) {
      return;
    }

    const rect = video.getBoundingClientRect();
    const isNearViewport = rect.bottom >= -160 && rect.top <= window.innerHeight + 180;

    if (!isNearViewport) {
      return;
    }

    playVideo(video);
    window.requestAnimationFrame(() => playVideo(video));
    window.setTimeout(() => playVideo(video), 450);
  });
}

window.requestAnimationFrame(autoplayInitialProjectVideos);
window.setTimeout(autoplayInitialProjectVideos, 350);
window.addEventListener("pageshow", autoplayInitialProjectVideos);
window.addEventListener("scroll", scheduleMobileProjectVideoSync, { passive: true });
window.addEventListener("resize", scheduleMobileProjectVideoSync);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    autoplayInitialProjectVideos();
    scheduleMobileProjectVideoSync();
  }
});

if (supportsHover) {
  window.addEventListener("pointermove", updateEdgeAutoScroll);
  window.addEventListener("blur", stopEdgeAutoScroll);
  window.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget) {
      stopEdgeAutoScroll();
    }
  });

  document.querySelectorAll(".project-media-grid").forEach((grid) => {
    grid.querySelectorAll(".project-media-item").forEach((item) => {
      if (item.closest(".project-media-carousel")) {
        return;
      }

      const media = item.querySelector("img, video");

      if (!media) {
        return;
      }

      media.addEventListener("pointerenter", () => {
        updateHoverScale(item);
        pauseVideosAround(item, grid);
      });
    });

    grid.addEventListener("pointerleave", () => {
      resumeGalleryVideos(grid);
    });
  });
}
