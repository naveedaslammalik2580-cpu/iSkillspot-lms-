// Rotating skill word in hero
const words = ["Freelancing", "Etsy", "Coding", "Marketing", "Editing", "YouTube Automation"];
const el = document.getElementById("skillWord");
let i = 0;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduce && el) {
  setInterval(() => {
    i = (i + 1) % words.length;
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = words[i]; el.style.opacity = 1; }, 250);
  }, 2600);
  el.style.transition = "opacity .25s";
}
// Scroll reveals
const obs = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
}), { threshold: .12 });
document.querySelectorAll(".reveal").forEach(n => obs.observe(n));
