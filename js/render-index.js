const projectGrid = document.querySelector("[data-project-grid]");
const supportsIndexHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const indexEdgeAutoScroll = {
  frame: null,
  speed: 0
};
const visibleIndexVideos = new Set();

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

function resumeVisibleIndexVideos() {
  visibleIndexVideos.forEach(requestIndexVideoPlayback);
}

function primeInitialIndexVideos() {
  const videos = Array.from(projectGrid?.querySelectorAll("video.project-media") || []);
  const preloadMargin = 260;

  videos.forEach((video) => {
    const rect = video.getBoundingClientRect();
    const isNearViewport = rect.bottom >= -preloadMargin && rect.top <= window.innerHeight + preloadMargin;

    if (isNearViewport) {
      visibleIndexVideos.add(video);
      requestIndexVideoPlayback(video);
    }
  });
}

const indexVideoObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;

      if (entry.isIntersecting) {
        visibleIndexVideos.add(video);
        requestIndexVideoPlayback(video);
        return;
      }

      visibleIndexVideos.delete(video);
      video.pause();
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
    visibleIndexVideos.add(video);
    requestIndexVideoPlayback(video);
    return;
  }

  indexVideoObserver.observe(video);
  video.addEventListener("loadedmetadata", () => requestIndexVideoPlayback(video), { once: true });
  video.addEventListener("canplay", () => requestIndexVideoPlayback(video), { once: true });
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
      window.PORTFOLIO_INDEX_LOADER?.register(media);

      const resizeCard = () => resizeIndexCard(card);

      if (media.tagName === "VIDEO") {
        observeIndexVideo(media);
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
    });

  resizeIndexGrid();
  window.requestAnimationFrame(primeInitialIndexVideos);
  window.setTimeout(primeInitialIndexVideos, 350);
  document.fonts?.ready.then(resizeIndexGrid);
  window.addEventListener("resize", resizeIndexGrid);
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
