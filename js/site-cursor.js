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

    cursor.classList.toggle("is-hovering", isInteractive);
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
      cursor.classList.remove("is-visible", "is-hovering", "is-pressing");
    }
  });

  window.addEventListener("blur", () => {
    cursor.classList.remove("is-visible", "is-hovering", "is-pressing");
  });
}
