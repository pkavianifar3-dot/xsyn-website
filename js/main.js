document.addEventListener("DOMContentLoaded", () => {

  const mobileToggle =
    document.getElementById("mobileToggle");

  const mobileMenu =
    document.getElementById("mobileMenu");

  if (!mobileToggle || !mobileMenu) {
    return;
  }


  const mobileItems =
    mobileMenu.querySelectorAll(".mobile-item");


  /* =========================================================
     OPEN / CLOSE MOBILE MENU
     ========================================================= */

  mobileToggle.addEventListener("click", () => {

    const isOpen =
      mobileMenu.classList.toggle("open");

    mobileToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

  });


  /* =========================================================
     MOBILE ACCORDIONS
     ========================================================= */

  mobileItems.forEach(item => {

    const mainLink =
      item.querySelector(":scope > a");

    const submenu =
      item.querySelector(":scope > .mobile-sub");


    if (!mainLink || !submenu) {
      return;
    }


    mainLink.setAttribute(
      "aria-expanded",
      "false"
    );


    mainLink.addEventListener("click", event => {

      event.preventDefault();


      mobileItems.forEach(other => {

        if (other === item) {
          return;
        }


        other.classList.remove("open");


        const otherLink =
          other.querySelector(":scope > a");


        if (otherLink) {

          otherLink.setAttribute(
            "aria-expanded",
            "false"
          );

        }

      });


      const isOpen =
        item.classList.toggle("open");


      mainLink.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

    });

  });


  /* =========================================================
     CLOSE AFTER NAVIGATION
     ========================================================= */

  const closeLinks =
    mobileMenu.querySelectorAll(
      ".mobile-sub a"
    );


  closeLinks.forEach(link => {

    link.addEventListener("click", () => {

      mobileMenu.classList.remove("open");

      mobileToggle.setAttribute(
        "aria-expanded",
        "false"
      );


      mobileItems.forEach(item => {

        item.classList.remove("open");


        const mainLink =
          item.querySelector(":scope > a");


        if (mainLink) {

          mainLink.setAttribute(
            "aria-expanded",
            "false"
          );

        }

      });

    });

  });


  /* =========================================================
     CLOSE MENU FOR DIRECT MOBILE LINKS
     ========================================================= */

  mobileItems.forEach(item => {

    const mainLink =
      item.querySelector(":scope > a");

    const submenu =
      item.querySelector(":scope > .mobile-sub");


    if (!mainLink || submenu) {
      return;
    }


    mainLink.addEventListener("click", () => {

      mobileMenu.classList.remove("open");

      mobileToggle.setAttribute(
        "aria-expanded",
        "false"
      );

    });

  });


  /* =========================================================
     ESC KEY
     ========================================================= */

  document.addEventListener("keydown", event => {

    if (event.key !== "Escape") {
      return;
    }


    mobileMenu.classList.remove("open");

    mobileToggle.setAttribute(
      "aria-expanded",
      "false"
    );


    mobileItems.forEach(item => {

      item.classList.remove("open");


      const mainLink =
        item.querySelector(":scope > a");


      if (mainLink) {

        mainLink.setAttribute(
          "aria-expanded",
          "false"
        );

      }

    });

  });

});
