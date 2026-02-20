document.addEventListener("DOMContentLoaded", () => {
  const signupBtn = document.getElementById("signupBtn");

  signupBtn.addEventListener("click", () => {
    // Fake account creation
    window.location.href = "login.html";
  });
});
