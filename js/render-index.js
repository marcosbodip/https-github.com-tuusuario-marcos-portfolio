const projectGrid = document.querySelector("[data-project-grid]");

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
    });

  resizeIndexGrid();
  document.fonts?.ready.then(resizeIndexGrid);
  window.addEventListener("resize", resizeIndexGrid);
}
