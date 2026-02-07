/**
 * Video Embed Lazy Loading
 * Handles click-to-play functionality for video embeds
 */

export function initVideoEmbeds() {
  const videoContainers = document.querySelectorAll("[data-video-wrapper]");

  videoContainers.forEach((wrapper) => {
    const playBtn = wrapper.querySelector("[data-video-play-btn]");
    const videoSrc = wrapper.dataset.videoSrc;

    if (!playBtn || !videoSrc) {
      return;
    }

    // Handle click on play button or thumbnail
    const loadVideo = () => {
      // Create iframe
      const iframe = document.createElement("iframe");
      iframe.src =
        videoSrc + (videoSrc.includes("?") ? "&" : "?") + "autoplay=1";
      iframe.title =
        playBtn.getAttribute("aria-label")?.replace("Play video: ", "") ||
        "Video player";
      iframe.frameBorder = "0";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.className = "video-embed-iframe";
      iframe.loading = "lazy";

      // Replace content with iframe
      wrapper.innerHTML = "";
      wrapper.appendChild(iframe);

      // Remove lazy class
      wrapper.classList.remove("video-embed-wrapper--lazy");

      // Track video play event (if analytics available)
      if (window.gtag) {
        window.gtag("event", "video_play", {
          video_url: videoSrc,
          video_title: iframe.title,
        });
      }
    };

    // Add click handler to button
    playBtn.addEventListener("click", loadVideo);

    // Add click handler to thumbnail
    const thumbnail = wrapper.querySelector(".video-embed-thumbnail");
    if (thumbnail) {
      thumbnail.addEventListener("click", loadVideo);
      thumbnail.style.cursor = "pointer";
    }

    // Keyboard support
    playBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        loadVideo();
      }
    });
  });
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVideoEmbeds);
} else {
  initVideoEmbeds();
}

// Export for module use
export default initVideoEmbeds;
