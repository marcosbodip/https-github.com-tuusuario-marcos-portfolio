(() => {
  const marquee = document.querySelector(".about-email-marquee");
  const track = marquee?.querySelector(".about-email-track");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!marquee || !track || reduceMotion.matches) {
    return;
  }

  const normalRate = 1;
  const hoverRate = 0.38;

  const getMarqueeAnimation = () =>
    track
      .getAnimations()
      .find((animation) => animation.animationName === "about-email-marquee");

  const setRate = (rate) => {
    const animation = getMarqueeAnimation();

    if (!animation) {
      return;
    }

    if (typeof animation.updatePlaybackRate === "function") {
      animation.updatePlaybackRate(rate);
      return;
    }

    animation.playbackRate = rate;
  };

  const slowDown = () => setRate(hoverRate);
  const speedUp = () => setRate(normalRate);

  marquee.addEventListener("pointerenter", slowDown);
  marquee.addEventListener("pointerleave", speedUp);
  marquee.addEventListener("focus", slowDown);
  marquee.addEventListener("blur", speedUp);
})();
