/* Landing page interactions: scrolling UI, reveals, hero parallax. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealItems = Array.from(document.querySelectorAll(".reveal"));

  // Reveal sections as they enter the viewport.
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("in"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealItems.forEach((item) => observer.observe(item));
  }

  // Nav chrome + reading progress.
  const nav = document.querySelector(".nav");
  const progress = document.querySelector(".scroll-progress");

  const updateScroll = () => {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 16);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.transform = `scaleX(${ratio})`;
    }
  };

  updateScroll();
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("resize", updateScroll, { passive: true });

  // Subtle pointer parallax for the hero board (desktop pointers only).
  const visual = document.querySelector(".hero-visual");
  const tilt = document.querySelector("#boardTilt");
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if (visual && tilt && finePointer && !reduceMotion) {
    let frame = 0;

    visual.addEventListener("pointermove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = visual.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        tilt.style.setProperty("--rx", `${(-y * 4).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`);
      });
    });

    visual.addEventListener("pointerleave", () => {
      cancelAnimationFrame(frame);
      tilt.style.setProperty("--rx", "0deg");
      tilt.style.setProperty("--ry", "0deg");
    });
  }

  // Keep the footer year current when the page is hosted long-term.
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
