// Color selection
document.querySelectorAll(".color").forEach(color => {
  color.addEventListener("click", () => {
    document.querySelectorAll(".color")
      .forEach(c => c.classList.remove("active"));

    color.classList.add("active");
  });
});

// Start game
document.getElementById("startGameBtn").addEventListener("click", () => {
  window.location.href = "game.html";
});
