document.addEventListener("DOMContentLoaded", () => {

  const mobileToggle = document.getElementById("mobileToggle");
  const mobileMenu = document.getElementById("mobileMenu");

  if (!mobileToggle || !mobileMenu) return;

  mobileToggle.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
  });

  document.querySelectorAll(".mobile-item").forEach(item => {

    const mainLink = item.querySelector(":scope > a");
    const submenu = item.querySelector(".mobile-sub");

    if (!mainLink || !submenu) return;

    mainLink.addEventListener("click", event => {

      event.preventDefault();

      document.querySelectorAll(".mobile-item").forEach(other => {
        if (other !== item) {
          other.classList.remove("open");
        }
      });

      item.classList.toggle("open");

    });

  });

  document.querySelectorAll("#mobileMenu a").forEach(link => {

    link.addEventListener("click", () => {

      if (!link.parentElement.classList.contains("mobile-item")) {
        mobileMenu.classList.remove("open");
      }

    });

  });

});
