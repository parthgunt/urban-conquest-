const glow = document.querySelector(".geo-grid-glow");

document.addEventListener("mousemove", (e) => {
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  glow.style.setProperty("--gx", x + "%");
  glow.style.setProperty("--gy", y + "%");
});
