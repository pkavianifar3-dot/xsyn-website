document.addEventListener("DOMContentLoaded", () => {

  const mobileToggle =
    document.getElementById("mobileToggle");

  const mobileMenu =
    document.getElementById("mobileMenu");

  if (!mobileToggle || !mobileMenu) {
    return;
  }


  /* =========================================================
     MOBILE MENU OPEN / CLOSE
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
     MOBILE ACCORDION
     ========================================================= */

  const mobileItems =
    document.querySelectorAll(".mobile-item");


  mobileItems.forEach(item => {

    const mainLink =
      item.querySelector(":scope > a");

    const submenu =
      item.querySelector(":scope > .mobile-sub");


    if (!mainLink || !submenu) {
      return;
    }


    mainLink.addEventListener("click", event => {

      /*
       * Parent item opens the accordion.
       * Direct navigation remains available
       * through the submenu links.
       */

      event.preventDefault();


      mobileItems.forEach(other => {

        if (other !== item) {

          other.classList.remove("open");


          const otherLink =
            other.querySelector(":scope > a");


          if (otherLink) {

            otherLink.setAttribute(
              "aria-expanded",
              "false"
            );

          }

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
     CLOSE MENU AFTER SELECTING A SUB-LINK
     ========================================================= */

  mobileMenu
    .querySelectorAll(".mobile-sub a, .mobile-item > a:not(:has(.mobile-sub))")
    .forEach(link => {

      link.addEventListener("click", () => {

        mobileMenu.classList.remove("open");

        mobileToggle.setAttribute(
          "aria-expanded",
          "false"
        );

      });

    });


  /* =========================================================
     CLOSE WHEN ESC IS PRESSED
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

      const link =
        item.querySelector(":scope > a");


      if (link) {

        link.setAttribute(
          "aria-expanded",
          "false"
        );

      }

    });

  });

});
