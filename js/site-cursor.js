const canUseCustomCursor = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (canUseCustomCursor) {
  const cursor = document.createElement("div");
  const interactiveSelector = [
    "a",
    "button",
    "[role='button']",
    ".project-card",
    ".title-brush",
    ".project-media-item img",
    ".project-media-item video",
    ".about-pointcloud-shell",
    "[data-next-project-link]"
  ].join(", ");
  const mediaInvertSelector = [
    ".project-media-item img",
    ".project-media-item video",
    ".project-media-detail-asset",
    ".index-media-frame img",
    ".index-media-frame video"
  ].join(", ");

  cursor.className = "site-cursor";
  cursor.setAttribute("aria-hidden", "true");
  document.body.append(cursor);
  document.body.classList.add("has-custom-cursor");

  const moveCursor = (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.classList.add("is-visible");
  };

  const updateCursorState = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const isInteractive = Boolean(target?.closest(interactiveSelector));
    const isMediaHover = Boolean(target?.closest(mediaInvertSelector));
    const carouselItem = target?.closest(".project-media-carousel .project-media-item");
    const carousel = carouselItem?.closest(".project-media-carousel");
    const carouselOffset = Number(carouselItem?.dataset.carouselOffset || 0);
    const isDirectionalCarouselTarget = Boolean(
      carousel &&
      !carousel.classList.contains("is-expanded") &&
      Math.abs(carouselOffset) === 1
    );

    cursor.classList.toggle("is-hovering", isInteractive);
    cursor.classList.toggle("is-media-invert", isMediaHover);
    cursor.classList.toggle("is-carousel-prev", isDirectionalCarouselTarget && carouselOffset < 0);
    cursor.classList.toggle("is-carousel-next", isDirectionalCarouselTarget && carouselOffset > 0);
  };

  window.addEventListener("pointermove", (event) => {
    moveCursor(event);
    updateCursorState(event);
  });

  window.addEventListener("pointerdown", () => {
    cursor.classList.add("is-pressing");
  });

  window.addEventListener("pointerup", () => {
    cursor.classList.remove("is-pressing");
  });

  window.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget) {
      cursor.classList.remove(
        "is-visible",
        "is-hovering",
        "is-pressing",
        "is-carousel-prev",
        "is-carousel-next",
        "is-media-invert"
      );
    }
  });

  window.addEventListener("blur", () => {
    cursor.classList.remove(
      "is-visible",
      "is-hovering",
      "is-pressing",
      "is-carousel-prev",
      "is-carousel-next",
      "is-media-invert"
    );
  });
}
