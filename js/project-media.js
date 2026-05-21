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

function isMobileCarouselLayout() {
  return mobileCarouselLayout.matches;
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
    return true;
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

  if (shouldExpand && !isExpanded) {
    carousel.dataset.viewerScrollX = String(window.scrollX);
    carousel.dataset.viewerScrollY = String(window.scrollY);
    stopEdgeAutoScroll();
  }

  carousel.classList.toggle("is-expanded", shouldExpand);
  document.body.classList.toggle("is-carousel-viewer-open", shouldExpand);
  syncCarouselPlayback(carousel);

  if (!shouldExpand && isExpanded) {
    const scrollX = Number(carousel.dataset.viewerScrollX || window.scrollX);
    const scrollY = Number(carousel.dataset.viewerScrollY || window.scrollY);
    const restoreScroll = () => window.scrollTo(scrollX, scrollY);

    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
    window.setTimeout(restoreScroll, 80);
  }
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

function autoplayInitialProjectVideos() {
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
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    autoplayInitialProjectVideos();
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
