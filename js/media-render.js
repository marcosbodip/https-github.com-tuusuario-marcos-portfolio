function createMediaElement(media, basePath, className = "") {
  const mediaPath = media.previewUrl || `${basePath}/${media.file}`;

  if (media.type === "video" || /\.(mp4|webm|mov)$/i.test(media.file)) {
    const video = document.createElement("video");
    video.className = className;
    video.src = mediaPath;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", media.alt || "");
    return video;
  }

  const img = document.createElement("img");
  img.className = className;
  img.src = mediaPath;
  img.alt = media.alt || "";
  return img;
}

function getMediaRatioClass(media) {
  const ratio = media.ratio;

  if (!ratio) {
    return "";
  }

  if (ratio === "full-row") {
    return "project-media-full-row";
  }

  return `project-media-${ratio}`;
}
