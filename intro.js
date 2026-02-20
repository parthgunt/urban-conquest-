const startBtn = document.getElementById("startBtn");
const intro = document.getElementById("intro");
const statusBox = document.getElementById("statusBox");
const grid = document.querySelector(".geo-grid");

/* STATUS MESSAGE */
function showStatus(message) {
  statusBox.textContent = message;
  statusBox.style.opacity = "1";
  setTimeout(() => {
    statusBox.style.opacity = "0";
  }, 1800);
}

startBtn.addEventListener("click", () => {
  intro.style.opacity = "0";

  setTimeout(() => {
    // go to game page
    window.location.href = "login.html";

  }, 500);
});

/* GRID MOUSE INTERACTION */
document.addEventListener("mousemove", (e) => {
  const x = (e.clientX / window.innerWidth) * 100 + "%";
  const y = (e.clientY / window.innerHeight) * 100 + "%";

  grid.style.setProperty("--x", x);
  grid.style.setProperty("--y", y);
});
/* SHOCKWAVE TRIGGER AFTER TITLE ANIMATION */
const shockwave = document.querySelector(".shockwave");
const title = document.querySelector(".run-in");

title.addEventListener("animationend", () => {
  shockwave.classList.add("active");

  // Optional: brief corner glow boost
  document.querySelectorAll(".corner-glow").forEach(glow => {
    glow.style.opacity = "1";
    setTimeout(() => {
      glow.style.opacity = "0.6";
    }, 400);
  });
});
