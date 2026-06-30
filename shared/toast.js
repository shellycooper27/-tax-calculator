(function () {
  function ensureContainer() {
    var el = document.getElementById("toast-container");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast-container";
      document.body.appendChild(el);
    }
    return el;
  }

  function showToast(message, type) {
    var container = ensureContainer();
    var toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "info");
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add("toast-show"); });
    setTimeout(function () {
      toast.classList.remove("toast-show");
      setTimeout(function () { toast.remove(); }, 250);
    }, 4000);
  }

  window.showToast = showToast;
})();
