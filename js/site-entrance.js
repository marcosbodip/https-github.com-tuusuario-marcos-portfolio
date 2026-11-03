(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches || !Element.prototype.animate) return;

  const active = new Map();
  const mobile = window.matchMedia("(max-width: 699px), (max-width: 1000px) and (max-height: 600px) and (orientation: landscape)");
  const root = document.documentElement;
  let mayAnimate = true;
  root.classList.add("is-preparing-entrance");
  // Fail open if another page script stalls: never hide content indefinitely.
  const safety = setTimeout(() => {
    mayAnimate = false;
    root.classList.remove("is-preparing-entrance");
  }, 2000);

  function reveal(element, { delay = 0, distance = 8 } = {}) {
    if (reducedMotion.matches || !element.isConnected) return;
    const animation = element.animate([
      { opacity: 0, translate: `0 ${mobile.matches ? distance * 0.6 : distance}px` },
      { opacity: 1, translate: "0 0" }
    ], {
      duration: mobile.matches ? 750 : 1100,
      delay,
      easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      fill: "backwards"
    });
    active.set(element, animation);
    const clear = () => active.delete(element);
    animation.finished.then(clear, clear);
  }

  function add(selector, options = {}) {
    document.querySelectorAll(selector).forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (rect.top < innerHeight && rect.bottom > 0) {
        reveal(element, options);
      }
    });
  }

  function start() {
    try {
      if (!mayAnimate || reducedMotion.matches) return;
      // Rendering scripts have now replaced the SEO fallback with the final composition.
      add(".about-copy");
      add(".project-card");
      add(".project-intro-hero");
      add(".project-copy-accordion-stack", { distance: 0 });
      add(".project-gallery", { distance: 0 });
    } finally {
      clearTimeout(safety);
      root.classList.remove("is-preparing-entrance");
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  function finishAll() {
    mayAnimate = false;
    clearTimeout(safety);
    root.classList.remove("is-preparing-entrance");
    active.forEach(animation => animation.cancel());
    active.clear();
  }
  reducedMotion.addEventListener("change", finishAll);
  window.addEventListener("pagehide", finishAll);
  document.addEventListener("focusin", ({ target }) => {
    active.forEach((animation, element) => {
      if (element.contains(target)) animation.cancel();
    });
  });
})();
