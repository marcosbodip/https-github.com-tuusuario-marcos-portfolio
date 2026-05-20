const projects = structuredClone(window.PORTFOLIO_PROJECTS || []);
const projectSelect = document.querySelector("#projectSelect");
const form = document.querySelector("#projectForm");
const outputCode = document.querySelector("#outputCode");
const previewTitle = document.querySelector("#previewTitle");
const previewLink = document.querySelector("#previewLink");
const previewProjectButton = document.querySelector("#previewProjectButton");
const previewIndexButton = document.querySelector("#previewIndexButton");
const projectCount = document.querySelector("#projectCount");
const statusMessage = document.querySelector("#statusMessage");
const previewViewport = document.querySelector("#previewViewport");
const projectPreviewFrame = document.querySelector("#projectPreviewFrame");
const mediaImport = document.querySelector("#mediaImport");
const mediaBoard = document.querySelector("#mediaBoard");
const indexOrderFieldset = document.querySelector("#indexOrderFieldset");
const indexOrderBoard = document.querySelector("#indexOrderBoard");
const indexOrderToggle = document.querySelector("#indexOrderToggle");
const teamField = document.querySelector("#teamField");
const newProjectButton = document.querySelector("#newProjectButton");
const duplicateProjectButton = document.querySelector("#duplicateProjectButton");
const toggleVisibilityButton = document.querySelector("#toggleVisibilityButton");
const deleteProjectButton = document.querySelector("#deleteProjectButton");
const saveButton = document.querySelector("#saveButton");
const copyButton = document.querySelector("#copyButton");
const visibilityBadge = document.querySelector("#visibilityBadge");

let currentIndex = 0;
let statusTimeout;
let previewTimeout;
let secondaryMedia = [];
let mediaItems = [];
let hiddenMediaItems = [];
let folderMedia = [];
let folderExists = false;
let folderMediaSlug = "";
let importedMediaUrls = new Map();
let importedMediaFiles = new Map();
let projectAssetSlugs = projects.map((project) => project.slug || "");
let draggedMediaIndex = null;
let draggedProjectIndex = null;
let isIndexOrderCollapsed = false;
let previewMode = "project";
let originalSlug = "";
const previewCanvasWidth = 1920;

const fileSorter = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function linesToArray(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function secondaryToText(items = []) {
  return items
    .map((item) => {
      return [item.file, item.ratio, item.alt]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function syncSecondaryField() {
  form.secondary.value = secondaryToText(secondaryMedia);
}

function uniqueMediaItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item?.file || seen.has(item.file)) {
      return false;
    }

    seen.add(item.file);
    return true;
  });
}

function activeMediaItems(items) {
  return items.filter((item) => item?.file);
}

function cloneMediaItem(item) {
  const clone = cleanProject(item);
  delete clone.alt;
  return clone;
}

function makeMediaItem(file, fallback = "media") {
  return {
    file,
    type: getMediaType(file),
    alt: makeAltText(form.title.value.trim(), file, fallback)
  };
}

function getRoleLabel(index) {
  if (index === 0) {
    return "Cover";
  }

  if (index === 1) {
    return "Main";
  }

  return `Gallery ${index - 1}`;
}

function syncMediaFromItems() {
  mediaItems = activeMediaItems(mediaItems);
  const activeFiles = new Set(mediaItems.map((item) => item.file).filter(Boolean));
  hiddenMediaItems = uniqueMediaItems(hiddenMediaItems)
    .filter((item) => !activeFiles.has(item.file));
  const cover = mediaItems[0] || {};
  const main = mediaItems[1] || {};

  form.coverFile.value = cover.file || "";
  form.mainFile.value = main.file || "";
  form.mainRatio.value = main.ratio || "";
  secondaryMedia = mediaItems.slice(2).map((item, index) => {
    return {
      file: item.file,
      type: item.type || getMediaType(item.file),
      ratio: item.ratio,
      alt: item.alt || makeAltText(form.title.value.trim(), item.file, `secondary ${index + 1}`)
    };
  });

  normalizeSecondaryRatiosForLayout();
  applyAutoComposition();
  syncSecondaryField();
}

function getMediaType(file) {
  return /\.(mp4|webm|mov)$/i.test(file) ? "video" : "image";
}

function getFileStem(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cleanProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function ratioFromDimensions(width, height) {
  if (!width || !height) {
    return "";
  }

  const ratio = width / height;

  if (ratio >= 2.2) {
    return "ultrawide";
  }

  if (ratio >= 1.35) {
    return "wide";
  }

  if (ratio >= 1.12) {
    return "landscape";
  }

  if (ratio <= 0.82) {
    return "portrait";
  }

  return "square";
}

function inferGalleryLayout(main, secondary = []) {
  const allGalleryMedia = [main, ...secondary].filter((item) => item?.file);
  const secondaryRatios = secondary.map((item) => item.ratio).filter(Boolean);
  const hasDelicateMedia = secondaryRatios.some((ratio) => {
    return ratio === "portrait" || ratio === "square";
  });
  const horizontalCount = allGalleryMedia.filter((item) => {
    return item.ratio === "wide" || item.ratio === "ultrawide" || item.ratio === "landscape";
  }).length;

  if (hasDelicateMedia && main?.ratio === "wide") {
    return "contain";
  }

  if (allGalleryMedia.length >= 5 && horizontalCount >= allGalleryMedia.length - 1) {
    return "pairs";
  }

  return "auto";
}

function applyAutoComposition() {
  syncLegacyLayoutField();
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

function getCompositionFromLegacy(project = {}) {
  const mediaLayout = project.mediaLayout || {};

  if (mediaLayout.composition) {
    return normalizeCompositionPreset(mediaLayout.composition);
  }

  if (mediaLayout.gallery === "slideshow") {
    return "carousel";
  }

  if (mediaLayout.gallery === "stack" || project.layout === "compact") {
    return "stack";
  }

  if (mediaLayout.gallery === "justify" || mediaLayout.gallery === "two" || project.layout === "pairs") {
    return "rows";
  }

  if (
    project.layout === "main-full-row" ||
    (mediaLayout.main === "full" && (mediaLayout.gallery === "grid" || mediaLayout.gallery === "three"))
  ) {
    return "feature-grid";
  }

  return "smart-grid";
}

function getProjectMediaLayout(project) {
  return {
    composition: getCompositionFromLegacy(project)
  };
}

function getLayoutFromControls() {
  return {
    composition: normalizeCompositionPreset(form.compositionPreset.value || "smart-grid")
  };
}

function getLegacyLayoutFromControls(layout = getLayoutFromControls()) {
  const composition = normalizeCompositionPreset(layout.composition);

  if (composition === "feature-grid") {
    return "main-full-row";
  }

  if (composition === "rows") {
    return "pairs";
  }

  if (composition === "stack") {
    return "compact";
  }

  return "auto";
}

function syncLegacyLayoutField() {
  form.layout.value = getLegacyLayoutFromControls();
}

function normalizeSecondaryRatiosForLayout() {
  const main = {
    file: form.mainFile.value.trim(),
    type: getMediaType(form.mainFile.value.trim()),
    ratio: form.mainRatio.value
  };
  const layout = inferGalleryLayout(main, secondaryMedia);

  if (layout === "pairs" && secondaryMedia.length >= 4) {
    const lastItem = secondaryMedia[secondaryMedia.length - 1];

    if (lastItem.ratio === "wide" || lastItem.ratio === "ultrawide" || lastItem.ratio === "landscape") {
      lastItem.ratio = "full-row";
    }
  }
}

function getFileDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (dimensions) => {
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };

    if (file.type.startsWith("video/") || getMediaType(file.name) === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => done({
        width: video.videoWidth,
        height: video.videoHeight
      });
      video.onerror = () => done({ width: 0, height: 0 });
      video.src = url;
      return;
    }

    const image = new Image();
    image.onload = () => done({
      width: image.naturalWidth,
      height: image.naturalHeight
    });
    image.onerror = () => done({ width: 0, height: 0 });
    image.src = url;
  });
}

function makeAltText(title, fileName, fallback) {
  const cleanName = getFileStem(fileName)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${title || "Project"} ${cleanName || fallback}`.trim();
}

function getPreviewUrl(file) {
  return importedMediaUrls.get(file) || "";
}

async function readApiJson(response, fallbackMessage) {
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${fallbackMessage}: invalid server response`);
    }
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || fallbackMessage);
  }

  return data;
}

function withPreviewUrls(project) {
  const previewProject = cleanProject(project);

  if (previewProject.media?.cover?.file) {
    previewProject.media.cover.previewUrl = getPreviewUrl(previewProject.media.cover.file);
  }

  if (previewProject.media?.main?.file) {
    previewProject.media.main.previewUrl = getPreviewUrl(previewProject.media.main.file);
  }

  previewProject.media.secondary = (previewProject.media.secondary || []).map((item) => {
    return {
      ...item,
      previewUrl: getPreviewUrl(item.file)
    };
  });

  return previewProject;
}

function addImportedMediaUrls(files) {
  files.forEach((file) => {
    if (importedMediaUrls.has(file.name)) {
      URL.revokeObjectURL(importedMediaUrls.get(file.name));
    }

    importedMediaUrls.set(file.name, URL.createObjectURL(file));
    importedMediaFiles.set(file.name, file);
  });
}

function clearImportedMediaUrls() {
  importedMediaUrls.forEach((url) => URL.revokeObjectURL(url));
  importedMediaUrls = new Map();
  importedMediaFiles = new Map();
}

function createMediaThumb(item) {
  const previewUrl = getPreviewUrl(item.file) || `assets/projects/${form.slug.value.trim()}/${item.file}`;
  const mediaType = item.type || getMediaType(item.file);

  if (mediaType === "video") {
    const video = document.createElement("video");
    video.src = previewUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.autoplay = true;
    return video;
  }

  const image = document.createElement("img");
  image.src = previewUrl;
  image.alt = item.alt || item.file;
  return image;
}

function createProjectOrderThumb(project) {
  const cover = project.media?.cover || {};
  const file = cover.file || "";

  if (!file) {
    const placeholder = document.createElement("span");
    placeholder.textContent = "No cover";
    return placeholder;
  }

  const isCurrentProject = project.slug === form.slug.value.trim();
  const previewUrl = isCurrentProject ? getPreviewUrl(file) : "";
  const mediaPath = previewUrl || `assets/projects/${project.slug}/${file}`;

  if ((cover.type || getMediaType(file)) === "video") {
    const video = document.createElement("video");
    video.src = mediaPath;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.autoplay = true;
    return video;
  }

  const image = document.createElement("img");
  image.src = mediaPath;
  image.alt = project.title || project.slug || "Project cover";
  return image;
}

function moveArrayItem(items, fromIndex, toIndex) {
  const safeToIndex = Math.max(0, Math.min(items.length - 1, toIndex));

  if (fromIndex === safeToIndex || fromIndex < 0 || fromIndex >= items.length) {
    return;
  }

  const [item] = items.splice(fromIndex, 1);
  items.splice(safeToIndex, 0, item);
}

function selectProject(index) {
  if (index === currentIndex || index < 0 || index >= projects.length) {
    return;
  }

  updateOutput();
  currentIndex = index;
  clearImportedMediaUrls();
  fillForm(projects[currentIndex]);
  refreshFolderMedia();
}

function moveProject(fromIndex, toIndex) {
  const safeToIndex = Math.max(0, Math.min(projects.length - 1, toIndex));

  if (fromIndex === safeToIndex || fromIndex < 0 || fromIndex >= projects.length) {
    return;
  }

  projects[currentIndex] = readForm();
  const activeProject = projects[currentIndex];

  moveArrayItem(projects, fromIndex, safeToIndex);
  moveArrayItem(projectAssetSlugs, fromIndex, safeToIndex);

  currentIndex = projects.indexOf(activeProject);
  previewMode = "index";
  updateOutput();
  setStatus("Index order updated. Save site to publish it.");
}

function updateIndexOrderCollapsedState() {
  if (!indexOrderFieldset || !indexOrderBoard || !indexOrderToggle) {
    return;
  }

  indexOrderFieldset.classList.toggle("is-collapsed", isIndexOrderCollapsed);
  indexOrderBoard.hidden = isIndexOrderCollapsed;
  indexOrderToggle.textContent = isIndexOrderCollapsed ? "Show" : "Hide";
  indexOrderToggle.setAttribute("aria-expanded", String(!isIndexOrderCollapsed));
}

function renderIndexOrderBoard() {
  if (!indexOrderBoard) {
    return;
  }

  indexOrderBoard.innerHTML = "";

  projects.forEach((project, index) => {
    const card = document.createElement("article");
    card.className = [
      "admin-index-order-card",
      index === currentIndex ? "is-current" : "",
      project.hidden ? "is-hidden-project" : ""
    ].filter(Boolean).join(" ");
    card.draggable = true;

    const thumb = document.createElement("div");
    thumb.className = "admin-index-order-thumb";
    thumb.append(createProjectOrderThumb(project));

    const info = document.createElement("div");
    const title = document.createElement("p");
    title.className = "admin-index-order-title";
    title.textContent = project.title || project.slug || "Untitled project";

    const meta = document.createElement("p");
    meta.className = "admin-index-order-meta";
    meta.textContent = `${index + 1}. ${project.hidden ? "Hidden" : "Public"} / ${project.category || "No category"}`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "admin-index-order-actions";

    const topButton = document.createElement("button");
    topButton.type = "button";
    topButton.textContent = "Top";
    topButton.disabled = index === 0;

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.textContent = "Up";
    upButton.disabled = index === 0;

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.textContent = "Down";
    downButton.disabled = index === projects.length - 1;

    topButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveProject(index, 0);
    });

    upButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveProject(index, index - 1);
    });

    downButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveProject(index, index + 1);
    });

    actions.append(topButton, upButton, downButton);

    card.addEventListener("click", () => {
      selectProject(index);
    });

    card.addEventListener("dragstart", () => {
      draggedProjectIndex = index;
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      draggedProjectIndex = null;
      card.classList.remove("is-dragging");
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("is-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target");
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("is-drop-target");

      if (draggedProjectIndex === null || draggedProjectIndex === index) {
        return;
      }

      moveProject(draggedProjectIndex, index);
    });

    card.append(thumb, info, actions);
    indexOrderBoard.append(card);
  });
}

function renderMediaBoard() {
  mediaBoard.innerHTML = "";

  const currentSlug = form.slug.value.trim();
  const currentFolderMedia = folderMediaSlug === currentSlug ? folderMedia : [];
  const activeFiles = new Set(mediaItems.map((item) => item.file).filter(Boolean));
  const hiddenFiles = new Set(hiddenMediaItems.map((item) => item.file).filter(Boolean));
  const folderOnlyItems = currentFolderMedia
    .filter((file) => !activeFiles.has(file) && !hiddenFiles.has(file))
    .map((file) => ({
      ...makeMediaItem(file, "available media"),
      pendingCleanup: true
    }));
  const importedOnlyItems = Array.from(importedMediaFiles.keys())
    .filter((file) => !activeFiles.has(file) && !hiddenFiles.has(file))
    .map((file) => ({
      ...makeMediaItem(file, "available media"),
      pendingUpload: true
    }));
  const libraryItems = uniqueMediaItems([
    ...hiddenMediaItems,
    ...folderOnlyItems,
    ...importedOnlyItems
  ]);

  if (!mediaItems.length && !libraryItems.length) {
    const empty = document.createElement("p");
    empty.textContent = "Import media to build the project layout.";
    mediaBoard.append(empty);
    return;
  }

  mediaItems.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "admin-media-card";
    card.draggable = true;

    const removeButton = document.createElement("button");
    removeButton.className = "admin-media-remove";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Hide ${item.file} from preview`);
    removeButton.title = "Hide from preview";
    removeButton.textContent = "X";
    removeButton.disabled = index < 2;

    const duplicateButton = document.createElement("button");
    duplicateButton.className = "admin-media-duplicate";
    duplicateButton.type = "button";
    duplicateButton.setAttribute("aria-label", `Copy ${item.file} into another layout slot`);
    duplicateButton.title = "Copy into another slot";
    duplicateButton.textContent = "Copy";

    const thumb = document.createElement("div");
    thumb.className = "admin-media-thumb";
    thumb.append(createMediaThumb(item));

    const role = document.createElement("p");
    role.className = "admin-media-role";
    role.textContent = getRoleLabel(index);

    const name = document.createElement("p");
    name.className = "admin-media-name";
    name.textContent = item.file;

    card.addEventListener("dragstart", () => {
      draggedMediaIndex = index;
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      draggedMediaIndex = null;
      card.classList.remove("is-dragging");
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("is-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target");
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("is-drop-target");

      if (draggedMediaIndex === null || draggedMediaIndex === index) {
        return;
      }

      const [moved] = mediaItems.splice(draggedMediaIndex, 1);
      mediaItems.splice(index, 0, moved);
      syncMediaFromItems();
      renderMediaBoard();
      updateOutput();
    });

    duplicateButton.addEventListener("click", (event) => {
      event.stopPropagation();
      mediaItems.push(cloneMediaItem(item));
      syncMediaFromItems();
      renderMediaBoard();
      updateOutput();
      setStatus(`${item.file} copied into another slot`);
    });

    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();

      if (index < 2) {
        setStatus(`${getRoleLabel(index)} media is required. Reorder another file into this slot first.`, "warning", true);
        return;
      }

      const removed = mediaItems.splice(index, 1)[0];

      if (removed?.file && !mediaItems.some((mediaItem) => mediaItem.file === removed.file)) {
        hiddenMediaItems = uniqueMediaItems([...hiddenMediaItems, removed]);
      }

      syncMediaFromItems();
      renderMediaBoard();
      updateOutput();
      setStatus(`${removed?.file || "Media"} hidden from preview`);
    });

    card.append(removeButton, duplicateButton, thumb, role, name);
    mediaBoard.append(card);
  });

  libraryItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = "admin-media-card is-hidden-media";

    const showButton = document.createElement("button");
    showButton.className = "admin-media-show";
    showButton.type = "button";
    showButton.setAttribute("aria-label", `Show ${item.file} in preview`);
    showButton.title = "Show in preview";
    showButton.textContent = "+";

    const thumb = document.createElement("div");
    thumb.className = "admin-media-thumb";
    thumb.append(createMediaThumb(item));

    const role = document.createElement("p");
    role.className = "admin-media-role";
    role.textContent = item.pendingCleanup ? "Unused" : "Hidden";

    const name = document.createElement("p");
    name.className = "admin-media-name";
    name.textContent = item.file;

    showButton.addEventListener("click", () => {
      hiddenMediaItems = hiddenMediaItems.filter((hiddenItem) => hiddenItem.file !== item.file);
      mediaItems = [...mediaItems, item];
      syncMediaFromItems();
      renderMediaBoard();
      updateOutput();
      setStatus(`${item.file} added to preview`);
    });

    card.append(showButton, thumb, role, name);
    mediaBoard.append(card);
  });
}

function getBlockingIssues(project = readForm()) {
  return validateProjects(project);
}

async function refreshFolderMedia() {
  const slug = form.slug.value.trim();

  if (!slug) {
    folderExists = false;
    folderMedia = [];
    folderMediaSlug = "";
    updateCleanupStatus();
    renderMediaBoard();
    return;
  }

  try {
    const response = await fetch(`/__assets/${encodeURIComponent(slug)}`);
    const data = await readApiJson(response, "Could not list project assets");

    if (form.slug.value.trim() !== slug) {
      return;
    }

    folderExists = data.exists;
    folderMedia = data.files || [];
    folderMediaSlug = slug;
  } catch {
    folderExists = false;
    folderMedia = [];
    folderMediaSlug = slug;
  }

  updateCleanupStatus();
  renderMediaBoard();
}

async function ensureProjectFolderForSlug(slug) {
  if (!slug) {
    return false;
  }

  const response = await fetch(`/__ensure-project/${encodeURIComponent(slug)}`, {
    method: "POST"
  });
  await readApiJson(response, "Could not create project folder");

  folderExists = true;
  folderMediaSlug = slug;
  return true;
}

async function ensureProjectFolder() {
  return ensureProjectFolderForSlug(form.slug.value.trim());
}

async function uploadMediaFiles(files) {
  const slug = form.slug.value.trim();

  if (!slug || !files.length) {
    return [];
  }

  const body = new FormData();
  files.forEach((file) => body.append("media", file, file.name));

  const response = await fetch(`/__upload/${encodeURIComponent(slug)}`, {
    method: "POST",
    body
  });
  const data = await readApiJson(response, "Media upload failed");

  folderExists = true;
  folderMedia = data.files || [];
  folderMediaSlug = slug;
  projectAssetSlugs[currentIndex] = slug;
  return folderMedia;
}

async function syncImportedMediaToDisk(files) {
  const selectedFiles = Array.from(files).filter(Boolean);

  if (!selectedFiles.length || !form.slug.value.trim()) {
    return;
  }

  await ensureProjectFolderForSlug(form.slug.value.trim());
  await uploadMediaFiles(selectedFiles);
  renderMediaBoard();
  updateCleanupStatus();
}

async function deleteProjectAssets(slug) {
  if (!slug) {
    return false;
  }

  const response = await fetch(`/__project-assets/${encodeURIComponent(slug)}`, {
    method: "DELETE"
  });
  await readApiJson(response, "Project assets delete failed");

  return true;
}

async function importMediaFiles(files) {
  const selectedFiles = Array.from(files).sort((a, b) => {
    return fileSorter.compare(a.name, b.name);
  });

  if (!selectedFiles.length) {
    return;
  }

  addImportedMediaUrls(selectedFiles);

  const analyzed = await Promise.all(selectedFiles.map(async (file) => {
    const dimensions = await getFileDimensions(file);
    return {
      file: file.name,
      type: getMediaType(file.name),
      ratio: ratioFromDimensions(dimensions.width, dimensions.height)
    };
  }));

  const title = form.title.value.trim();
  const newItems = analyzed.map((item) => {
    return {
      file: item.file,
      type: item.type,
      ratio: item.ratio,
      alt: makeAltText(title, item.file, "media")
    };
  });

  mediaItems = [...mediaItems, ...newItems];
  syncMediaFromItems();
  renderMediaBoard();
  updateOutput();

  await syncImportedMediaToDisk(selectedFiles);
  setStatus(`Imported ${selectedFiles.length} media file${selectedFiles.length === 1 ? "" : "s"} to assets`);
}

function setStatus(message, type = "ok", sticky = false) {
  statusMessage.textContent = message;
  statusMessage.dataset.type = message ? type : "";
  clearTimeout(statusTimeout);

  if (!sticky && message) {
    statusTimeout = setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.dataset.type = "";
    }, 2800);
  }
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function populateSelect() {
  projectSelect.innerHTML = "";

  projects.forEach((project, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${project.hidden ? "[Hidden]" : "[Public]"} ${project.title || project.slug}`;
    projectSelect.append(option);
  });

  projectSelect.value = currentIndex;
}

function updateVisibilityButton() {
  const project = projects[currentIndex];
  const isHidden = Boolean(project?.hidden);

  toggleVisibilityButton.textContent = isHidden ? "Show" : "Hide";
  visibilityBadge.textContent = isHidden ? "Hidden" : "Public";
  visibilityBadge.dataset.state = isHidden ? "hidden" : "public";
}

function updateTeamField() {
  teamField.classList.toggle("is-hidden", !form.teamEnabled.checked);
}

function fillForm(project) {
  originalSlug = project.slug || "";
  form.hidden.value = project.hidden ? "true" : "";
  form.slug.value = project.slug || "";
  form.title.value = project.title || "";
  form.category.value = project.category || "";
  form.summary.value = project.summary || "";
  const mediaLayout = getProjectMediaLayout(project);
  form.compositionPreset.value = mediaLayout.composition;
  syncLegacyLayoutField();
  form.detailRole.value = project.details?.Role || "";
  form.detailType.value = project.details?.Type || "";
  form.detailTools.value = project.details?.Tools || "";
  form.concept.value = (project.concept || []).join("\n");
  form.teamEnabled.checked = project.teamEnabled !== false && Boolean(project.credits?.length);
  form.credits.value = (project.credits || []).join("\n");
  updateTeamField();
  form.coverFile.value = project.media?.cover?.file || "";
  form.mainFile.value = project.media?.main?.file || "";
  form.mainRatio.value = project.media?.main?.ratio || "";
  mediaItems = activeMediaItems([
    project.media?.cover,
    project.media?.main,
    ...(project.media?.secondary || [])
  ].filter(Boolean).map((item) => cleanProject(item)));
  hiddenMediaItems = uniqueMediaItems((project.media?.hidden || [])
    .filter(Boolean)
    .map((item) => cleanProject(item)));
  syncMediaFromItems();
  renderMediaBoard();
  updateVisibilityButton();
  updateOutput();
}

function readForm() {
  const slug = form.slug.value.trim();
  const title = form.title.value.trim();
  const category = form.category.value.trim();
  applyAutoComposition();
  const mediaLayout = getLayoutFromControls();

  return {
    slug,
    title,
    ...(form.hidden.value === "true" ? { hidden: true } : {}),
    category,
    summary: form.summary.value.trim(),
    description: form.summary.value.trim() || `${title} by Marcos Bodi.`,
    cardCategory: category,
    cardType: slugify(category),
    layout: form.layout.value,
    mediaLayout,
    details: {
      Role: form.detailRole.value.trim(),
      Type: form.detailType.value.trim(),
      Tools: form.detailTools.value.trim()
    },
    concept: linesToArray(form.concept.value),
    teamEnabled: form.teamEnabled.checked,
    ...(form.teamEnabled.checked
      ? {
        creditsTitle: "Team",
        credits: linesToArray(form.credits.value)
      }
      : {
        credits: []
      }),
    media: {
      cover: {
        file: form.coverFile.value.trim(),
        type: getMediaType(form.coverFile.value.trim()),
        alt: title
      },
      main: {
        file: form.mainFile.value.trim(),
        type: getMediaType(form.mainFile.value.trim()),
        ...(form.mainRatio.value ? { ratio: form.mainRatio.value } : {}),
        alt: `${title} main media`
      },
      secondary: secondaryMedia
        .filter((item) => item.file)
        .map((item, index) => {
          const media = {
            file: item.file.trim(),
            type: getMediaType(item.file),
            alt: item.alt?.trim() || `${title} secondary ${String(index + 1).padStart(2, "0")}`
          };

          if (item.ratio) {
            media.ratio = item.ratio;
          }

          return media;
        }),
      ...(hiddenMediaItems.length
        ? {
          hidden: hiddenMediaItems
            .filter((item) => item.file)
            .map((item) => {
              const media = {
                file: item.file.trim(),
                type: getMediaType(item.file),
                alt: item.alt?.trim() || `${title} hidden media`
              };

              if (item.ratio) {
                media.ratio = item.ratio;
              }

              return media;
            })
        }
        : {})
    }
  };
}

function validateProjects(project) {
  const issues = [];
  const duplicateSlug = projects.some((item, index) => {
    return index !== currentIndex && item.slug === project.slug;
  });

  if (!project.slug) {
    issues.push("Missing slug");
  }

  if (duplicateSlug) {
    issues.push("Duplicate slug");
  }

  if (!project.title) {
    issues.push("Missing title");
  }

  if (!project.media.cover.file || !project.media.main.file) {
    issues.push("Cover or main media missing");
  }

  return issues;
}

function getCurrentUsedMediaFiles() {
  return new Set(mediaItems
    .map((item) => item?.file)
    .filter(Boolean));
}

function getCurrentKeptMediaFiles() {
  return new Set([...mediaItems, ...hiddenMediaItems]
    .map((item) => item?.file)
    .filter(Boolean));
}

function getPendingCleanupCount() {
  if (!folderExists || folderMediaSlug !== form.slug.value.trim()) {
    return 0;
  }

  const usedFiles = getCurrentKeptMediaFiles();

  return folderMedia.filter((file) => !usedFiles.has(file)).length;
}

function getPreviewProjects(project) {
  const previewProject = withPreviewUrls(project);
  return projects.map((item, index) => {
    return index === currentIndex ? previewProject : item;
  });
}

function buildProjectPreviewDocument(project) {
  const baseHref = new URL(".", window.location.href).href;
  const previewProject = withPreviewUrls(project);
  const previewProjects = getPreviewProjects(project);
  const projectJson = JSON.stringify(previewProjects);
  const slugJson = JSON.stringify(previewProject.slug);
  const description = escapeAttribute(previewProject.description || previewProject.summary || "Project by Marcos Bodi.");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="${escapeAttribute(baseHref)}" />
  <title>${escapeAttribute(previewProject.title || "Project")} - Marcos Bodi</title>
  <meta name="description" content="${description}" />
  <link rel="stylesheet" href="css/style.css" />
</head>
<body class="admin-preview-body">
  <header class="site-header">
    <nav class="main-nav main-nav-primary" aria-label="Primary navigation">
      <a href="about.html">About</a>
    </nav>
    <a class="logo" href="index.html" aria-label="Marcos Bodi home">MB</a>
    <nav class="main-nav main-nav-social" aria-label="Social navigation">
      <a href="https://www.instagram.com/bodimarcos/" target="_blank" rel="noreferrer">Instagram</a>
    </nav>
  </header>
  <main class="project-page" data-project-root></main>
  <footer class="site-footer">
    <a href="index.html" data-next-project-link>Next project →</a>
    <p>Marcos Bodi</p>
  </footer>
  <script>window.PORTFOLIO_PROJECTS = ${projectJson}; window.PORTFOLIO_ADMIN_PREVIEW_SLUG = ${slugJson};<\/script>
  <script src="js/media-render.js"><\/script>
  <script src="js/render-project.js"><\/script>
  <script src="js/title-brush.js"><\/script>
  <script src="js/project-media.js"><\/script>
  <script src="js/project-magnetic-dots.js"><\/script>
  <script src="js/copy-email.js"><\/script>
  <script src="js/site-cursor.js"><\/script>
</body>
</html>`;
}

function buildIndexPreviewDocument(project) {
  const baseHref = new URL(".", window.location.href).href;
  const previewProjects = getPreviewProjects(project);
  const projectJson = JSON.stringify(previewProjects);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="${escapeAttribute(baseHref)}" />
  <title>Index preview - Marcos Bodi</title>
  <meta name="description" content="Portfolio index preview." />
  <link rel="stylesheet" href="css/style.css" />
</head>
<body class="admin-preview-body">
  <header class="site-header">
    <nav class="main-nav main-nav-primary" aria-label="Primary navigation">
      <a href="about.html">About</a>
    </nav>
    <a class="logo" href="index.html" aria-label="Marcos Bodi home">MB</a>
    <nav class="main-nav main-nav-social" aria-label="Social navigation">
      <a href="https://www.instagram.com/bodimarcos/" target="_blank" rel="noreferrer">Instagram</a>
    </nav>
  </header>
  <main>
    <section class="project-grid" aria-label="Selected projects" data-project-grid></section>
  </main>
  <footer class="site-footer">
    <p>Marcos Bodi</p>
    <a href="#copy-email" data-copy-email="holabodimarcos@gmail.com">holabodimarcos@gmail.com</a>
  </footer>
  <script>window.PORTFOLIO_PROJECTS = ${projectJson};<\/script>
  <script src="js/media-render.js"><\/script>
  <script src="js/render-index.js"><\/script>
  <script src="js/index-magnetic-dots.js"><\/script>
  <script src="js/title-brush.js"><\/script>
  <script src="js/copy-email.js"><\/script>
  <script src="js/site-cursor.js"><\/script>
</body>
</html>`;
}

function updatePreviewFrame(project) {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    projectPreviewFrame.srcdoc = previewMode === "index"
      ? buildIndexPreviewDocument(project)
      : buildProjectPreviewDocument(project);
    resizePreviewFrame();
  }, 140);
}

projectPreviewFrame.addEventListener("load", resizePreviewFrame);

function resizePreviewFrame() {
  const viewportWidth = previewViewport.clientWidth;
  const viewportHeight = previewViewport.clientHeight;

  if (!viewportWidth || !viewportHeight) {
    return;
  }

  const scale = Math.min(1, viewportWidth / previewCanvasWidth);
  projectPreviewFrame.style.width = `${previewCanvasWidth}px`;
  projectPreviewFrame.style.height = `${viewportHeight / scale}px`;
  projectPreviewFrame.style.transform = `scale(${scale})`;
  projectPreviewFrame.style.marginBottom = `${(scale - 1) * (viewportHeight / scale)}px`;
}

function updatePreviewHeader(project) {
  const publicCount = projects.filter((item) => !item.hidden).length;
  const hiddenCount = projects.length - publicCount;
  projectCount.textContent = `${publicCount} public / ${hiddenCount} hidden`;

  previewProjectButton?.classList.toggle("is-active", previewMode === "project");
  previewProjectButton?.setAttribute("aria-pressed", String(previewMode === "project"));
  previewIndexButton?.classList.toggle("is-active", previewMode === "index");
  previewIndexButton?.setAttribute("aria-pressed", String(previewMode === "index"));

  if (previewMode === "index") {
    previewTitle.textContent = "Index";
    previewLink.href = "index.html";
    previewLink.textContent = "Open index";
    return;
  }

  previewTitle.textContent = project.title || "Project";
  previewLink.href = `project.html?project=${encodeURIComponent(project.slug)}`;
  previewLink.textContent = "Open page";
}

function setPreviewMode(mode) {
  previewMode = mode === "index" ? "index" : "project";
  updateOutput();
}

function updateOutput() {
  const project = readForm();
  projects[currentIndex] = project;
  populateSelect();
  renderIndexOrderBoard();
  updateVisibilityButton();
  updatePreviewHeader(project);
  updatePreviewFrame(project);
  outputCode.textContent = `window.PORTFOLIO_PROJECTS = ${JSON.stringify(projects, null, 2)};\n`;

  const issues = validateProjects(project);
  updateCleanupStatus(issues);
}

function updateCleanupStatus(issues = validateProjects(readForm())) {
  const pendingCleanupCount = getPendingCleanupCount();

  if (issues.length) {
    setStatus(issues.join(" / "), "warning", true);
  } else if (pendingCleanupCount) {
    setStatus(`${pendingCleanupCount} unused asset${pendingCleanupCount === 1 ? "" : "s"} will be cleaned on Save site`, "warning", true);
  } else if (statusMessage.dataset.type === "warning") {
    setStatus("");
  }
}

async function copyProjectsFile() {
  updateOutput();
  await navigator.clipboard.writeText(outputCode.textContent);
  setStatus("projects.js copied");
}

async function saveProjectsFile() {
  updateOutput();

  const filesToUpload = Array.from(getCurrentKeptMediaFiles())
    .map((file) => importedMediaFiles.get(file))
    .filter(Boolean);

  await ensureProjectFolderForSlug(form.slug.value.trim());

  if (filesToUpload.length) {
    await uploadMediaFiles(filesToUpload);
  }

  await refreshFolderMedia();
  const project = readForm();
  projects[currentIndex] = project;
  const issues = getBlockingIssues(project);

  if (issues.length) {
    updateOutput();
    throw new Error(issues.join(" / "));
  }

  const response = await fetch("/__save-projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      projects,
      assetSlugMap: projects.map((item, index) => ({
        from: projectAssetSlugs[index] || item.slug,
        to: item.slug
      }))
    })
  });
  const data = await readApiJson(response, "Save failed");

  projectAssetSlugs = projects.map((item) => item.slug || "");
  await refreshFolderMedia();
  setStatus(data.warning || data.publishMessage || "Site saved. Assets cleaned.", data.warning ? "warning" : "");
}

function makeUniqueSlug(baseSlug) {
  const cleanBase = baseSlug || "new-project";
  let candidate = cleanBase;
  let count = 2;

  while (projects.some((project) => project.slug === candidate)) {
    candidate = `${cleanBase}-${count}`;
    count += 1;
  }

  return candidate;
}

indexOrderToggle?.addEventListener("click", () => {
  isIndexOrderCollapsed = !isIndexOrderCollapsed;
  updateIndexOrderCollapsedState();
});

previewProjectButton?.addEventListener("click", () => {
  setPreviewMode("project");
});

previewIndexButton?.addEventListener("click", () => {
  setPreviewMode("index");
});

projectSelect.addEventListener("change", () => {
  selectProject(Number(projectSelect.value));
});

form.addEventListener("input", updateOutput);
form.addEventListener("change", updateOutput);

form.title.addEventListener("input", () => {
  if (!form.slug.value.trim()) {
    form.slug.value = slugify(form.title.value);
  }
});

form.slug.addEventListener("change", () => {
  folderExists = false;
  folderMedia = [];
  folderMediaSlug = "";
  updateOutput();
  refreshFolderMedia();
});

form.mainFile.addEventListener("input", () => {
  form.mainRatio.value = "";
  applyAutoComposition();
});

form.teamEnabled.addEventListener("change", () => {
  updateTeamField();
  updateOutput();
});

mediaImport.addEventListener("change", () => {
  importMediaFiles(mediaImport.files).catch(() => {
    setStatus("Media import failed", "warning", true);
  });
});

newProjectButton.addEventListener("click", () => {
  clearImportedMediaUrls();
  const slug = makeUniqueSlug("new-project");
  projects.push({
    slug,
    title: "New Project",
    category: "CGI / VFX",
    description: "",
    summary: "",
    layout: "auto",
    mediaLayout: { composition: "smart-grid" },
    details: { Role: "", Type: "", Tools: "" },
    concept: [],
    teamEnabled: false,
    credits: [],
    media: {
      cover: { file: "", type: "image", alt: "New Project" },
      main: { file: "", type: "video", alt: "New Project main media" },
      secondary: []
    }
  });
  projectAssetSlugs.push(slug);
  currentIndex = projects.length - 1;
  populateSelect();
  fillForm(projects[currentIndex]);
  folderExists = false;
  folderMedia = [];
  folderMediaSlug = "";
  setStatus("Draft created. Import media or press Save site when ready.");
});

duplicateProjectButton.addEventListener("click", () => {
  clearImportedMediaUrls();
  const duplicate = cleanProject(projects[currentIndex]);
  duplicate.slug = makeUniqueSlug(`${duplicate.slug || "project"}-copy`);
  duplicate.title = `${duplicate.title || "Project"} Copy`;
  duplicate.hidden = true;
  projects.splice(currentIndex + 1, 0, duplicate);
  projectAssetSlugs.splice(currentIndex + 1, 0, projects[currentIndex].slug || duplicate.slug);
  currentIndex += 1;
  populateSelect();
  fillForm(projects[currentIndex]);
  folderExists = false;
  folderMedia = [];
  folderMediaSlug = "";
  setStatus("Draft duplicated. Import media or press Save site when ready.");
});

toggleVisibilityButton.addEventListener("click", () => {
  const project = projects[currentIndex];

  if (!project) {
    return;
  }

  project.hidden = !project.hidden;
  form.hidden.value = project.hidden ? "true" : "";
  updateOutput();
  setStatus(project.hidden ? "Project hidden from index" : "Project visible on index");
});

deleteProjectButton.addEventListener("click", () => {
  if (projects.length <= 1) {
    setStatus("Keep at least one project", "warning", true);
    return;
  }

  const removed = projects.splice(currentIndex, 1)[0];
  projectAssetSlugs.splice(currentIndex, 1);
  const removedSlug = removed?.slug || "";
  currentIndex = Math.min(currentIndex, projects.length - 1);
  clearImportedMediaUrls();
  populateSelect();
  fillForm(projects[currentIndex]);
  refreshFolderMedia();
  setStatus(`${removed.title || removed.slug} removed from data`);

  deleteProjectAssets(removedSlug)
    .then((deleted) => {
      setStatus(deleted
        ? `${removed.title || removed.slug} removed from data and assets`
        : `${removed.title || removed.slug} removed from data`);
    })
    .catch(() => {
      setStatus(`${removed.title || removed.slug} removed from data. Could not delete assets from disk.`, "warning", true);
    });
});

copyButton.addEventListener("click", () => {
  copyProjectsFile().catch(() => {
    setStatus("Copy failed. Use the code panel instead.", "warning", true);
  });
});

saveButton.addEventListener("click", () => {
  saveProjectsFile().catch((error) => {
    setStatus(`Save failed: ${error.message || "Check local server is running."}`, "warning", true);
  });
});

window.addEventListener("resize", resizePreviewFrame);

updateIndexOrderCollapsedState();
populateSelect();
fillForm(projects[currentIndex] || projects[0]);
refreshFolderMedia();
resizePreviewFrame();
