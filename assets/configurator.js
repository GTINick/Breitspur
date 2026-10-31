// Wheel configurator.  Repaints the preview (SVG drawing or rendered photos), keeps the interest form in step, and keeps the choice in the URL so it can be shared.
(function () {
  var root = document.querySelector("[data-config]");
  if (!root) return;
  var svg = root.querySelector(".wheel-render");
  var photo = root.querySelector(".wheel-photo");
  var view = photo ? photo.querySelector(".wheel-photo-main").getAttribute("data-view") : null;
  var form = document.querySelector('form[name="product-interest"]');
  var polish = "url(#" + root.getAttribute("data-polish") + ")";
  var slug = function (s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-"); };
  var picked = function (n) { return root.querySelector('input[name="' + n + '"]:checked'); };
  var pick = function (n, value) {
    var inputs = root.querySelectorAll('input[name="' + n + '"]');
    for (var i = 0; i < inputs.length; i++) if (slug(inputs[i].value) === slug(value)) { inputs[i].checked = true; return true; }
    return false;
  };

  function apply(fromForm) {
    var c = picked("cfg-center"), l = picked("cfg-lip");
    if (!c) return;
    var hex = c.getAttribute("data-hex");
    if (svg) {
      svg.style.setProperty("--center", hex);
      svg.style.setProperty("--lip", !l || l.value === "Matched" ? hex : polish);
    }
    if (photo) showPhoto(c.value, l ? l.value : "Matched");
    root.querySelector("[data-center-name]").textContent = c.value;
    var note = root.querySelector("[data-center-note]");
    if (note) note.textContent = c.getAttribute("data-finish") || "";
    if (l) root.querySelector("[data-lip-name]").textContent = l.value === "Matched" ? "Color matched" : l.value;
    if (form && !fromForm) {
      if (form.center && form.center.tagName === "SELECT") form.center.value = c.value;
      if (l && form.lip && form.lip.tagName === "SELECT") form.lip.value = l.value;
    }
    try {
      var q = new URLSearchParams(location.search);
      q.set("center", slug(c.value));
      if (l) q.set("lip", slug(l.value));
      if (photo) q.set("view", view);
      history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
    } catch (e) {}
  }

  // Rendered wheel: every image lives at <renders>/<center>-<lip>/<view>[-800|-240].webp
  function showPhoto(center, lip) {
    var base = photo.getAttribute("data-renders") + "/" + slug(center) + "-" + slug(lip) + "/";
    var main = photo.querySelector(".wheel-photo-main");
    var buttons = photo.querySelectorAll(".wheel-view");
    var label = view;
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i], k = b.getAttribute("data-view");
      b.querySelector("img").src = base + k + "-240.webp";
      b.setAttribute("aria-pressed", k === view ? "true" : "false");
      if (k === view) label = b.getAttribute("data-label");
    }
    main.src = base + view + "-800.webp";
    main.srcset = base + view + "-800.webp 800w, " + base + view + ".webp 1600w";
    main.setAttribute("data-view", view);
    main.alt = photo.getAttribute("data-name") + " in " + center + " with a " + (lip === "Matched" ? "color matched" : lip.toLowerCase()) + " lip, " + String(label).toLowerCase() + " view";
  }
  if (photo) photo.addEventListener("click", function (e) {
    var b = e.target.closest(".wheel-view");
    if (!b) return;
    view = b.getAttribute("data-view");
    apply(true);
  });

  try {
    var q = new URLSearchParams(location.search);
    if (photo && q.get("view") && photo.querySelector('.wheel-view[data-view="' + q.get("view") + '"]')) view = q.get("view");
    if (q.get("center")) pick("cfg-center", q.get("center"));
    if (q.get("lip")) pick("cfg-lip", q.get("lip"));
  } catch (e) {}

  // Custom color: show the free text field when chosen, and let the panel link pick it.
  var customField = form && form.querySelector("[data-custom-field]");
  function syncCustom() { if (customField && form.center) customField.hidden = form.center.value !== "Custom color"; }
  var customLink = root.querySelector("[data-pick-custom]");
  if (customLink && form && form.center) customLink.addEventListener("click", function () { form.center.value = "Custom color"; syncCustom(); setTimeout(function () { var i = form.querySelector("#pi-custom"); if (i) i.focus({ preventScroll: true }); }, 400); });
  if (form) form.addEventListener("change", syncCustom);

  root.addEventListener("change", function () { apply(false); });
  if (form) form.addEventListener("change", function (e) {
    var t = e.target;
    if ((t.name === "center" && pick("cfg-center", t.value)) || (t.name === "lip" && pick("cfg-lip", t.value))) apply(true);
  });
  apply(false);
})();
