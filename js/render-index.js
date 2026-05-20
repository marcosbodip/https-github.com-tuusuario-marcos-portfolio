const projectGrid = document.querySelector("[data-project-grid]");
const supportsIndexHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isTouchIndex = window.matchMedia("(hover: none), (pointer: coarse)").matches;
const indexEdgeAutoScroll = {
  frame: null,
  speed: 0
};
const allIndexVideos = new Set();
const visibleIndexVideos = new Map();
let indexVideoSyncFrame = null;

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

function requestIndexVideoPlayback(video) {
  if (!video) {
    return;
  }

  window.PORTFOLIO_MEDIA_LAZY?.load(video);
  window.PORTFOLIO_MEDIA_LAZY?.requestVideoAutoplay(video);
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

function getIndexVideoRatio(video) {
  const rect = video.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;

  if (!area) {
    return 0;
  }

  return (visibleWidth * visibleHeight) / area;
}

function getIndexVideoScore(video, ratio) {
  const rect = video.getBoundingClientRect();
  const center = rect.top + rect.height / 2;
  const centerDistance = Math.abs(center - window.innerHeight / 2) / window.innerHeight;

  return ratio - centerDistance * 0.35;
}

function syncIndexVideoPlayback() {
  indexVideoSyncFrame = null;

  if (!allIndexVideos.size) {
    return;
  }

  if (isIndexLoaderActive()) {
    return;
  }

  const activeVideos = new Set();

  if (isTouchIndex) {
    const candidates = Array.from(allIndexVideos)
      .map((video) => [video, getIndexVideoRatio(video)])
      .filter(([, ratio]) => ratio >= 0.16)
      .sort((a, b) => getIndexVideoScore(b[0], b[1]) - getIndexVideoScore(a[0], a[1]));

    candidates.slice(0, 1).forEach(([video]) => activeVideos.add(video));
  } else {
    visibleIndexVideos.forEach((ratio, video) => {
      if (ratio > 0.01) {
        activeVideos.add(video);
      }
    });
  }

  activeVideos.forEach(queueIndexVideoPlayback);

  if (isTouchIndex) {
    allIndexVideos.forEach((video) => {
      if (!activeVideos.has(video) && !video.paused) {
        video.pause();
      }
    });
  }
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
      window.PORTFOLIO_MEDIA_LAZY?.load(video);
    }
  });

  scheduleIndexVideoSync();
}

const indexVideoObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;

      if (entry.isIntersecting) {
        visibleIndexVideos.set(video, entry.intersectionRatio);
        window.PORTFOLIO_MEDIA_LAZY?.load(video);
        scheduleIndexVideoSync();
        return;
      }

      visibleIndexVideos.delete(video);
      video.pause();
      scheduleIndexVideoSync();
    });
  }, {
    rootMargin: "240px 0px",
    threshold: 0.02
  })
  : null;

function observeIndexVideo(video) {
  if (!video) {
    return;
  }

  if (!indexVideoObserver) {
    visibleIndexVideos.set(video, 1);
    scheduleIndexVideoSync();
    return;
  }

  indexVideoObserver.observe(video);
  video.addEventListener("loadedmetadata", scheduleIndexVideoSync, { once: true });
  video.addEventListener("canplay", scheduleIndexVideoSync, { once: true });
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
        "project-media"
      );

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
      card.append(media, info);
      projectGrid.append(card);

      window.PORTFOLIO_INDEX_LOADER?.register(media);

      if (media.tagName === "VIDEO") {
        allIndexVideos.add(media);
        observeIndexVideo(media);
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
