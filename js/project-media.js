const bottomCarouselWheelThreshold = 48;
const bottomCarouselWheelImmediateThreshold = 30;
const bottomCarouselWheelDiscreteDelta = 80;
const bottomCarouselWheelDiscreteCooldown = 110;
const bottomCarouselWheelCarryLimit = 0.35;
const bottomCarouselTrackpadThreshold = 92;
const bottomCarouselTrackpadImmediateThreshold = 120;
const bottomCarouselTrackpadCooldown = 170;
const bottomCarouselTrackpadCarryLimit = 0.12;
const bottomCarouselTrackpadIntensityCap = 2.2;
const bottomCarouselTrackpadCadenceCap = 0.3;
const bottomCarouselWheelIdleReset = 180;
const carouselQueueStepLimit = 2;
const carouselMomentumMin = 1;
const carouselMomentumMax = 3.8;
const carouselMotionDurationBase = 400;
const carouselMotionDurationFast = 180;
const carouselFadeDurationBase = 240;
const carouselFadeDurationFast = 120;
const carouselMomentumDecay = 0.76;
const carouselMotionReleaseRatio = 0.46;
const carouselMotionReleaseMin = 110;
const continuousCarouselCopyCount = 5;
const carouselExpandedSoundToggleInsetMin = 14;
const carouselExpandedSoundToggleInsetMax = 24;
const bottomCarouselWheelState = {
  accumulatedDelta: 0,
  lastEventTime: 0,
  discreteLockUntil: 0,
  trackpadLockUntil: 0,
  resetTimer: 0
};
const continuousCarouselRecenterTimers = new WeakMap();

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function playVideo(video) {
  if (!video) {
    return;
  }

  window.PORTFOLIO_MEDIA_LAZY?.prepareAutoplayVideo(video);
  window.PORTFOLIO_MEDIA_LAZY?.load(video);
  const playAttempt = video.play?.();

  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {});
  }

  window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(video);
}

function isProjectAudioTarget(video) {
  return video?.dataset.allowAudio === "true";
}

function isProjectAudioEnabled(video) {
  return window.PORTFOLIO_MEDIA_LAZY?.isVideoSoundEnabled?.(video) === true;
}

function videoSourceMatches(video, sourcePath) {
  if (!video || !sourcePath) {
    return false;
  }

  const activeSource = video.currentSrc || video.src || video.dataset.src || "";
  return activeSource === sourcePath || activeSource.endsWith(sourcePath);
}

function ensureProjectAudioSource(video) {
  if (!isProjectAudioTarget(video)) {
    return;
  }

  const desktopSource = video.dataset.desktopSrc || "";

  if (!desktopSource || videoSourceMatches(video, desktopSource)) {
    return;
  }

  video.dataset.src = desktopSource;
  video.src = desktopSource;
  video.load?.();
}

function setProjectVideoOutputMuted(video, muted) {
  if (!video) {
    return;
  }

  video.defaultMuted = muted;
  video.muted = muted;

  if (muted) {
    video.setAttribute("muted", "");
    return;
  }

  video.removeAttribute("muted");
}

function shouldProjectAudioOutput(video) {
  if (!isProjectAudioTarget(video) || video?.dataset.audioEnabled !== "true") {
    return false;
  }

  const item = video.closest(".project-media-item");
  const carousel = item?.closest(".project-media-carousel");

  if (!carousel) {
    return true;
  }

  if (isMobileCarouselLayout()) {
    return getElementVisibleRatio(video) >= 0.12;
  }

  return item?.classList.contains("is-active") === true;
}

function syncProjectAudioOutput(video) {
  if (!isProjectAudioTarget(video)) {
    return;
  }

  if (shouldProjectAudioOutput(video)) {
    ensureProjectAudioSource(video);
    window.PORTFOLIO_MEDIA_LAZY?.setVideoSoundState?.(video, true);
    return;
  }

  setProjectVideoOutputMuted(video, true);
}

function syncAllProjectAudioOutput() {
  document.querySelectorAll("video[data-allow-audio='true']").forEach(syncProjectAudioOutput);
}

function setProjectPrimaryVideoSound(video, soundEnabled) {
  if (!isProjectAudioTarget(video)) {
    return false;
  }

  document.querySelectorAll("video[data-allow-audio='true']").forEach((candidate) => {
    window.PORTFOLIO_MEDIA_LAZY?.setVideoSoundState?.(candidate, soundEnabled);
  });

  syncAllProjectAudioOutput();

  if (soundEnabled) {
    ensureProjectAudioSource(video);
    window.PORTFOLIO_MEDIA_LAZY?.load(video);
    window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(video);
  }

  return isProjectAudioEnabled(video);
}

function updateProjectVideoSoundButton(button, video) {
  if (!button || !video) {
    return;
  }

  const enabled = isProjectAudioEnabled(video);
  button.textContent = "";
  button.dataset.soundState = enabled ? "on" : "off";
  button.setAttribute("aria-label", enabled ? "Mute project audio" : "Enable project audio");
  button.setAttribute("aria-pressed", enabled ? "true" : "false");
  button.title = enabled ? "Sound on" : "Sound off";
}

function refreshProjectVideoSoundButtons() {
  document.querySelectorAll(".project-video-sound-toggle").forEach((button) => {
    const figure = button.closest(".project-media-item");
    const video = figure?.querySelector("video[data-allow-audio='true']");
    updateProjectVideoSoundButton(button, video);
  });
}

function attachProjectVideoSoundButton(figure) {
  if (!figure || figure.dataset.audioEligible !== "true" || figure.querySelector(".project-video-sound-toggle")) {
    return;
  }

  const video = figure.querySelector("video[data-allow-audio='true']");
  const carousel = figure.closest(".project-media-carousel");

  if (!video) {
    return;
  }

  const button = document.createElement("button");
  button.className = "project-video-sound-toggle";
  button.type = "button";

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setProjectPrimaryVideoSound(video, !isProjectAudioEnabled(video));
    refreshProjectVideoSoundButtons();
    requestCarouselSoundTogglePositionSync(carousel);
  });

  const syncButtonState = () => {
    refreshProjectVideoSoundButtons();
    requestCarouselSoundTogglePositionSync(carousel);
  };

  video.addEventListener("volumechange", syncButtonState);
  video.addEventListener("emptied", syncButtonState);
  video.addEventListener("loadedmetadata", syncButtonState);

  figure.append(button);
  updateProjectVideoSoundButton(button, video);
  requestCarouselSoundTogglePositionSync(carousel);
}

function setupProjectVideoSoundControls() {
  document.querySelectorAll(".project-media-item[data-audio-eligible='true']").forEach(attachProjectVideoSoundButton);
  refreshProjectVideoSoundButtons();
}

function getCarouselSoundToggleAtPoint(carousel, clientX, clientY) {
  return Array.from(carousel.querySelectorAll(".project-video-sound-toggle")).find((button) => {
    const styles = window.getComputedStyle(button);

    if (styles.pointerEvents === "none" || Number.parseFloat(styles.opacity || "1") <= 0.02) {
      return false;
    }

    const rect = button.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }) || null;
}

const mediaRatioProbeCache = new Map();

function setResolvedMediaRatio(item, ratio) {
  if (!item || !Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }

  item.style.setProperty("--media-ratio", String(ratio));
  return ratio;
}

function getLoadedMediaRatio(media) {
  const width = media?.videoWidth || media?.naturalWidth || 0;
  const height = media?.videoHeight || media?.naturalHeight || 0;

  if (!width || !height) {
    return 0;
  }

  return width / height;
}

function getMediaRatioProbeSource(media) {
  if (!media) {
    return "";
  }

  if (media.tagName === "VIDEO") {
    return media.poster || media.dataset.posterSrc || "";
  }

  return media.currentSrc || media.src || media.dataset.src || "";
}

function loadMediaRatioProbe(media) {
  const loadedRatio = getLoadedMediaRatio(media);

  if (loadedRatio) {
    return Promise.resolve(loadedRatio);
  }

  const source = getMediaRatioProbeSource(media);

  if (!source) {
    return Promise.resolve(0);
  }

  if (mediaRatioProbeCache.has(source)) {
    return mediaRatioProbeCache.get(source);
  }

  const probePromise = new Promise((resolve) => {
    const probe = new Image();

    probe.decoding = "async";
    probe.addEventListener("load", () => {
      resolve(probe.naturalWidth && probe.naturalHeight ? probe.naturalWidth / probe.naturalHeight : 0);
    }, { once: true });
    probe.addEventListener("error", () => resolve(0), { once: true });
    probe.src = source;
  });

  mediaRatioProbeCache.set(source, probePromise);
  return probePromise;
}

function primeMediaItemRatio(item) {
  const media = item?.querySelector("img, video");

  if (!media) {
    return Promise.resolve(0);
  }

  return loadMediaRatioProbe(media).then((ratio) => {
    setResolvedMediaRatio(item, ratio);
    classifyMediaItem(item);
    return ratio;
  });
}

function classifyMediaItem(item) {
  const media = item.querySelector("img, video");

  if (!media) {
    return;
  }

  const applyIntrinsicRatio = (width = media.videoWidth || media.naturalWidth, height = media.videoHeight || media.naturalHeight) => {
    if (!width || !height) {
      return 0;
    }

    return setResolvedMediaRatio(item, width / height);
  };

  const hasDeclaredRatioClass = [
    "project-media-ultrawide",
    "project-media-wide",
    "project-media-landscape",
    "project-media-square",
    "project-media-portrait",
    "project-media-full-row"
  ].some((className) => item.classList.contains(className));

  item.classList.remove(
    "project-media-auto-ultrawide",
    "project-media-auto-wide",
    "project-media-auto-landscape",
    "project-media-auto-square",
    "project-media-auto-portrait"
  );

  const bindRatioRefresh = (eventName, handler) => {
    const key = `ratioBound${eventName}`;

    if (media.dataset[key] === "true") {
      return;
    }

    media.dataset[key] = "true";
    media.addEventListener(eventName, handler, { once: true });
  };

  if (hasDeclaredRatioClass) {
    const applyDeclaredRatio = (width = media.videoWidth || media.naturalWidth, height = media.videoHeight || media.naturalHeight) => {
      applyIntrinsicRatio(width, height);
    };

    const loadedRatio = getLoadedMediaRatio(media);

    if (loadedRatio) {
      applyDeclaredRatio();
    } else if (media.tagName === "VIDEO") {
      loadMediaRatioProbe(media).then((ratio) => {
        if (ratio) {
          setResolvedMediaRatio(item, ratio);
        }
      });
      bindRatioRefresh("loadedmetadata", applyDeclaredRatio);
    } else if (media.complete && media.naturalWidth) {
      applyDeclaredRatio();
    } else {
      loadMediaRatioProbe(media).then((ratio) => {
        if (ratio) {
          setResolvedMediaRatio(item, ratio);
        }
      });
      bindRatioRefresh("load", applyDeclaredRatio);
    }

    return;
  }

  const applyClass = (width = media.videoWidth || media.naturalWidth, height = media.videoHeight || media.naturalHeight) => {
    const ratio = applyIntrinsicRatio(width, height);

    if (!ratio) {
      return;
    }

    if (ratio >= 2.1) {
      item.classList.add("project-media-auto-ultrawide");
    } else if (ratio >= 1.58) {
      item.classList.add("project-media-auto-wide");
    } else if (ratio >= 1.18) {
      item.classList.add("project-media-auto-landscape");
    } else if (ratio >= 0.92) {
      item.classList.add("project-media-auto-square");
    } else {
      item.classList.add("project-media-auto-portrait");
    }
  };

  const loadedRatio = getLoadedMediaRatio(media);

  if (loadedRatio) {
    applyClass();
  } else if (media.tagName === "VIDEO") {
    loadMediaRatioProbe(media).then((ratio) => {
      if (ratio) {
        applyClass(ratio, 1);
      }
    });
    bindRatioRefresh("loadedmetadata", applyClass);
  } else if (media.complete && media.naturalWidth) {
    applyClass();
  } else {
    loadMediaRatioProbe(media).then((ratio) => {
      if (ratio) {
        applyClass(ratio, 1);
      }
    });
    bindRatioRefresh("load", applyClass);
  }
}

function setupProjectVideoPoster(video) {
  const item = video?.closest(".project-media-item");

  if (!video || !item || video.dataset.posterBindings === "true") {
    return;
  }

  let poster = item.querySelector(".project-video-poster");

  if (!poster) {
    poster = document.createElement("div");
    poster.className = "project-video-poster";
    poster.setAttribute("aria-hidden", "true");
    item.append(poster);
  }

  const staticPosterSrc = video.poster || video.dataset.posterSrc || "";
  const showPoster = () => poster.classList.remove("is-hidden");
  const syncPlayingPosterState = () => {
    const carousel = item.closest(".project-media-carousel");

    if (!carousel) {
      setProjectVideoPosterVisible(video, false);
      return;
    }

    if (!item.classList.contains("is-active")) {
      showPoster();
    }
  };

  video.dataset.posterBindings = "true";

  if (staticPosterSrc) {
    poster.style.backgroundImage = `url("${staticPosterSrc}")`;
    poster.dataset.posterReady = "true";
  }

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
  video.addEventListener("loadstart", showPoster);
  video.addEventListener("loadeddata", capturePosterFrame, { once: true });
  video.addEventListener("canplay", capturePosterFrame, { once: true });
  video.addEventListener("loadedmetadata", () => {
    requestProjectVideoPosterReveal(video);
  });
  video.addEventListener("canplay", () => {
    requestProjectVideoPosterReveal(video);
  });
  video.addEventListener("playing", () => {
    syncPlayingPosterState();
    requestProjectVideoPosterReveal(video);
  });
  video.addEventListener("timeupdate", () => {
    requestProjectVideoPosterReveal(video);
  });
  video.addEventListener("seeked", () => {
    requestProjectVideoPosterReveal(video);
  });
  video.addEventListener("pause", showPoster);
  video.addEventListener("waiting", showPoster);
  video.addEventListener("stalled", showPoster);
  video.addEventListener("emptied", showPoster);
  video.addEventListener("error", showPoster);
}

function setProjectVideoPosterVisible(video, visible) {
  const poster = video?.closest(".project-media-item")?.querySelector(".project-video-poster");

  if (!poster) {
    return;
  }

  poster.classList.toggle("is-hidden", !visible);
}

function hasProjectVideoLiveFrame(video) {
  if (!video || video.readyState < 2) {
    return false;
  }

  return !video.paused || video.currentTime > 0.04;
}

function requestProjectVideoPosterReveal(video) {
  const item = video?.closest(".project-media-item");
  const carousel = item?.closest(".project-media-carousel");

  if (!video || !item) {
    return;
  }

  if (carousel && !isMobileCarouselLayout() && !item.classList.contains("is-active")) {
    return;
  }

  if (!hasProjectVideoLiveFrame(video)) {
    setProjectVideoPosterVisible(video, true);
    return;
  }

  if (video.dataset.posterRevealQueued === "true") {
    return;
  }

  video.dataset.posterRevealQueued = "true";

  const reveal = () => {
    delete video.dataset.posterRevealQueued;

    if (!hasProjectVideoLiveFrame(video)) {
      setProjectVideoPosterVisible(video, true);
      return;
    }

    setProjectVideoPosterVisible(video, false);
  };

  if ("requestVideoFrameCallback" in video) {
    video.requestVideoFrameCallback(() => {
      reveal();
    });
    return;
  }

  window.requestAnimationFrame(reveal);
}

const mobileCarouselLayout = window.matchMedia("(max-width: 860px)");
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
    return 9 / 16;
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

  if (video.dataset.audioEnabled === "true" && desktopSource) {
    return desktopSource;
  }

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

    if (media.dataset.allowAudio === "true") {
      video.dataset.allowAudio = "true";
      window.PORTFOLIO_MEDIA_LAZY?.syncVideoSoundState?.(video, media);
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

function getCarouselItems(carousel) {
  const track = carousel.querySelector(".project-media-carousel-track");

  if (!track) {
    return [];
  }

  return Array.from(track.querySelectorAll(".project-media-item"));
}

function getCarouselItemCount(carousel) {
  const logicalCount = Number(carousel?.dataset.carouselLogicalCount || 0);

  return logicalCount || getCarouselItems(carousel).length;
}

function isContinuousCarousel(carousel) {
  return carousel?.dataset.carouselLoopMode === "continuous";
}

function getCarouselPhysicalIndex(carousel) {
  const items = getCarouselItems(carousel);

  if (!items.length) {
    return 0;
  }

  const index = Number(carousel.dataset.carouselPhysicalIndex || 0);
  return Math.max(0, Math.min(index, items.length - 1));
}

function getCarouselLogicalIndexForItem(item, fallback = 0) {
  const index = Number(item?.dataset.carouselLogicalIndex ?? fallback);

  return Number.isFinite(index) ? index : fallback;
}

function getContinuousCarouselCenteredIndex(carousel, logicalIndex = 0) {
  const logicalCount = getCarouselItemCount(carousel);
  const copyCount = Number(carousel.dataset.carouselCopyCount || 1);

  if (!logicalCount) {
    return 0;
  }

  return logicalCount * Math.floor(copyCount / 2) + normalizeCarouselIndex(logicalIndex, logicalCount);
}

function shouldRecenterContinuousCarousel(carousel) {
  const logicalCount = getCarouselItemCount(carousel);
  const copyCount = Number(carousel.dataset.carouselCopyCount || 1);

  if (!logicalCount || copyCount < 3) {
    return false;
  }

  const physicalIndex = getCarouselPhysicalIndex(carousel);
  const activeCopyIndex = Math.floor(physicalIndex / logicalCount);

  return activeCopyIndex <= 0 || activeCopyIndex >= copyCount - 1;
}

function shouldUseContinuousCarousel(carousel, items = getCarouselItems(carousel)) {
  const logicalCount = items.length;

  if (logicalCount <= 1 || logicalCount > 6) {
    return false;
  }

  return !items.some((item) => item.classList.contains("project-media-full-row"));
}

function observeCarouselCloneMedia(item) {
  item.querySelectorAll("video, img[data-lazy-carousel='true']").forEach((media) => {
    window.PORTFOLIO_MEDIA_LAZY?.observe(media);
  });
}

function prepareClonedCarouselMedia(item) {
  item.querySelectorAll("video").forEach((video) => {
    video.removeAttribute("data-poster-bindings");
    setupProjectVideoPoster(video);
  });

  observeCarouselCloneMedia(item);
}

function expandContinuousCarouselTrack(carousel) {
  if (carousel.dataset.carouselLoopPrepared === "true") {
    return;
  }

  const track = carousel.querySelector(".project-media-carousel-track");
  const baseItems = getCarouselItems(carousel);
  const logicalCount = baseItems.length;

  if (!track || !shouldUseContinuousCarousel(carousel, baseItems)) {
    return;
  }

  carousel.dataset.carouselLoopMode = "continuous";
  carousel.dataset.carouselLoopPrepared = "true";
  carousel.dataset.carouselLogicalCount = String(logicalCount);
  carousel.dataset.carouselCopyCount = String(continuousCarouselCopyCount);
  carousel.dataset.carouselCenterCopyIndex = String(Math.floor(continuousCarouselCopyCount / 2));

  const centerCopyIndex = Math.floor(continuousCarouselCopyCount / 2);

  baseItems.forEach((item, index) => {
    item.dataset.carouselLogicalIndex = String(index);
    item.dataset.carouselCopyIndex = String(centerCopyIndex);
    item.dataset.carouselClone = "false";
  });

  const prependFragment = document.createDocumentFragment();
  const appendFragment = document.createDocumentFragment();

  for (let copyIndex = 0; copyIndex < continuousCarouselCopyCount; copyIndex += 1) {
    if (copyIndex === centerCopyIndex) {
      continue;
    }

    const targetFragment = copyIndex < centerCopyIndex ? prependFragment : appendFragment;

    baseItems.forEach((item, index) => {
      const clone = item.cloneNode(true);
      clone.dataset.carouselLogicalIndex = String(index);
      clone.dataset.carouselCopyIndex = String(copyIndex);
      clone.dataset.carouselClone = "true";
      classifyMediaItem(clone);
      prepareClonedCarouselMedia(clone);
      targetFragment.append(clone);
    });
  }

  track.prepend(prependFragment);
  track.append(appendFragment);
}

function resetBottomCarouselWheelState() {
  bottomCarouselWheelState.accumulatedDelta = 0;
  bottomCarouselWheelState.lastEventTime = 0;
  bottomCarouselWheelState.discreteLockUntil = 0;
  bottomCarouselWheelState.trackpadLockUntil = 0;

  if (bottomCarouselWheelState.resetTimer) {
    window.clearTimeout(bottomCarouselWheelState.resetTimer);
    bottomCarouselWheelState.resetTimer = 0;
  }
}

function isLikelyTrackpadWheelEvent(event, wheelDelta) {
  if (event.deltaMode !== 0) {
    return false;
  }

  const absoluteDeltaY = Math.abs(wheelDelta);
  const absoluteDeltaX = Math.abs(event.deltaX || 0);

  if (absoluteDeltaY <= 0) {
    return false;
  }

  if (absoluteDeltaX > 0.01) {
    return true;
  }

  const roundedDeltaY = Math.round(absoluteDeltaY);
  return Math.abs(absoluteDeltaY - roundedDeltaY) > 0.01 || absoluteDeltaY < 72;
}

function clearContinuousCarouselRecenterTimer(carousel) {
  const timer = continuousCarouselRecenterTimers.get(carousel);

  if (!timer) {
    return;
  }

  window.clearTimeout(timer);
  continuousCarouselRecenterTimers.delete(carousel);
}

function getCarouselQueuedSteps(carousel) {
  const queuedSteps = Number.parseInt(carousel?.dataset.carouselQueuedSteps || "0", 10);
  return Number.isFinite(queuedSteps) ? queuedSteps : 0;
}

function setCarouselQueuedSteps(carousel, steps) {
  if (!carousel) {
    return 0;
  }

  const normalizedSteps = Math.trunc(steps);

  if (!normalizedSteps) {
    delete carousel.dataset.carouselQueuedSteps;
    return 0;
  }

  const clampedSteps = Math.trunc(clampNumber(normalizedSteps, -carouselQueueStepLimit, carouselQueueStepLimit));
  carousel.dataset.carouselQueuedSteps = String(clampedSteps);
  return clampedSteps;
}

function getCarouselMomentum(carousel) {
  const momentum = Number.parseFloat(carousel?.dataset.carouselMomentum || "");

  if (!Number.isFinite(momentum)) {
    return carouselMomentumMin;
  }

  return clampNumber(momentum, carouselMomentumMin, carouselMomentumMax);
}

function setCarouselMomentum(carousel, momentum) {
  if (!carousel) {
    return carouselMomentumMin;
  }

  const clampedMomentum = clampNumber(
    Number.isFinite(momentum) ? momentum : carouselMomentumMin,
    carouselMomentumMin,
    carouselMomentumMax
  );

  carousel.dataset.carouselMomentum = clampedMomentum.toFixed(3);
  return clampedMomentum;
}

function clearCarouselMomentum(carousel) {
  if (!carousel) {
    return;
  }

  delete carousel.dataset.carouselMomentum;
}

function getCarouselMotionProfile(momentum = carouselMomentumMin) {
  const normalizedMomentum = clampNumber(
    (clampNumber(momentum, carouselMomentumMin, carouselMomentumMax) - carouselMomentumMin) /
      (carouselMomentumMax - carouselMomentumMin),
    0,
    1
  );

  return {
    duration: Math.round(
      carouselMotionDurationBase - normalizedMomentum * (carouselMotionDurationBase - carouselMotionDurationFast)
    ),
    fadeDuration: Math.round(
      carouselFadeDurationBase - normalizedMomentum * (carouselFadeDurationBase - carouselFadeDurationFast)
    ),
    easing: "cubic-bezier(0.16, 1, 0.3, 1)"
  };
}

function applyCarouselMotionProfile(carousel, profile = getCarouselMotionProfile()) {
  if (!carousel) {
    return;
  }

  carousel.style.setProperty("--carousel-motion-duration", `${profile.duration}ms`);
  carousel.style.setProperty("--carousel-fade-duration", `${profile.fadeDuration}ms`);
  carousel.style.setProperty("--carousel-motion-ease", profile.easing);
}

function isProjectPageScrollAtBottom() {
  const scrollRoot = document.scrollingElement || document.documentElement;

  return scrollRoot.scrollTop + window.innerHeight >= scrollRoot.scrollHeight - 2;
}

function isProjectFooterVisible() {
  const footer = document.querySelector(".site-footer");

  return Boolean(footer) && getElementVisibleRatio(footer) > 0.04;
}

function getBottomScrollCarousel() {
  return Array.from(document.querySelectorAll(".project-page .project-media-carousel"))
    .filter((carousel) => getCarouselItemCount(carousel) > 1 && !carousel.classList.contains("is-expanded"))
    .map((carousel) => {
      const track = carousel.querySelector(".project-media-carousel-track");
      const target = track || carousel;

      return {
        carousel,
        ratio: Math.max(getElementVisibleRatio(carousel), getElementVisibleRatio(target)),
        distance: getElementCenterDistance(target)
      };
    })
    .filter(({ ratio }) => ratio >= 0.06)
    .sort((left, right) => right.ratio - left.ratio || left.distance - right.distance)[0]?.carousel || null;
}

function handleProjectPageBottomWheel(event) {
  if (
    event.defaultPrevented ||
    event.deltaY <= 0 ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    isMobileCarouselLayout() ||
    !document.querySelector(".project-page") ||
    document.body.classList.contains("is-carousel-viewer-open")
  ) {
    return;
  }

  if (!isProjectPageScrollAtBottom() || !isProjectFooterVisible()) {
    resetBottomCarouselWheelState();
    return;
  }

  const carousel = getBottomScrollCarousel();

  if (!carousel) {
    resetBottomCarouselWheelState();
    return;
  }

  const now = performance.now();
  const elapsedSinceLastWheel = bottomCarouselWheelState.lastEventTime
    ? now - bottomCarouselWheelState.lastEventTime
    : Number.POSITIVE_INFINITY;

  if (elapsedSinceLastWheel > bottomCarouselWheelIdleReset) {
    bottomCarouselWheelState.accumulatedDelta = 0;
  }

  const wheelDelta = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
  const isTrackpadGesture = isLikelyTrackpadWheelEvent(event, wheelDelta);
  const isDiscreteWheelPulse = !isTrackpadGesture && (event.deltaMode === 1 || wheelDelta >= bottomCarouselWheelDiscreteDelta);

  bottomCarouselWheelState.lastEventTime = now;

  if (bottomCarouselWheelState.resetTimer) {
    window.clearTimeout(bottomCarouselWheelState.resetTimer);
  }

  bottomCarouselWheelState.resetTimer = window.setTimeout(() => {
    resetBottomCarouselWheelState();
  }, bottomCarouselWheelIdleReset);

  let stepsToQueue = 0;

  if (isDiscreteWheelPulse) {
    if (now < bottomCarouselWheelState.discreteLockUntil) {
      event.preventDefault();
      return;
    }

    stepsToQueue = 1;
    bottomCarouselWheelState.accumulatedDelta = 0;
    bottomCarouselWheelState.discreteLockUntil = now + bottomCarouselWheelDiscreteCooldown;
  } else {
    if (isTrackpadGesture && now < bottomCarouselWheelState.trackpadLockUntil) {
      event.preventDefault();
      return;
    }

    const threshold = isTrackpadGesture ? bottomCarouselTrackpadThreshold : bottomCarouselWheelThreshold;
    const immediateThreshold = isTrackpadGesture
      ? bottomCarouselTrackpadImmediateThreshold
      : bottomCarouselWheelImmediateThreshold;
    const carryLimit = isTrackpadGesture ? bottomCarouselTrackpadCarryLimit : bottomCarouselWheelCarryLimit;

    bottomCarouselWheelState.accumulatedDelta += wheelDelta;

    if (bottomCarouselWheelState.accumulatedDelta >= threshold) {
      stepsToQueue = 1;
      bottomCarouselWheelState.accumulatedDelta = Math.min(
        bottomCarouselWheelState.accumulatedDelta - threshold,
        threshold * carryLimit
      );
    } else if (wheelDelta >= immediateThreshold) {
      stepsToQueue = 1;
      bottomCarouselWheelState.accumulatedDelta = 0;
    }

    if (stepsToQueue > 0 && isTrackpadGesture) {
      bottomCarouselWheelState.trackpadLockUntil = now + bottomCarouselTrackpadCooldown;
    }
  }

  if (stepsToQueue <= 0) {
    if (carousel.dataset.carouselAnimating === "true") {
      event.preventDefault();
    }
    return;
  }

  event.preventDefault();

  const referenceThreshold = isTrackpadGesture ? bottomCarouselTrackpadThreshold : bottomCarouselWheelThreshold;
  const magnitudeBoost = Math.max(1, wheelDelta / (referenceThreshold * 0.72));
  const cadenceBoost = elapsedSinceLastWheel < 140
    ? clampNumber((140 - elapsedSinceLastWheel) / 140, 0, 1) *
      (isTrackpadGesture ? bottomCarouselTrackpadCadenceCap : 0.72)
    : 0;
  const rawIntensity = magnitudeBoost + cadenceBoost + Math.max(0, stepsToQueue - 1) * 0.28;
  const intensity = clampNumber(
    isTrackpadGesture ? rawIntensity * 0.82 : rawIntensity,
    carouselMomentumMin,
    isTrackpadGesture ? bottomCarouselTrackpadIntensityCap : carouselMomentumMax
  );

  requestCarouselScroll(carousel, 1, {
    steps: stepsToQueue,
    intensity
  });
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

function formatCarouselCount(value) {
  return String(value).padStart(2, "0");
}

function syncCarouselChrome(carousel, count, activeIndex) {
  const normalizedIndex = normalizeCarouselIndex(activeIndex, count);
  const counter = carousel.querySelector(".project-media-carousel-counter");
  const indicator = carousel.querySelector(".project-media-carousel-indicator");

  if (counter) {
    counter.textContent = `${formatCarouselCount(normalizedIndex + 1)} / ${formatCarouselCount(count)}`;
    counter.setAttribute("aria-label", `Media ${normalizedIndex + 1} of ${count}`);
  }

  if (!indicator) {
    return;
  }

  let ticks = Array.from(indicator.querySelectorAll(".project-media-carousel-tick"));

  if (ticks.length !== count) {
    indicator.textContent = "";
    ticks = Array.from({ length: count }, () => {
      const tick = document.createElement("span");
      tick.className = "project-media-carousel-tick";
      indicator.append(tick);
      return tick;
    });
  }

  ticks.forEach((tick, index) => {
    tick.classList.toggle("is-active", index === normalizedIndex);
  });
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

function syncCarouselVideo(item, shouldLoad, shouldWarm, shouldPlay) {
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

    if (item.classList.contains("is-active")) {
      playVideo(video);
      requestProjectVideoPosterReveal(video);
    } else {
      if (!video.paused) {
        video.pause();
      }

      setProjectVideoPosterVisible(video, true);
    }

    syncProjectAudioOutput(video);

    return;
  }

  if (shouldLoad) {
    loadCarouselVideoPreview(video);
  }

  if (shouldPlay) {
    video.autoplay = true;
    video.setAttribute("autoplay", "");
  } else {
    video.autoplay = false;
    video.removeAttribute("autoplay");
  }

  if (shouldPlay || shouldWarm) {
    playVideo(video);
    syncProjectAudioOutput(video);

    if (shouldPlay) {
      requestProjectVideoPosterReveal(video);
    } else {
      setProjectVideoPosterVisible(video, true);
    }

    return;
  }

  if (!video.paused) {
    video.pause();
  }

  syncProjectAudioOutput(video);
  setProjectVideoPosterVisible(video, true);
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
  syncCarouselVideo(item, shouldLoad, shouldCarouselItemWarm(item), shouldPlay);
}

function syncContinuousCarouselRecenterMedia(carousel, sourcePhysicalIndex, targetPhysicalIndex) {
  const items = getCarouselItems(carousel);
  const sourceItem = items[sourcePhysicalIndex];
  const targetItem = items[targetPhysicalIndex];

  if (!sourceItem || !targetItem || sourceItem === targetItem) {
    return;
  }

  const sourceVideo = prepareCarouselVideo(sourceItem);
  const targetVideo = prepareCarouselVideo(targetItem);

  if (!sourceVideo || !targetVideo) {
    return;
  }

  loadCarouselVideoPreview(targetVideo);

  const sourceTime = Number.isFinite(sourceVideo.currentTime) ? sourceVideo.currentTime : 0;
  const sourceHadLiveFrame = hasProjectVideoLiveFrame(sourceVideo);
  const shouldKeepPlaying = !sourceVideo.paused || sourceItem.classList.contains("is-active");

  const syncTargetState = () => {
    if (sourceTime > 0) {
      try {
        const duration = targetVideo.duration;
        const maxTime = Number.isFinite(duration) && duration > 0
          ? Math.max(0.001, duration - 0.05)
          : sourceTime;
        targetVideo.currentTime = Math.min(sourceTime, maxTime);
      } catch {}
    }

    if (shouldKeepPlaying) {
      playVideo(targetVideo);
    }

    if (sourceHadLiveFrame) {
      requestProjectVideoPosterReveal(targetVideo);
    } else {
      setProjectVideoPosterVisible(targetVideo, true);
    }
  };

  if (targetVideo.readyState >= 2) {
    syncTargetState();
    return;
  }

  targetVideo.addEventListener("loadeddata", syncTargetState, { once: true });
  targetVideo.addEventListener("canplay", syncTargetState, { once: true });

  if (shouldKeepPlaying) {
    playVideo(targetVideo);
  }
}

function scheduleContinuousCarouselRecenter(carousel, delay = 0) {
  if (!carousel || !isContinuousCarousel(carousel) || isMobileCarouselLayout()) {
    return;
  }

  clearContinuousCarouselRecenterTimer(carousel);

  const runRecenter = () => {
    continuousCarouselRecenterTimers.delete(carousel);

    if (carousel.dataset.carouselAnimating === "true" || carousel.classList.contains("is-expanded")) {
      scheduleContinuousCarouselRecenter(carousel, 36);
      return;
    }

    if (!shouldRecenterContinuousCarousel(carousel)) {
      return;
    }

    const currentPhysicalIndex = getCarouselPhysicalIndex(carousel);
    const centeredIndex = getContinuousCarouselCenteredIndex(carousel, getActiveCarouselIndex(carousel));

    if (currentPhysicalIndex === centeredIndex) {
      return;
    }

    const track = carousel.querySelector(".project-media-carousel-track");

    if (!track) {
      return;
    }

    syncContinuousCarouselRecenterMedia(carousel, currentPhysicalIndex, centeredIndex);
    track.classList.add("is-resetting");
    carousel.dataset.carouselPhysicalIndex = String(centeredIndex);
    renderCarousel(carousel);
    track.offsetHeight;
    track.classList.remove("is-resetting");
  };

  const timer = window.setTimeout(runRecenter, Math.max(0, delay));
  continuousCarouselRecenterTimers.set(carousel, timer);
}

function shouldCarouselItemWarm(item) {
  if (isMobileCarouselLayout()) {
    return false;
  }

  const carousel = item.closest(".project-media-carousel");

  if (!carousel || carousel.classList.contains("is-expanded")) {
    return false;
  }

  return Math.abs(Number(item.dataset.carouselOffset || 0)) <= 1;
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

  return false;
}

function syncCarouselPlayback(carousel) {
  getCarouselItems(carousel).forEach((item) => {
    syncCarouselMedia(item, shouldCarouselItemLoad(item), shouldCarouselItemPlay(item, carousel));
  });
}

function lockCarouselViewerScroll(scrollX, scrollY) {
  document.body.style.setProperty("--carousel-viewer-lock-left", `${-scrollX}px`);
  document.body.style.setProperty("--carousel-viewer-lock-top", `${-scrollY}px`);
  document.body.classList.add("is-carousel-viewer-open");
}

function unlockCarouselViewerScroll() {
  document.body.classList.remove("is-carousel-viewer-open");
  document.body.style.removeProperty("--carousel-viewer-lock-left");
  document.body.style.removeProperty("--carousel-viewer-lock-top");
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
    carousel.classList.remove("is-viewer-closing");
    lockCarouselViewerScroll(window.scrollX, window.scrollY);
    carousel.classList.add("is-expanded");
    syncCarouselPlayback(carousel);
    window.requestAnimationFrame(() => {
      carousel.classList.add("is-viewer-ready");
      requestCarouselSoundTogglePositionSync(carousel);
      window.setTimeout(() => {
        requestCarouselSoundTogglePositionSync(carousel);
      }, 520);
    });
    requestCarouselSoundTogglePositionSync(carousel);
    return;
  }

  if (shouldExpand) {
    carousel.classList.remove("is-viewer-closing");
    carousel.classList.add("is-viewer-ready");
    lockCarouselViewerScroll(window.scrollX, window.scrollY);
    syncCarouselPlayback(carousel);
    requestCarouselSoundTogglePositionSync(carousel);
    return;
  }

  if (isExpanded) {
    const scrollX = Number(carousel.dataset.viewerScrollX || window.scrollX);
    const scrollY = Number(carousel.dataset.viewerScrollY || window.scrollY);
    const restoreScroll = () => window.scrollTo(scrollX, scrollY);
    const restoreCarouselLayout = () => {
      renderCarousel(carousel);
      requestCarouselSoundTogglePositionSync(carousel);
    };

    carousel.classList.remove("is-expanded", "is-viewer-ready", "is-viewer-closing");
    unlockCarouselViewerScroll();
    delete carousel.dataset.viewerTransitionTimer;
    restoreCarouselLayout();
    syncCarouselPlayback(carousel);
    restoreScroll();
    window.requestAnimationFrame(() => {
      restoreCarouselLayout();
      restoreScroll();
    });
    window.setTimeout(() => {
      restoreCarouselLayout();
      restoreScroll();
    }, 80);
    return;
  }

  unlockCarouselViewerScroll();
  syncCarouselPlayback(carousel);
  requestCarouselSoundTogglePositionSync(carousel);
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

function clearProjectVideoSoundTogglePosition(item) {
  const button = item?.querySelector(".project-video-sound-toggle");

  if (!button) {
    return;
  }

  button.style.removeProperty("--project-sound-toggle-right");
  button.style.removeProperty("--project-sound-toggle-bottom");
}

function updateProjectVideoSoundTogglePosition(item) {
  const button = item?.querySelector(".project-video-sound-toggle");
  const media = item?.querySelector("video[data-allow-audio='true']");

  if (!button || !media) {
    return;
  }

  const itemRect = item.getBoundingClientRect();
  const visibleRect = getMediaVisibleRect(media);

  if (!itemRect.width || !itemRect.height || !visibleRect.width || !visibleRect.height) {
    clearProjectVideoSoundTogglePosition(item);
    return;
  }

  const inset = clampNumber(
    Math.min(visibleRect.width, visibleRect.height) * 0.035,
    carouselExpandedSoundToggleInsetMin,
    carouselExpandedSoundToggleInsetMax
  );
  const right = Math.max(12, itemRect.right - visibleRect.right + inset);
  const bottom = Math.max(12, itemRect.bottom - visibleRect.bottom + inset);

  button.style.setProperty("--project-sound-toggle-right", `${right.toFixed(2)}px`);
  button.style.setProperty("--project-sound-toggle-bottom", `${bottom.toFixed(2)}px`);
}

function syncCarouselSoundTogglePosition(carousel) {
  if (!carousel) {
    return;
  }

  const items = getCarouselItems(carousel);
  items.forEach(clearProjectVideoSoundTogglePosition);

  if (!carousel.classList.contains("is-expanded")) {
    return;
  }

  const activeItem = items.find((item) => item.classList.contains("is-active"))
    || items.find((item) => Number(item.dataset.carouselOffset || 0) === 0);

  if (!activeItem) {
    return;
  }

  updateProjectVideoSoundTogglePosition(activeItem);
}

function requestCarouselSoundTogglePositionSync(carousel) {
  if (!carousel) {
    return;
  }

  const frameId = Number(carousel.dataset.soundToggleSyncFrame || 0);

  if (frameId) {
    window.cancelAnimationFrame(frameId);
  }

  carousel.dataset.soundToggleSyncFrame = String(window.requestAnimationFrame(() => {
    delete carousel.dataset.soundToggleSyncFrame;
    syncCarouselSoundTogglePosition(carousel);
  }));
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

function parseCssNumber(value, fallback = 0) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function getCarouselItemLayoutWidth(item) {
  if (!item) {
    return 0;
  }

  const computedStyle = window.getComputedStyle(item);
  const computedWidth = parseCssNumber(computedStyle.width);

  if (computedWidth > 0) {
    return computedWidth;
  }

  return item.offsetWidth || item.clientWidth || item.getBoundingClientRect().width || 0;
}

function getCarouselItemVisualWidth(item) {
  if (!item) {
    return 0;
  }

  const computedStyle = window.getComputedStyle(item);
  const layoutWidth = getCarouselItemLayoutWidth(item);
  const scale = parseCssNumber(computedStyle.getPropertyValue("--carousel-scale"), 1) || 1;

  return layoutWidth * scale;
}

function getCarouselItemGap(carousel, offset) {
  const track = carousel.querySelector(".project-media-carousel-track");
  const referenceWidth = track?.clientWidth || carousel.clientWidth || window.innerWidth;
  const absoluteOffset = Math.abs(offset);

  if (absoluteOffset <= 1) {
    return Math.max(24, Math.min(referenceWidth * 0.02, 44));
  }

  if (absoluteOffset <= 2) {
    return Math.max(16, Math.min(referenceWidth * 0.015, 32));
  }

  return Math.max(12, Math.min(referenceWidth * 0.012, 24));
}

function getCarouselItemRatio(item) {
  if (!item) {
    return 1;
  }

  const computedStyle = window.getComputedStyle(item);
  const declaredRatio = parseCssNumber(computedStyle.getPropertyValue("--media-ratio"), 0);

  if (declaredRatio > 0) {
    return declaredRatio;
  }

  const media = item.querySelector("img, video");
  const loadedRatio = getLoadedMediaRatio(media);

  if (loadedRatio > 0) {
    return loadedRatio;
  }

  return 1;
}

function syncCarouselItemFrames(carousel, items) {
  const track = carousel.querySelector(".project-media-carousel-track");

  if (!track || !items.length || isMobileCarouselLayout()) {
    return;
  }

  const trackStyle = window.getComputedStyle(track);
  const paddingX = parseCssNumber(trackStyle.paddingLeft) + parseCssNumber(trackStyle.paddingRight);
  const paddingY = parseCssNumber(trackStyle.paddingTop) + parseCssNumber(trackStyle.paddingBottom);
  const availableWidth = Math.max(0, track.clientWidth - paddingX);
  const availableHeight = Math.max(0, track.clientHeight - paddingY);
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || availableWidth;
  const maxFrameWidth = Math.max(0, Math.min(availableWidth, viewportWidth - 96, viewportWidth * 0.78));

  items.forEach((item) => {
    const ratio = getCarouselItemRatio(item);
    let frameHeight = availableHeight;
    let frameWidth = frameHeight * ratio;

    if (maxFrameWidth > 0 && frameWidth > maxFrameWidth) {
      frameWidth = maxFrameWidth;
      frameHeight = frameWidth / Math.max(ratio, 0.01);
    }

    if (!Number.isFinite(frameWidth) || frameWidth <= 0 || !Number.isFinite(frameHeight) || frameHeight <= 0) {
      item.style.removeProperty("--carousel-item-width");
      item.style.removeProperty("--carousel-item-height");
      return;
    }

    item.style.setProperty("--carousel-item-width", `${frameWidth.toFixed(2)}px`);
    item.style.setProperty("--carousel-item-height", `${frameHeight.toFixed(2)}px`);
  });
}

function syncCarouselItemPositions(carousel, items) {
  const itemsByOffset = new Map();

  items.forEach((item) => {
    itemsByOffset.set(Number(item.dataset.carouselOffset || 0), item);
  });

  const centerItem = itemsByOffset.get(0);

  if (!centerItem) {
    items.forEach((item) => {
      item.style.setProperty("--carousel-translate-x", "0px");
    });
    return;
  }

  const positions = new Map([[0, 0]]);
  const offsets = Array.from(itemsByOffset.keys()).sort((left, right) => left - right);

  let previousOffset = 0;
  let previousItem = centerItem;
  offsets.filter((offset) => offset > 0).forEach((offset) => {
    const item = itemsByOffset.get(offset);

    if (!item || !previousItem) {
      return;
    }

    const previousPosition = positions.get(previousOffset) || 0;
    const previousWidth = getCarouselItemVisualWidth(previousItem);
    const currentWidth = getCarouselItemVisualWidth(item);
    const gap = getCarouselItemGap(carousel, offset);
    const nextPosition = previousPosition + previousWidth / 2 + currentWidth / 2 + gap;

    positions.set(offset, nextPosition);
    previousOffset = offset;
    previousItem = item;
  });

  previousOffset = 0;
  previousItem = centerItem;
  offsets.filter((offset) => offset < 0).sort((left, right) => right - left).forEach((offset) => {
    const item = itemsByOffset.get(offset);

    if (!item || !previousItem) {
      return;
    }

    const previousPosition = positions.get(previousOffset) || 0;
    const previousWidth = getCarouselItemVisualWidth(previousItem);
    const currentWidth = getCarouselItemVisualWidth(item);
    const gap = getCarouselItemGap(carousel, offset);
    const nextPosition = previousPosition - previousWidth / 2 - currentWidth / 2 - gap;

    positions.set(offset, nextPosition);
    previousOffset = offset;
    previousItem = item;
  });

  items.forEach((item) => {
    const offset = Number(item.dataset.carouselOffset || 0);
    const position = positions.get(offset) || 0;
    item.style.setProperty("--carousel-translate-x", `${position.toFixed(2)}px`);
  });
}

function renderCarousel(carousel) {
  const items = getCarouselItems(carousel);
  const logicalCount = getCarouselItemCount(carousel);
  const continuousMode = isContinuousCarousel(carousel);
  const activeIndex = continuousMode ? getCarouselPhysicalIndex(carousel) : getCarouselVirtualIndex(carousel);

  if (!items.length || !logicalCount) {
    return;
  }

  items.forEach((item, index) => {
    const offset = continuousMode
      ? index - activeIndex
      : getCarouselCircularOffset(index, activeIndex, items.length);
    const isActive = offset === 0;
    const isNear = isMobileCarouselLayout() || Math.abs(offset) <= 2;
    const logicalIndex = continuousMode
      ? getCarouselLogicalIndexForItem(item, index)
      : index;

    item.dataset.carouselIndex = String(logicalIndex);
    item.dataset.carouselPhysicalIndex = String(index);
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

  syncCarouselItemFrames(carousel, items);
  syncCarouselItemPositions(carousel, items);

  const activeItem = items[activeIndex] || items[0];
  const activeLogicalIndex = continuousMode
    ? getCarouselLogicalIndexForItem(activeItem, 0)
    : normalizeCarouselIndex(activeIndex, logicalCount);

  carousel.dataset.carouselIndex = String(normalizeCarouselIndex(activeLogicalIndex, logicalCount));

  if (carousel.dataset.carouselPriming !== "true") {
    carousel.classList.add("is-ready");
  }

  syncCarouselChrome(carousel, logicalCount, activeLogicalIndex);
  syncCarouselPlayback(carousel);
  requestCarouselSoundTogglePositionSync(carousel);
}

function setCarouselIndex(carousel, index) {
  const count = getCarouselItemCount(carousel);

  if (!count) {
    return;
  }

  carousel.dataset.carouselVirtualIndex = String(index);
  renderCarousel(carousel);
}

function isEditableCarouselKeyTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.isContentEditable
    || target.closest("[contenteditable='true']")
    || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function navigateExpandedCarousel(carousel, direction) {
  if (!carousel || !carousel.classList.contains("is-expanded")) {
    return;
  }

  const count = getCarouselItemCount(carousel);

  if (count <= 1) {
    return;
  }

  const step = direction > 0 ? 1 : -1;

  if (isContinuousCarousel(carousel)) {
    carousel.dataset.carouselPhysicalIndex = String(
      getContinuousCarouselCenteredIndex(carousel, getActiveCarouselIndex(carousel) + step)
    );
    renderCarousel(carousel);
    return;
  }

  setCarouselIndex(carousel, getCarouselVirtualIndex(carousel) + step);
}

function consumeCarouselScrollQueue(carousel) {
  if (!carousel || carousel.dataset.carouselAnimating === "true" || carousel.classList.contains("is-expanded")) {
    return;
  }

  const queuedSteps = getCarouselQueuedSteps(carousel);

  if (!queuedSteps) {
    clearCarouselMomentum(carousel);
    applyCarouselMotionProfile(carousel, getCarouselMotionProfile());
    return;
  }

  const direction = queuedSteps > 0 ? 1 : -1;
  setCarouselQueuedSteps(carousel, queuedSteps - direction);
  scrollCarousel(carousel, direction, {
    momentum: getCarouselMomentum(carousel)
  });
}

function requestCarouselScroll(carousel, direction, options = {}) {
  if (!carousel) {
    return;
  }

  const normalizedDirection = direction > 0 ? 1 : -1;
  const steps = clampNumber(Math.abs(Math.round(options.steps || 1)) || 1, 1, carouselQueueStepLimit);
  const intensity = clampNumber(
    Number.isFinite(options.intensity) ? options.intensity : carouselMomentumMin,
    carouselMomentumMin,
    carouselMomentumMax
  );

  const nextQueuedSteps = setCarouselQueuedSteps(
    carousel,
    getCarouselQueuedSteps(carousel) + normalizedDirection * steps
  );

  if (!nextQueuedSteps) {
    clearCarouselMomentum(carousel);
    applyCarouselMotionProfile(carousel, getCarouselMotionProfile());
    return;
  }

  const currentMomentum = getCarouselMomentum(carousel);
  setCarouselMomentum(
    carousel,
    Math.max(currentMomentum * 0.72, carouselMomentumMin) +
      (intensity - carouselMomentumMin) +
      Math.max(0, steps - 1) * 0.32
  );

  consumeCarouselScrollQueue(carousel);
}

function scrollCarousel(carousel, direction, options = {}) {
  const track = carousel.querySelector(".project-media-carousel-track");
  const count = getCarouselItemCount(carousel);
  const continuousMode = isContinuousCarousel(carousel);

  if (!track || count <= 1 || carousel.classList.contains("is-expanded") || carousel.dataset.carouselAnimating === "true") {
    return;
  }

  const motionProfile = getCarouselMotionProfile(options.momentum ?? getCarouselMomentum(carousel));
  const releaseDelay = Math.max(
    carouselMotionReleaseMin,
    Math.round(motionProfile.duration * carouselMotionReleaseRatio)
  );

  applyCarouselMotionProfile(carousel, motionProfile);
  clearContinuousCarouselRecenterTimer(carousel);
  carousel.dataset.carouselAnimating = "true";
  track.classList.remove("is-moving-next", "is-moving-prev", "is-resetting");
  track.classList.add("is-animating");

  if (continuousMode) {
    carousel.dataset.carouselPhysicalIndex = String(getCarouselPhysicalIndex(carousel) + (direction > 0 ? 1 : -1));
    renderCarousel(carousel);
  } else {
    setCarouselIndex(carousel, getCarouselVirtualIndex(carousel) + (direction > 0 ? 1 : -1));
  }

  let didFinish = false;

  const finish = () => {
    if (didFinish) {
      return;
    }

    didFinish = true;
    if (continuousMode) {
      scheduleContinuousCarouselRecenter(
        carousel,
        Math.max(24, motionProfile.duration - releaseDelay + 40)
      );
    }

    track.classList.remove("is-animating");
    delete carousel.dataset.carouselAnimating;

    if (getCarouselQueuedSteps(carousel)) {
      setCarouselMomentum(carousel, getCarouselMomentum(carousel) * carouselMomentumDecay);
      window.requestAnimationFrame(() => {
        consumeCarouselScrollQueue(carousel);
      });
      return;
    }

    clearCarouselMomentum(carousel);
    applyCarouselMotionProfile(carousel, getCarouselMotionProfile());
  };
  window.setTimeout(() => {
    if (carousel.dataset.carouselAnimating === "true") {
      finish();
    }
  }, releaseDelay);
}

function setupProjectCarousel(carousel) {
  const track = carousel.querySelector(".project-media-carousel-track");
  expandContinuousCarouselTrack(carousel);
  const items = getCarouselItems(carousel);
  const continuousMode = isContinuousCarousel(carousel);

  if (!track || !items.length) {
    return;
  }

  carousel.dataset.carouselIndex = "0";
  carousel.dataset.carouselVirtualIndex = "0";
  if (continuousMode) {
    carousel.dataset.carouselPhysicalIndex = String(getContinuousCarouselCenteredIndex(carousel, 0));
  }
  carousel.dataset.carouselPriming = "true";
  applyCarouselMotionProfile(carousel, getCarouselMotionProfile());

  track.classList.remove("is-moving-next", "is-moving-prev", "is-animating");
  track.classList.add("is-resetting");
  renderCarousel(carousel);

  const initiallyVisibleItems = items.filter((item) => Math.abs(Number(item.dataset.carouselOffset || 0)) <= 2);

  items
    .filter((item) => !initiallyVisibleItems.includes(item))
    .forEach((item) => {
      primeMediaItemRatio(item);
    });

  Promise.all(initiallyVisibleItems.map((item) => primeMediaItemRatio(item))).finally(() => {
    delete carousel.dataset.carouselPriming;
    renderCarousel(carousel);
    track.offsetHeight;
    track.classList.remove("is-resetting");
  });

  carousel.addEventListener("click", (event) => {
    if (isMobileCarouselLayout()) {
      return;
    }

    const soundToggle = event.target.closest(".project-video-sound-toggle")
      || getCarouselSoundToggleAtPoint(carousel, event.clientX, event.clientY);

    if (soundToggle) {
      if (!event.target.closest(".project-video-sound-toggle")) {
        soundToggle.click();
      }
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
      requestCarouselScroll(carousel, offset > 0 ? 1 : -1);
      return;
    }

    setCarouselViewer(carousel, true);
  });

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
      requestCarouselScroll(carousel, offset > 0 ? 1 : -1);
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
      requestCarouselScroll(carousel, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      requestCarouselScroll(carousel, 1);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!carousel.classList.contains("is-expanded")) {
      return;
    }

    if (event.key === "Escape") {
      setCarouselViewer(carousel, false);
      return;
    }

    if (
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      || event.metaKey
      || event.ctrlKey
      || event.altKey
      || isEditableCarouselKeyTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    navigateExpandedCarousel(carousel, event.key === "ArrowRight" ? 1 : -1);
  });

  window.addEventListener("resize", () => {
    if (continuousMode && !isMobileCarouselLayout()) {
      carousel.dataset.carouselPhysicalIndex = String(getContinuousCarouselCenteredIndex(carousel, getActiveCarouselIndex(carousel)));
    }

    renderCarousel(carousel);
  });
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
      requestProjectVideoPosterReveal(video);
      syncProjectAudioOutput(video);
      return;
    }

    video.pause();
    setProjectVideoPosterVisible(video, true);
    syncProjectAudioOutput(video);
  });
}

function scheduleMobileProjectVideoSync() {
  if (mobileProjectVideoSyncFrame) {
    return;
  }

  mobileProjectVideoSyncFrame = window.requestAnimationFrame(syncMobileProjectVideos);
}

setupMobileProjectVideoPlayback();
setupProjectVideoSoundControls();
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
window.addEventListener("wheel", handleProjectPageBottomWheel, { passive: false });
window.addEventListener("resize", scheduleMobileProjectVideoSync);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    autoplayInitialProjectVideos();
    scheduleMobileProjectVideoSync();
  }
});
