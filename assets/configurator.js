// Wheel configurator.  Repaints the preview, keeps the interest form in step, and keeps the choice in the URL so it can be shared.
(function () {
  var root = document.querySelector("[data-config]");
  if (!root) return;
  var svg = root.querySelector(".wheel-render");
  var form = document.querySelector('form[name="product-interest"]');
  var name = root.getAttribute("data-name");
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
    svg.style.setProperty("--center", hex);
    svg.style.setProperty("--lip", !l || l.value === "Matched" ? hex : polish);
    root.querySelector("[data-center-name]").textContent = c.value;
    if (l) root.querySelector("[data-lip-name]").textContent = l.value === "Matched" ? "Color matched" : l.value;
    root.querySelector("[data-summary]").textContent = name + ", " + c.value + " center" + (l ? ", " + (l.value === "Matched" ? "color matched" : l.value.toLowerCase()) + " lip" : "");
    if (form && !fromForm) {
      if (form.center && form.center.tagName === "SELECT") form.center.value = c.value;
      if (l && form.lip && form.lip.tagName === "SELECT") form.lip.value = l.value;
    }
    try {
      var q = new URLSearchParams(location.search);
      q.set("center", slug(c.value));
      if (l) q.set("lip", slug(l.value));
      history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
    } catch (e) {}
  }

  try {
    var q = new URLSearchParams(location.search);
    if (q.get("center")) pick("cfg-center", q.get("center"));
    if (q.get("lip")) pick("cfg-lip", q.get("lip"));
  } catch (e) {}

  root.addEventListener("change", function () { apply(false); });
  if (form) form.addEventListener("change", function (e) {
    var t = e.target;
    if ((t.name === "center" && pick("cfg-center", t.value)) || (t.name === "lip" && pick("cfg-lip", t.value))) apply(true);
  });
  apply(false);
})();
