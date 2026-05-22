const projectGrid = document.querySelector("[data-project-grid]");
const supportsIndexHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isTouchIndex = window.matchMedia("(hover: none), (pointer: coarse)").matches;
const reduceIndexMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const indexEdgeAutoScroll = {
  frame: null,
  speed: 0
};
const allIndexVideos = new Set();
const visibleIndexCards = new Map();
let indexVideoSyncFrame = null;
let indexGridResizeFrame = null;

function prepareDesktopIndexVideo(video) {
  if (!supportsIndexHover || !video) {
    return;
  }

  video.dataset.lazyAutoplay = "false";
  video.autoplay = false;
  video.preload = "metadata";
  video.removeAttribute("autoplay");
}

function isIndexLoaderActive() {
  return document.body.classList.contains("is-index-loading");
}

function stopIndexEdgeAutoScroll() {
  indexEdgeAutoScroll.speed = 0;

  if (indexEdgeAutoScroll.frame) {
    cancelAnimationFrame(indexEdgeAutoScroll.frame);
    indexEdgeAutoScroll.frame = null;
  }
}

function getIndexEdgeAutoScrollSpeed(clientY) {
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

function stepIndexEdgeAutoScroll() {
  if (!indexEdgeAutoScroll.speed) {
    stopIndexEdgeAutoScroll();
    return;
  }

  window.scrollBy(0, indexEdgeAutoScroll.speed);
  indexEdgeAutoScroll.frame = requestAnimationFrame(stepIndexEdgeAutoScroll);
}

function updateIndexEdgeAutoScroll(event) {
  if (!supportsIndexHover || !projectGrid) {
    return;
  }

  indexEdgeAutoScroll.speed = getIndexEdgeAutoScrollSpeed(event.clientY);

  if (!indexEdgeAutoScroll.speed) {
    stopIndexEdgeAutoScroll();
    return;
  }

  if (!indexEdgeAutoScroll.frame) {
    indexEdgeAutoScroll.frame = requestAnimationFrame(stepIndexEdgeAutoScroll);
  }
}

function resizeIndexCard(card) {
  if (!projectGrid || !card) {
    return;
  }

  const gridStyles = window.getComputedStyle(projectGrid);
  const rowHeight = Number.parseFloat(gridStyles.gridAutoRows);
  const rowGap = Number.parseFloat(gridStyles.rowGap);

  if (!rowHeight) {
    return;
  }

  card.style.gridRowEnd = "auto";
  const cardHeight = card.getBoundingClientRect().height;
  const span = Math.ceil((cardHeight + rowGap) / (rowHeight + rowGap));
  card.style.gridRowEnd = `span ${Math.max(1, span)}`;
}

function resizeIndexGrid() {
  if (!projectGrid) {
    return;
  }

  Array.from(projectGrid.children).forEach(resizeIndexCard);
}

function scheduleIndexGridResize() {
  if (indexGridResizeFrame) {
    cancelAnimationFrame(indexGridResizeFrame);
  }

  indexGridResizeFrame = window.requestAnimationFrame(() => {
    indexGridResizeFrame = null;
    resizeIndexGrid();
    window.setTimeout(resizeIndexGrid, 80);
    window.setTimeout(resizeIndexGrid, 220);
  });
}

function getIndexGridColumns() {
  if (!projectGrid) {
    return [];
  }

  return window.getComputedStyle(projectGrid).gridTemplateColumns
    .split(" ")
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function getIndexCardColumn(card) {
  const columns = getIndexGridColumns();

  if (!projectGrid || !card || !columns.length) {
    return 0;
  }

  const gridStyles = window.getComputedStyle(projectGrid);
  const gridRect = projectGrid.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const gap = Number.parseFloat(gridStyles.columnGap) || 0;
  const paddingLeft = Number.parseFloat(gridStyles.paddingLeft) || 0;
  const contentLeft = gridRect.left + paddingLeft;
  const cardCenter = cardRect.left + cardRect.width / 2;
  let x = contentLeft;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  columns.forEach((width, index) => {
    const columnCenter = x + width / 2;
    const distance = Math.abs(cardCenter - columnCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }

    x += width + gap;
  });

  return closestIndex;
}

function getExpandedIndexGridColumn(card) {
  const columns = getIndexGridColumns();

  if (columns.length < 3) {
    return "";
  }

  const column = getIndexCardColumn(card);
  const startLine = column >= columns.length - 1 ? columns.length - 1 : column + 1;

  return `${startLine} / span 2`;
}

function animateIndexGridLayout(applyLayoutChange) {
  if (!projectGrid || reduceIndexMotion) {
    applyLayoutChange();
    scheduleIndexGridResize();
    return;
  }

  const cards = Array.from(projectGrid.children);

  cards.forEach((card) => {
    card.style.transition = "";
    card.style.transform = "";
    card.style.transformOrigin = "";
  });

  const firstRects = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));

  applyLayoutChange();
  resizeIndexGrid();

  window.requestAnimationFrame(() => {
    resizeIndexGrid();

    cards.forEach((card) => {
      const first = firstRects.get(card);
      const last = card.getBoundingClientRect();

      if (!first || !last.width || !last.height) {
        return;
      }

      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      const scaleX = first.width / last.width;
      const scaleY = first.height / last.height;
      const hasMovement = Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5;
      const hasScale = Math.abs(scaleX - 1) > 0.002 || Math.abs(scaleY - 1) > 0.002;

      if (!hasMovement && !hasScale) {
        return;
      }

      card.style.transition = "none";
      card.style.transformOrigin = "top left";
      card.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
    });

    window.requestAnimationFrame(() => {
      cards.forEach((card) => {
        if (!card.style.transform) {
          return;
        }

        card.style.transition = "transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)";
        card.style.transform = "";
      });

      window.setTimeout(() => {
        cards.forEach((card) => {
          card.style.transition = "";
          card.style.transformOrigin = "";
        });
        resizeIndexGrid();
      }, 460);
    });
  });
}

function setIndexCardExpanded(card, expanded) {
  if (!supportsIndexHover || !card) {
    return;
  }

  if (card.classList.contains("is-index-hovered") === expanded) {
    return;
  }

  animateIndexGridLayout(() => {
    card.classList.toggle("is-index-hovered", expanded);
    card.style.gridColumn = expanded ? getExpandedIndexGridColumn(card) : "";
  });
}

function setupIndexCardExpansion(card) {
  if (!supportsIndexHover || !card) {
    return;
  }

  card.addEventListener("pointerenter", () => setIndexCardExpanded(card, true));
  card.addEventListener("pointerleave", () => setIndexCardExpanded(card, false));
  card.addEventListener("focusin", () => setIndexCardExpanded(card, true));
  card.addEventListener("focusout", () => setIndexCardExpanded(card, false));
}

function requestIndexVideoPlayback(video) {
  if (!video) {
    return;
  }

  video.dataset.lazyAutoplay = "true";
  window.PORTFOLIO_MEDIA_LAZY?.load(video);
  window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(video);
}

function stopIndexVideoPlayback(video) {
  if (!video) {
    return;
  }

  video.pause();

  if (supportsIndexHover) {
    video.dataset.lazyAutoplay = "false";
    video.autoplay = false;
    video.removeAttribute("autoplay");

    if (video.readyState >= 1) {
      try {
        video.currentTime = 0.001;
      } catch {}
    }
  }
}

function queueIndexVideoPlayback(video) {
  if (isIndexLoaderActive()) {
    window.PORTFOLIO_MEDIA_LAZY?.load(video);
    return;
  }

  requestIndexVideoPlayback(video);
  window.requestAnimationFrame(() => requestIndexVideoPlayback(video));
  window.setTimeout(() => requestIndexVideoPlayback(video), 500);
}

function resumeVisibleIndexVideos() {
  syncIndexVideoPlayback();
}

function getVisibleRatio(element) {
  const rect = element.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;

  if (!area) {
    return 0;
  }

  return (visibleWidth * visibleHeight) / area;
}

function syncIndexVideoPlayback() {
  indexVideoSyncFrame = null;

  if (!allIndexVideos.size) {
    return;
  }

  if (isIndexLoaderActive()) {
    return;
  }

  if (!isTouchIndex) {
    return;
  }

  const activeVideos = new Set();

  const minVisibleRatio = isTouchIndex ? 0.08 : 0.01;

  visibleIndexCards.forEach((video, card) => {
    if (getVisibleRatio(card) >= minVisibleRatio) {
      activeVideos.add(video);
    }
  });

  activeVideos.forEach(queueIndexVideoPlayback);

  allIndexVideos.forEach((video) => {
    if (!activeVideos.has(video) && !video.paused) {
      video.pause();
    }
  });
}

function scheduleIndexVideoSync() {
  if (indexVideoSyncFrame) {
    return;
  }

  indexVideoSyncFrame = window.requestAnimationFrame(syncIndexVideoPlayback);
}

function primeInitialIndexVideos() {
  const videos = Array.from(allIndexVideos);
  const preloadMargin = 260;

  videos.forEach((video) => {
    const rect = video.getBoundingClientRect();
    const isNearViewport = rect.bottom >= -preloadMargin && rect.top <= window.innerHeight + preloadMargin;

    if (isNearViewport) {
      window.PORTFOLIO_MEDIA_LAZY?.load(video, { autoplay: false });
    }
  });

  scheduleIndexVideoSync();
}

const indexCardObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target;
      const video = card.querySelector("video.project-media");

      if (!video) {
        return;
      }

      if (entry.isIntersecting) {
        visibleIndexCards.set(card, video);
        window.PORTFOLIO_MEDIA_LAZY?.load(video, { autoplay: isTouchIndex });
        scheduleIndexVideoSync();
        return;
      }

      visibleIndexCards.delete(card);
      stopIndexVideoPlayback(video);
      scheduleIndexVideoSync();
    });
  }, {
    rootMargin: "120px 0px",
    threshold: [0, 0.08, 0.16, 0.32, 0.5, 0.75]
  })
  : null;

function observeIndexVideoCard(card, video) {
  if (!card || !video) {
    return;
  }

  if (!indexCardObserver) {
    visibleIndexCards.set(card, video);
    scheduleIndexVideoSync();
    return;
  }

  indexCardObserver.observe(card);
  video.addEventListener("loadedmetadata", scheduleIndexVideoSync, { once: true });
  video.addEventListener("canplay", scheduleIndexVideoSync, { once: true });

  if (supportsIndexHover) {
    card.addEventListener("pointerenter", () => requestIndexVideoPlayback(video));
    card.addEventListener("pointerleave", () => stopIndexVideoPlayback(video));
    card.addEventListener("focusin", () => requestIndexVideoPlayback(video));
    card.addEventListener("focusout", () => stopIndexVideoPlayback(video));
  }
}

function setupIndexVideoPoster(video, poster) {
  if (!video || !poster) {
    return;
  }

  if (video.dataset.posterSrc) {
    poster.style.backgroundImage = `url("${video.dataset.posterSrc}")`;
    poster.dataset.posterReady = "true";
  }

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

    const maxPosterWidth = 960;
    const scale = Math.min(1, maxPosterWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    try {
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      poster.style.backgroundImage = `url("${canvas.toDataURL("image/jpeg", 0.82)}")`;
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
  video.addEventListener("pause", () => {
    if (supportsIndexHover) {
      showPoster();
      return;
    }

    showPosterBeforePlayback();
  });
  video.addEventListener("waiting", showPosterBeforePlayback);
  video.addEventListener("stalled", showPosterBeforePlayback);
  video.addEventListener("emptied", showPosterBeforePlayback);
  video.addEventListener("error", showPoster);
}

if (projectGrid && window.PORTFOLIO_PROJECTS) {
  projectGrid.innerHTML = "";

  window.PORTFOLIO_PROJECTS
    .filter((project) => !project.hidden)
    .forEach((project) => {
      const card = document.createElement("a");
      card.className = "project-card";
      card.href = `project.html?project=${project.slug}`;
      card.dataset.category = project.cardType || "";

      const media = createMediaElement(
        project.media.cover,
        `assets/projects/${project.slug}`,
        "project-media",
        { deferObserve: true, poster: true }
      );

      if (media.tagName === "VIDEO") {
        prepareDesktopIndexVideo(media);
      }

      const resizeCard = () => resizeIndexCard(card);

      if (media.tagName === "VIDEO") {
        media.addEventListener("loadedmetadata", resizeCard, { once: true });
      } else if (media.complete) {
        window.requestAnimationFrame(resizeCard);
      } else {
        media.addEventListener("load", resizeCard, { once: true });
      }

      const info = document.createElement("div");
      info.className = "project-card-info";

      const title = document.createElement("h2");
      title.textContent = project.title;

      const category = document.createElement("p");
      category.textContent = project.cardCategory || project.category;

      info.append(title, category);

      const mediaFrame = document.createElement("div");
      mediaFrame.className = "index-media-frame";

      if (media.tagName === "VIDEO") {
        const poster = document.createElement("div");
        poster.className = "index-video-poster";
        poster.setAttribute("aria-hidden", "true");
        setupIndexVideoPoster(media, poster);
        mediaFrame.append(media, poster);
      } else {
        mediaFrame.append(media);
      }

      card.append(mediaFrame, info);

      projectGrid.append(card);
      setupIndexCardExpansion(card);

      if (media.tagName !== "VIDEO" || isTouchIndex) {
        window.PORTFOLIO_INDEX_LOADER?.register(media);
      }

      if (media.tagName === "VIDEO") {
        allIndexVideos.add(media);
        observeIndexVideoCard(card, media);
      } else {
        window.PORTFOLIO_MEDIA_LAZY?.observe(media);
      }
    });

  resizeIndexGrid();
  window.requestAnimationFrame(primeInitialIndexVideos);
  window.setTimeout(primeInitialIndexVideos, 350);
  document.fonts?.ready.then(resizeIndexGrid);
  document.fonts?.ready.then(scheduleIndexVideoSync);
  window.addEventListener("portfolio:index-loader-hidden", () => {
    scheduleIndexVideoSync();
    window.setTimeout(scheduleIndexVideoSync, 220);
    window.setTimeout(scheduleIndexVideoSync, 700);
  });
  window.addEventListener("scroll", scheduleIndexVideoSync, { passive: true });
  window.addEventListener("resize", () => {
    resizeIndexGrid();
    scheduleIndexVideoSync();
  });
  window.PORTFOLIO_INDEX_LOADER?.ready();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resumeVisibleIndexVideos();
    }
  });
  window.addEventListener("pageshow", resumeVisibleIndexVideos);
  window.addEventListener("pointerdown", resumeVisibleIndexVideos, { once: true });
  window.addEventListener("touchstart", resumeVisibleIndexVideos, { once: true, passive: true });

  if (supportsIndexHover) {
    window.addEventListener("pointermove", updateIndexEdgeAutoScroll);
    window.addEventListener("blur", stopIndexEdgeAutoScroll);
    window.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget) {
        stopIndexEdgeAutoScroll();
      }
    });
  }
}
