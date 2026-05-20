const params = new URLSearchParams(window.location.search);
const slug = params.get("project") || window.PORTFOLIO_ADMIN_PREVIEW_SLUG;
const project = window.PORTFOLIO_PROJECTS?.find((item) => item.slug === slug);
const projectRoot = document.querySelector("[data-project-root]");
const nextProjectLink = document.querySelector("[data-next-project-link]");

function updateNextProjectLink(currentProject) {
  if (!nextProjectLink || !currentProject || !window.PORTFOLIO_PROJECTS?.length) {
    return;
  }

  const publicProjects = window.PORTFOLIO_PROJECTS.filter((item) => !item.hidden);

  if (publicProjects.length <= 1) {
    nextProjectLink.href = "index.html";
    nextProjectLink.textContent = "Projects";
    nextProjectLink.setAttribute("aria-label", "Back to projects");
    return;
  }

  const currentPublicIndex = publicProjects.findIndex((item) => item.slug === currentProject.slug);
  const nextProject = publicProjects[(currentPublicIndex + 1) % publicProjects.length] || publicProjects[0];

  nextProjectLink.href = `project.html?project=${encodeURIComponent(nextProject.slug)}`;
  nextProjectLink.textContent = "Next project →";
  nextProjectLink.setAttribute("aria-label", `Next project: ${nextProject.title || nextProject.slug}`);
}

function appendParagraphs(container, paragraphs) {
  paragraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    container.append(p);
  });
}

function normalizeCompositionPreset(preset = "smart-grid") {
  if (preset === "filmstrip") {
    return "carousel";
  }

  return [
    "smart-grid",
    "feature-grid",
    "equal-grid",
    "poster-grid",
    "rows",
    "carousel",
    "stack"
  ].includes(preset) ? preset : "smart-grid";
}

function getComposition(projectData = {}) {
  const mediaLayout = projectData.mediaLayout || {};

  if (mediaLayout.composition) {
    return normalizeCompositionPreset(mediaLayout.composition);
  }

  if (mediaLayout.gallery === "slideshow") {
    return "carousel";
  }

  if (mediaLayout.gallery === "stack" || projectData.layout === "compact") {
    return "stack";
  }

  if (mediaLayout.gallery === "justify" || mediaLayout.gallery === "two" || projectData.layout === "pairs") {
    return "rows";
  }

  if (
    projectData.layout === "main-full-row" ||
    (mediaLayout.main === "full" && (mediaLayout.gallery === "grid" || mediaLayout.gallery === "three"))
  ) {
    return "feature-grid";
  }

  return "smart-grid";
}

function createProjectMediaFigure(media, basePath) {
  const figure = document.createElement("figure");
  const mediaClass = media.isMain ? "project-final-media" : "project-extra-media";
  figure.className = `project-media-item ${mediaClass} ${getMediaRatioClass(media)}`;
  figure.append(createMediaElement(media, basePath));
  return figure;
}

function renderProjectMedia(projectData, gallery) {
  const basePath = `assets/projects/${projectData.slug}`;
  const grid = document.createElement("div");
  const composition = getComposition(projectData);
  grid.className = [
    "project-media-grid",
    `project-media-grid-${projectData.layout || "auto"}`,
    `project-composition-${composition}`
  ].join(" ");

  const allMedia = [
    { ...projectData.media.main, isMain: true },
    ...(projectData.media.secondary || [])
  ].filter((media) => media?.file);

  if (composition === "carousel" && allMedia.length > 1) {
    const carousel = document.createElement("div");
    carousel.className = "project-media-carousel";

    const track = document.createElement("div");
    track.className = "project-media-carousel-track";
    track.tabIndex = 0;
    track.setAttribute("aria-label", "Project media carousel");
    allMedia.forEach((media, index) => {
      const figure = createProjectMediaFigure(media, basePath);
      figure.dataset.carouselIndex = String(index);
      figure.tabIndex = 0;

      if (index === 0) {
        figure.classList.add("is-active");
        figure.setAttribute("aria-current", "true");
      }

      track.append(figure);
    });

    carousel.append(track);
    grid.append(carousel);
  } else {
    const mediaFigures = allMedia.map((media) => createProjectMediaFigure(media, basePath));
    mediaFigures.forEach((figure) => grid.append(figure));
  }

  gallery.append(grid);
}

if (!projectRoot || !project) {
  if (projectRoot) {
    projectRoot.innerHTML = "<p class=\"project-summary\">Project not found.</p>";
  }
} else {
  updateNextProjectLink(project);
  document.title = `${project.title} — Marcos Bodi`;

  const description = document.querySelector("meta[name=\"description\"]");
  if (description) {
    description.content = project.description || project.summary;
  }

  projectRoot.innerHTML = "";

  const intro = document.createElement("section");
  intro.className = "project-intro";

  const layout = document.createElement("div");
  layout.className = "project-intro-layout";

  const mainCopy = document.createElement("div");
  mainCopy.className = "project-copy-main";

  const header = document.createElement("div");
  header.className = "project-intro-header";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = project.category;

  const title = document.createElement("h1");
  title.textContent = project.title;

  const summary = document.createElement("p");
  summary.className = "project-summary";
  summary.textContent = project.summary;

  header.append(eyebrow, title, summary);

  const meta = document.createElement("section");
  meta.className = "project-copy-block project-meta";
  meta.setAttribute("aria-label", "Project info");

  const metaTitle = document.createElement("h2");
  metaTitle.textContent = "Project info";

  const details = document.createElement("dl");
  details.className = "details-list";

  Object.entries(project.details || {}).forEach(([term, value]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    row.append(dt, dd);
    details.append(row);
  });

  meta.append(metaTitle, details);
  mainCopy.append(header, meta);

  const copyStack = document.createElement("div");
  copyStack.className = "project-copy-stack";

  const concept = document.createElement("section");
  concept.className = "project-copy-block project-concept";
  const conceptTitle = document.createElement("h2");
  conceptTitle.textContent = "Concept";
  concept.append(conceptTitle);
  appendParagraphs(concept, project.concept || []);

  const credits = document.createElement("section");
  credits.className = "project-copy-block project-team";
  const creditsTitle = document.createElement("h2");
  creditsTitle.textContent = project.creditsTitle || "Credits";
  credits.append(creditsTitle);
  appendParagraphs(credits, project.credits || []);

  copyStack.append(concept);

  if (project.teamEnabled !== false && project.credits?.length) {
    copyStack.append(credits);
  }

  layout.append(mainCopy, copyStack);
  intro.append(layout);

  const gallery = document.createElement("section");
  gallery.className = "project-gallery";
  gallery.setAttribute("aria-label", "Project media");
  renderProjectMedia(project, gallery);

  projectRoot.append(intro, gallery);
}
