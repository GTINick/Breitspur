#!/usr/bin/env node
// Breitspur static site builder.  No dependencies.
// Reads site.json, content/concepts/*.json and content/products/*.json, writes the site to dist/.
// Concept status: "live" gets a full page, "soon" shows as an unveiling teaser, "draft" is skipped.
// Files starting with "_" are templates and never built.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const errors = [];

// ---------- helpers ----------
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const two = (n) => String(n).padStart(2, "0");
// Same slug as assets/configurator.js, so build and browser agree on image paths.
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
// Rendered configurator image: <path>/<center>-<lip>/<view>[-800|-240].webp
const renderSrc = (cfg, center, lip, view, size = "") => `${cfg.renders.path}/${slugify(center)}-${slugify(lip)}/${view}${size}.webp`;
const write = (rel, body) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
};
const loadDir = (rel, need) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      let d;
      try { d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
      catch (e) { errors.push(`${rel}/${f}: invalid JSON (${e.message})`); return null; }
      for (const k of need) if (d[k] === undefined || d[k] === "") errors.push(`${rel}/${f}: missing "${k}"`);
      if (!["live", "soon", "draft"].includes(d.status)) errors.push(`${rel}/${f}: status must be live, soon or draft`);
      d._file = f;
      return d;
    })
    .filter(Boolean);
};

// House style: no em or en dashes in any copy.
const dashCheck = (label, obj) => {
  const s = JSON.stringify(obj);
  if (/[–—]/.test(s)) errors.push(`${label}: contains an em or en dash`);
};

// ---------- load + validate ----------
const concepts = loadDir("content/concepts", ["status", "number", "slug", "name", "subtitle", "base", "room", "counterfactual"])
  .filter((c) => c.status !== "draft")
  .sort((a, b) => a.number - b.number);
for (const c of concepts) {
  dashCheck(c._file, c);
  if (c.status === "live") {
    if (!c.profile || !c.profile.image) errors.push(`${c._file}: live concepts need a profile image`);
    if (!c.story || !c.story.length) errors.push(`${c._file}: live concepts need a story`);
    for (const g of [c.profile, ...(c.gallery || [])].filter(Boolean)) {
      if (!g.alt) errors.push(`${c._file}: every image needs alt text`);
      if (!fs.existsSync(path.join(ROOT, g.image))) errors.push(`${c._file}: missing file ${g.image}`);
    }
  }
}
// Products: status "live" shows in the shop, "soon" and "draft" stay hidden.
// availability decides the call to action: "interest" shows the register interest form,
// "preorder" and "available" show a button to buyUrl.
const shopCats = (site.shop.categories || []).filter((k) => k.status !== "draft");
const products = site.shop.enabled
  ? loadDir("content/products", ["status", "number", "slug", "name", "category", "availability", "tagline"])
      .filter((p) => p.status === "live")
      .sort((a, b) => a.number - b.number)
  : [];
for (const p of products) {
  dashCheck(p._file, p);
  if (!shopCats.some((k) => k.slug === p.category)) errors.push(`${p._file}: category "${p.category}" is not in site.json shop.categories`);
  if (!["interest", "preorder", "available"].includes(p.availability)) errors.push(`${p._file}: availability must be interest, preorder or available`);
  if (p.availability !== "interest" && !p.buyUrl) errors.push(`${p._file}: ${p.availability} products need a buyUrl`);
  // tileRoom: optional backdrop for the product's card in the shop grids (defaults to room)
  if (p.tileRoom && !/^#[0-9a-f]{6}$/i.test(p.tileRoom)) errors.push(`${p._file}: tileRoom must be a hex like #3F4A58`);
  if (p.configurator) {
    const cfg = p.configurator;
    if (!cfg.centers || !cfg.centers.length) errors.push(`${p._file}: configurator needs at least one center color`);
    for (const c of cfg.centers || []) if (!c.name || !/^#[0-9a-f]{6}$/i.test(c.hex || "")) errors.push(`${p._file}: center colors need a name and a hex like #B8975A`);
    for (const l of cfg.lips || []) if (!["Polished", "Matched"].includes(l)) errors.push(`${p._file}: lips can be Polished or Matched`);
    if (cfg.renders) {
      if (!cfg.renders.path || !(cfg.renders.views || []).length) errors.push(`${p._file}: configurator renders need a path and views`);
      for (const c of cfg.centers || []) for (const l of cfg.lips || ["Matched"]) for (const v of cfg.renders.views || [])
        for (const size of ["", "-800", "-240"]) {
          const f = renderSrc(cfg, c.name, l, v.key, size);
          if (!fs.existsSync(path.join(ROOT, f))) errors.push(`${p._file}: missing render ${f}`);
        }
    }
  }
  for (const g of [p.image, ...(p.gallery || [])].filter(Boolean)) {
    if (!g.alt) errors.push(`${p._file}: every image needs alt text`);
    if (!fs.existsSync(path.join(ROOT, g.image))) errors.push(`${p._file}: missing file ${g.image}`);
  }
  if (p.seenOn && !concepts.some((c) => c.slug === p.seenOn && c.status === "live")) errors.push(`${p._file}: seenOn "${p.seenOn}" is not a live concept`);
}
dashCheck("site.json", site);

if (errors.length) {
  console.error("Build stopped:\n  " + errors.join("\n  "));
  process.exit(1);
}

// ---------- brand ----------
// Drop the crest at assets/brand/crest.svg and it appears in the header and footer automatically.
const crestFile = path.join(ROOT, "assets", "brand", "crest.svg");
const crest = fs.existsSync(crestFile)
  ? fs.readFileSync(crestFile, "utf8").replace(/<\?xml[^>]*\?>/, "").replace(/<!DOCTYPE[^>]*>/i, "")
      .replace("<svg", '<svg class="crest" aria-hidden="true" focusable="false"')
  : "";

const live = concepts.filter((c) => c.status === "live");
const total = concepts.length;
const url = (p) => site.domain.replace(/\/$/, "") + p;

// ---------- layout ----------
const nav = [
  ["/#concepts", "Concepts", "concepts"],
  ...(site.shop.enabled ? [["/shop/", "Shop", "shop"]] : []),
  ["/studio/", "Studio", "studio"],
  ["/inquire/", "Inquire", "inquire"],
];

const page = ({ title, description, path: p, room = "#2E2C29", active = "", body, image = "/assets/img/og.jpg", noindex = false, scripts = [] }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url(p)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url(p)}">
<meta property="og:image" content="${url(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${esc(room)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="preload" href="/assets/fonts/bodoni-moda.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/archivo-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
</head>
<body style="--room: ${esc(room)}">
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="brand" href="/" aria-label="${esc(site.name)} home">${crest}<span class="brand-word">BREITSPUR</span></a>
  <nav aria-label="Main">
    <ul>${nav.map(([h, l, k]) => `<li><a href="${h}"${k === active ? ' aria-current="page"' : ""}>${l}</a></li>`).join("")}</ul>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="foot-brand">${crest}<span>${esc(site.name.toUpperCase())}</span></div>
  <p class="foot-tag">${esc(site.tagline)}</p>
  <ul class="foot-links">
    <li>${esc(site.location.toUpperCase())}</li>
    ${site.social.instagram ? `<li><a href="${esc(site.social.instagram)}" rel="me">INSTAGRAM</a></li>` : site.contactSoon ? `<li class="foot-soon-item">INSTAGRAM COMING SOON</li>` : ""}
    ${site.email ? `<li><a href="mailto:${esc(site.email)}">${esc(site.email.toUpperCase())}</a></li>` : site.contactSoon ? `<li class="foot-soon-item">EMAIL COMING SOON</li>` : ""}
    <li><a href="/privacy/">PRIVACY</a></li>
  </ul>
  ${site.shop.enabled ? "" : `<p class="foot-soon">${esc(site.shop.teaser.toUpperCase())}</p>`}
</footer>
${scripts.map((src) => `<script src="${src}" defer></script>`).join("\n")}
</body>
</html>
`;

// ---------- components ----------
const paras = (text) => text.split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join("");
const bigName = (c, tag = "h2") => {
  const [word, ...rest] = c.name.split(" ");
  return `<${tag} class="room-name">${esc(word)}<br>${esc(rest.join(" "))}</${tag}>`;
};
const plateImg = (img, eager) => `<figure class="plate" style="--ar: ${(img.width / img.height).toFixed(3)}">
  <img src="${img.image}" srcset="${img.small} 1200w, ${img.image} ${img.width}w" sizes="(min-width: 861px) min(92vw, 2080px), 100vw" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">
  ${img.shadow === false ? "" : '<div class="plate-shadow" aria-hidden="true"></div>'}
</figure>`;

const room = (c, i, { first = false, linked = true } = {}) => {
  const isLive = c.status === "live";
  const href = `/concepts/${c.slug}/`;
  return `<section class="room${first ? " room-first" : ""}" style="--room: ${esc(c.room)}" aria-labelledby="room-${c.slug}">
  <div class="room-head">
    ${bigName(c, first ? "h1" : "h2").replace('class="room-name"', `class="room-name" id="room-${c.slug}"`)}
    <div class="room-meta">
      <p class="room-lede">${esc(c.counterfactual)}</p>
      <ul class="labels">
        <li>${esc(c.base.toUpperCase())}</li>
        <li>${esc(c.subtitle.toUpperCase())}</li>
        <li>PLATE ${two(c.number)} OF ${two(total)}</li>
      </ul>
    </div>
  </div>
  ${isLive && c.profile ? plateImg(c.profile, first) : `<div class="unveil" role="img" aria-label="${esc(c.name)} is in the studio">
    <span class="unveil-word">Unveiling soon</span>
  </div>`}
  ${isLive && linked ? `<p class="room-cta"><a class="btn btn-light" href="${href}">View ${esc(c.name)}</a></p>` : ""}
</section>`;
};

const form = (id) => `<form class="inquiry" name="inquiry" method="POST" action="/inquire/thanks/" data-netlify="true" netlify-honeypot="company">
  <input type="hidden" name="form-name" value="inquiry">
  <input type="hidden" name="subject" value="New Breitspur inquiry (%{submissionId})">
  <p class="hp"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="field"><label for="${id}-name">Name</label><input id="${id}-name" name="name" type="text" autocomplete="name" required></div>
  <div class="field"><label for="${id}-email">Email</label><input id="${id}-email" name="email" type="email" autocomplete="email" required></div>
  <div class="field"><label for="${id}-type">Looking for</label>
    <select id="${id}-type" name="type">
      ${site.services.map((s) => `<option>${esc(s.title)}</option>`).join("")}
      <option>Something else</option>
    </select>
  </div>
  <div class="field"><label for="${id}-car">The car</label><input id="${id}-car" name="car" type="text" placeholder="Year, make, model"></div>
  <div class="field field-wide"><label for="${id}-message">What should it have been</label><textarea id="${id}-message" name="message" rows="4" required></textarea></div>
  <p class="field-wide"><button class="btn btn-solid" type="submit">Send inquiry</button></p>
</form>`;

const services = () => `<div class="services">
  ${site.services.map((s) => `<article class="service" id="${s.slug}">
    <h3>${esc(s.title)}</h3>
    ${s.price || s.time ? `<p class="service-terms">${s.price ? `<span>${esc(s.price)}</span>` : ""}${s.time ? `<span>${esc(s.time)}</span>` : ""}</p>` : ""}
    <p>${esc(s.body)}</p>
    ${s.details && s.details.length ? `<ul class="ticks">${s.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
  </article>`).join("")}
</div>`;

const index = () => `<section class="index" aria-labelledby="collection">
  <h2 class="label" id="collection">THE COLLECTION</h2>
  <ol>
    ${concepts.map((c) => `<li>
      <span class="index-num">${two(c.number)}</span>
      ${c.status === "live" ? `<a class="index-name" href="/concepts/${c.slug}/">${esc(c.name)}</a>` : `<span class="index-name index-soon">${esc(c.name)}</span>`}
      <span class="index-sub">${esc(c.subtitle.toUpperCase())}</span>
      <span class="index-state">${c.status === "live" ? esc(c.base.toUpperCase()) : "UNVEILING SOON"}</span>
    </li>`).join("")}
  </ol>
</section>`;

// ---------- shop components ----------
const catOf = (p) => shopCats.find((k) => k.slug === p.category);
const productHref = (p) => `/shop/${p.category}/${p.slug}/`;
const AVAIL = { interest: "Taking inquiries", preorder: "Pre-order open", available: "Available" };
// "Coming soon" badge on anything not yet for sale.  A product can set its own "badge" text, or "badge": "" to hide it.
const badgeText = (p) => (p.badge !== undefined ? p.badge : p.availability === "interest" ? "Coming soon" : "");
const badge = (p, cls = "") => (badgeText(p) ? `<span class="badge${cls ? " " + cls : ""}">${esc(badgeText(p))}</span>` : "");

const wheelArt = (p, { eager = false, big = false } = {}) => p.image
  ? `<img src="${p.image.small || p.image.image}" srcset="${p.image.small ? `${p.image.small} 1000w, ` : ""}${p.image.image} ${p.image.width}w" sizes="${big ? "(min-width: 860px) 560px, 80vw" : "(min-width: 860px) 30vw, 80vw"}" width="${p.image.width}" height="${p.image.height}" alt="${esc(p.image.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`
  : pendingArt(p);
// A wheel without studio renders yet: its code on the room color, no stand in drawing.
const pendingArt = (p) => `<div class="wheel-pending" role="img" aria-label="${esc(p.name)}, renders in progress"><span class="pending-code" aria-hidden="true">${esc((p.code || two(p.number)).toUpperCase())}</span><span class="pending-note" aria-hidden="true">Renders in progress</span></div>`;

const productCard = (p) => `<article class="product-card">
  <a href="${productHref(p)}" class="product-link" aria-label="${esc(p.name)}, ${esc(p.tagline)}">
    <div class="product-tile${p.category === "wheels" ? "" : " product-tile-photo"}" style="--room: ${esc(p.tileRoom || p.room || "#2E2C29")}">${badge(p, "badge-tile")}${wheelArt(p)}</div>
    <div class="product-info">
      <p class="product-code">${esc((p.code || two(p.number)).toUpperCase())}</p>
      <h3 class="product-name">${esc(p.name)}</h3>
      <p class="product-tag">${esc(p.tagline)}</p>
      <ul class="product-facts">
        ${p.construction ? `<li>${esc(p.construction.toUpperCase())}</li>` : ""}
        ${p.category === "wheels" ? `<li>MADE TO ORDER</li>` : p.sizes && p.sizes.length ? `<li>${esc(p.sizes.join(" / ").toUpperCase())}</li>` : ""}
        ${p.price ? `<li>${esc(p.price.toUpperCase())}</li>` : ""}
      </ul>
    </div>
  </a>
</article>`;

// Fills the last slot of a product row, so two wheels in a three column grid do not leave a hole.
const nextCard = (href, linkText) => `<article class="product-card product-next">
  <a href="${href}" class="product-link">
    <div class="product-tile product-tile-next"><span class="next-mark" aria-hidden="true">W${two(products.length + 1)}</span></div>
    <div class="product-info">
      <p class="product-code">NEXT</p>
      <h3 class="product-name">In the studio</h3>
      <p class="product-tag">${esc(linkText)}</p>
    </div>
  </a>
</article>`;
const productRow = (items, href, linkText) => `<div class="product-grid">${items.map(productCard).join("")}${items.length % 3 && items.every((p) => p.category === "wheels") ? nextCard(href, linkText) : ""}</div>`;

// A set of four, from the per wheel price: "From $2,125 per wheel" gives "$8,500".
const setOf4 = (p) => { const m = /\$([\d,]+)/.exec(p.price || ""); return m ? "$" + (Number(m[1].replace(/,/g, "")) * 4).toLocaleString("en-US") : ""; };
const setPrice = (p, t) => (setOf4(p) ? t.replace("{price}", setOf4(p)) : t.replace(/, from \{price\} for a set of four/, ""));
// Short collapsed rows under the Inquire button: sizes, pricing, ordering, shipping.
const heroDetails = (p) => {
  const d = site.shop.heroDetails || [];
  const range = (p.fitment && p.fitment.range) || "";
  return d.length ? `<div class="hero-details">${d.map((x) => `<details><summary>${esc(x.title)}</summary><p>${esc(setPrice(p, range ? x.body.replace("{range}", range) : x.body.replace("Most cars run {range}.  ", "")))}</p></details>`).join("")}</div>` : "";
};

// Common questions, as native disclosure rows.
const faqSection = () => {
  const q = site.shop.faq || [];
  return q.length ? `<section class="paper faq" aria-labelledby="faq">
  <h2 class="label" id="faq">QUESTIONS</h2>
  <div class="faq-list">${q.map((x) => `<details><summary><span>${esc(x.q)}</span></summary><p>${esc(x.a)}</p></details>`).join("")}</div>
</section>` : "";
};

// Rendered configurator: the front view of the wheel, cut out on the room
// color, in the chosen center color and lip.  The other angles, shot in the
// studio, sit in wheelGallery below the hero.  assets/configurator.js swaps
// every image when the choice changes.
const cfgStart = (p) => {
  const cfg = p.configurator, def = cfg.default || {};
  return {
    c0: (cfg.centers.find((c) => c.name === def.center) || cfg.centers[0]).name,
    l0: def.lip || (cfg.lips || ["Matched"])[0],
  };
};
const renderAlt = (p, center, lip, label) => `${p.name} in ${center} with a ${lip === "Matched" ? "color matched" : lip.toLowerCase()} lip, ${label.toLowerCase()} view`;
const renderImg = (p, view, sizes, extra) => {
  const cfg = p.configurator, { c0, l0 } = cfgStart(p);
  return `<img class="${extra.cls}" src="${renderSrc(cfg, c0, l0, view.key, "-800")}" srcset="${renderSrc(cfg, c0, l0, view.key, "-800")} 800w, ${renderSrc(cfg, c0, l0, view.key)} 1600w" sizes="${sizes}" width="1600" height="1600" alt="${esc(renderAlt(p, c0, l0, view.label))}" data-view="${esc(view.key)}" data-label="${esc(view.label)}"${extra.eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
};
const wheelPhoto = (p) => `<div class="wheel-photo" data-renders="${esc(p.configurator.renders.path)}" data-name="${esc(p.name)}">
  ${renderImg(p, p.configurator.renders.views[0], "(min-width: 860px) 560px, 90vw", { cls: "wheel-photo-main", eager: true })}
</div>`;
const wheelGallery = (p, room) => `<section class="wheel-gallery" style="--room: ${esc(room)}" aria-label="${esc(p.name)} from every angle">
  <div class="wheel-gallery-grid">
    ${p.configurator.renders.views.slice(1).map((v) => `<figure>${renderImg(p, v, "(min-width: 860px) 46vw, 92vw", { cls: "wheel-angle" })}</figure>`).join("\n    ")}
  </div>
</section>`;

// Center color and lip choices, shown in the product hero beside the live preview.
const cfgControls = (p) => {
  const cfg = p.configurator;
  if (!cfg || !cfg.centers || !cfg.centers.length) return "";
  const def = cfg.default || {};
  const c0 = def.center || cfg.centers[0].name, l0 = def.lip || (cfg.lips || [])[0];
  return `<div class="cfg-panel">
      <fieldset class="cfg-group">
        <legend>Center <span data-center-name>${esc(c0)}</span></legend>
        <div class="swatches">${cfg.centers.map((c) => `<label class="swatch" title="${esc(c.name)}"><input type="radio" name="cfg-center" value="${esc(c.name)}" data-hex="${esc(c.hex)}" data-finish="${esc(c.finish || "")}"${c.name === c0 ? " checked" : ""}><span style="--swatch: ${esc(c.hex)}"></span><span class="sr">${esc(c.name)}</span></label>`).join("")}</div>
        ${cfg.custom ? `<p class="cfg-note">Want another color?  <a href="#interest" data-pick-custom>Ask for a custom color</a></p>` : ""}
        ${cfg.centers.some((c) => c.finish) ? `<p class="cfg-note" data-center-note>${esc((cfg.centers.find((c) => c.name === c0) || {}).finish || "")}</p>` : ""}
      </fieldset>
      ${cfg.lips && cfg.lips.length === 1 ? `<p class="cfg-group cfg-fixed"><span class="cfg-fixed-label">Lip</span> <span data-lip-name>${esc(l0 === "Matched" ? "Color matched" : l0)}</span><input type="radio" name="cfg-lip" value="${esc(l0)}" checked hidden></p>` : ""}
      ${cfg.lips && cfg.lips.length > 1 ? `<fieldset class="cfg-group">
        <legend>Lip <span data-lip-name>${esc(l0 === "Matched" ? "Color matched" : l0)}</span></legend>
        <div class="segments">${cfg.lips.map((l) => `<label class="segment"><input type="radio" name="cfg-lip" value="${esc(l)}"${l === l0 ? " checked" : ""}><span>${esc(l === "Matched" ? "Color matched" : l)}</span></label>`).join("")}</div>
      </fieldset>` : ""}
    </div>`;
};

const options = (list, extra) => [...list, ...(extra ? [extra] : [])].map((o) => `<option>${esc(o)}</option>`).join("");

// One Netlify form for every product, so all interest lands in one list you can export as CSV.
const interestForm = (p) => `<form class="inquiry" name="product-interest" method="POST" action="/shop/thanks/" data-netlify="true" netlify-honeypot="company">
  <input type="hidden" name="form-name" value="product-interest">
  <input type="hidden" name="subject" value="Interest: ${esc(p.name)} (%{submissionId})">
  <input type="hidden" name="product" value="${esc(p.name)}">
  <p class="hp"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="field"><label for="pi-name">Name</label><input id="pi-name" name="name" type="text" autocomplete="name" required></div>
  <div class="field"><label for="pi-email">Email</label><input id="pi-email" name="email" type="email" autocomplete="email" required></div>
  <div class="field field-wide"><label for="pi-car">Your car${p.category === "wheels" ? "" : ' <span class="opt">(optional)</span>'}</label><input id="pi-car" name="car" type="text" placeholder="Year, make, model"${p.category === "wheels" ? " required" : ""}></div>
  ${p.sizes && p.sizes.length ? `<div class="field"><label for="pi-size">${p.category === "wheels" ? "Diameter" : "Size"}</label><select id="pi-size" name="size">${options(p.category === "wheels" ? [...p.sizes, "Another size"] : p.sizes, "Not sure yet")}</select></div>` : ""}
  ${(() => {
    // Every product posts the same fields (center, lip), so the Netlify list stays one clean table.
    const cfg = p.configurator;
    const centers = cfg ? cfg.centers.map((c) => c.name) : p.finishes || [];
    const def = cfg && cfg.default ? cfg.default : {};
    const sel = (list, pick, extra) => [...list, extra].map((o) => `<option${o === pick ? " selected" : ""}>${esc(o)}</option>`).join("");
    const list = cfg && cfg.custom ? [...centers, "Custom color"] : centers;
    return `${centers.length ? `<div class="field"><label for="pi-center">${cfg ? "Center color" : p.category === "apparel" ? "Color" : "Finish"}</label><select id="pi-center" name="center">${sel(list, def.center, "No preference")}</select></div>${cfg && cfg.custom ? `<div class="field field-wide" data-custom-field hidden><label for="pi-custom">Your custom color</label><input id="pi-custom" name="custom-color" type="text" placeholder="Paint code, or describe it"></div>` : ""}` : '<input type="hidden" name="center" value="">'}
  ${cfg && cfg.lips && cfg.lips.length === 1 ? `<input type="hidden" name="lip" value="${esc(cfg.lips[0])}">` : ""}
  ${cfg && cfg.lips && cfg.lips.length > 1 ? `<div class="field"><label for="pi-lip">Lip</label><select id="pi-lip" name="lip">${sel(cfg.lips, def.lip, "No preference")}</select></div>` : cfg && cfg.lips && cfg.lips.length === 1 ? "" : '<input type="hidden" name="lip" value="">'}`;
  })()}
  <div class="field field-wide"><label for="pi-notes">Anything else</label><textarea id="pi-notes" name="notes" rows="3" placeholder="${p.category === "wheels" ? "Sizes you have in mind, your brakes, anything we should know" : "Anything we should know"}"></textarea></div>
  <label class="check field-wide"><input type="checkbox" name="studio-news" value="yes"> Also send occasional studio news, like new concepts and new products.</label>
  <p class="field-wide"><button class="btn btn-solid" type="submit">${p.category === "wheels" ? "Inquire" : "Notify me"}</button></p>
  <p class="form-fine field-wide">We will only email you about ${esc(p.name)}: progress, pricing and when orders open.  Unsubscribe any time.  <a href="/privacy/">Privacy</a></p>
</form>`;

const notifyForm = (id = "su") => `<form class="inquiry" name="shop-updates" method="POST" action="/shop/thanks/" data-netlify="true" netlify-honeypot="company">
  <input type="hidden" name="form-name" value="shop-updates">
  <input type="hidden" name="subject" value="Shop updates signup (%{submissionId})">
  <p class="hp"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="field"><label for="${id}-name">Name <span class="opt">(optional)</span></label><input id="${id}-name" name="name" type="text" autocomplete="name"></div>
  <div class="field"><label for="${id}-email">Email</label><input id="${id}-email" name="email" type="email" autocomplete="email" required></div>
  <div class="field field-wide"><label for="${id}-car">Your car <span class="opt">(optional)</span></label><input id="${id}-car" name="car" type="text" placeholder="Year, make, model"></div>
  <fieldset class="field-wide checks"><legend>Interested in</legend>
    ${(site.shop.categories || []).filter((k) => k.status !== "draft").map((k) => `<label class="check"><input type="checkbox" name="interests[]" value="${esc(k.title)}"> ${esc(k.title)}</label>`).join("")}
    <label class="check"><input type="checkbox" name="interests[]" value="New concepts"> New concepts</label>
  </fieldset>
  <p class="field-wide"><button class="btn btn-solid" type="submit">Keep me posted</button></p>
  <p class="form-fine field-wide">A few emails a year, only about what you ticked.  Unsubscribe any time.  <a href="/privacy/">Privacy</a></p>
</form>`;

// ---------- pages ----------
copyDir(path.join(ROOT, "assets"), path.join(OUT, "assets"));
const firstRoom = concepts[0] ? concepts[0].room : "#2E2C29";

// Home
write("index.html", page({
  title: `${site.name}: ${site.tagline}`,
  description: site.description,
  path: "/",
  room: firstRoom,
  body: `${site.home.oneLiner ? `<p class="home-oneliner">${esc(site.home.oneLiner)}</p>` : ""}<div id="concepts">${concepts.map((c, i) => room(c, i, { first: i === 0 })).join("\n")}</div>

${(() => {
  const wheels = products.filter((p) => p.category === "wheels");
  if (!wheels.length) return "";
  const k = shopCats.find((c) => c.slug === "wheels");
  return `<section class="shop-cat home-shop" aria-labelledby="home-wheels">
  <div class="shop-cat-head">
    <h2 class="serif-xl" id="home-wheels">The wheels from these cars.</h2>
    <div class="shop-cat-intro">
      <p class="body-lg muted">${esc(k.body || "")}</p>
      <p><a class="btn btn-light" href="/shop/">Inquire about the wheels</a></p>
    </div>
  </div>
  ${productRow(wheels.slice(0, 3), "#signup", "More wheels are in development.  Leave your car and hear first.")}
</section>`;
})()}

<section class="paper manifesto" aria-labelledby="mission">
  <h2 class="label" id="mission">THE STUDIO</h2>
  <div class="manifesto-body">
    <p class="serif-lead">${esc((site.home && site.home.intro) || site.manifesto.lead)}</p>
    <p class="body-lg">${esc(site.manifesto.body)}</p>
    <figure class="founder">
      <blockquote><p>${esc(site.founder.quote)}</p></blockquote>
      <figcaption>${esc(site.founder.name)}, ${esc(site.founder.role)}</figcaption>
    </figure>
    <p class="manifesto-link"><a class="text-link" href="/studio/">The story behind the studio</a></p>
  </div>
</section>

<section class="ask ask-cta home-pitch" aria-labelledby="pitch">
  <h2 class="serif-xl" id="pitch">${esc(site.home.pitch.title)}</h2>
  <div>
    <p class="body-lg muted">${esc(site.home.pitch.body)}</p>
    <p class="ask-links"><a class="btn btn-light" href="/studio/#work">${esc(site.home.pitch.cta)}</a></p>
  </div>
</section>

<section class="paper home-signup" id="signup" aria-labelledby="signup-title">
  <div class="signup-head">
    <h2 class="serif-xl" id="signup-title">${esc(site.home.signup.title)}</h2>
    <p class="body-lg">${esc(site.home.signup.body)}</p>
  </div>
  ${notifyForm("hs")}
</section>`,
}));

// Concept pages
live.forEach((c, i) => {
  const next = live[(i + 1) % live.length];
  write(`concepts/${c.slug}/index.html`, page({
    title: `${c.name}: ${c.subtitle} | ${site.name}`,
    description: `${c.counterfactual}  ${c.summary || ""}`.trim(),
    path: `/concepts/${c.slug}/`,
    room: c.room,
    active: "concepts",
    body: `${room(c, i, { first: true, linked: false })}

<section class="paper concept-story" aria-labelledby="story">
  <h2 class="label" id="story">THE STORY</h2>
  <div class="story-body">
    <p class="serif-lead">${esc(c.summary || c.counterfactual)}</p>
    ${(c.story || []).map((t) => `<p class="body-lg">${esc(t)}</p>`).join("")}
  </div>
  <dl class="specs">
    ${(c.specs || []).map((s) => `<div><dt>${esc(s.label.toUpperCase())}</dt><dd>${esc(s.value)}</dd></div>`).join("")}
  </dl>
  ${c.note ? `<p class="concept-note">${esc(c.note)}</p>` : ""}
</section>

${(() => {
  // Wheels for this car.  "seenRole": "alternate" marks a second wheel; the car is shown on the other one.
  const ws = products.filter((p) => p.seenOn === c.slug).sort((a, b) => (a.seenRole === "alternate") - (b.seenRole === "alternate") || a.number - b.number);
  if (!ws.length) return "";
  const cta = (p) => `<a class="btn btn-light" href="${productHref(p)}">${p.availability === "interest" ? "Inquire" : `View ${esc(p.name)}`}</a>`;
  if (ws.length === 1) { const p = ws[0]; return `<section class="concept-product" aria-label="${esc(p.name)}">
  <div class="concept-product-art">${wheelArt(p)}</div>
  <div>
    <p class="label">${esc(catOf(p).single ? `THE ${catOf(p).single.toUpperCase()}` : catOf(p).title.toUpperCase())}</p>
    <p class="seen-name">${esc(p.name)}${badge(p, "badge-inline")}</p>
    <p class="muted">${esc(p.tagline)}</p>
    <p>${cta(p)}</p>
  </div>
</section>`; }
  return `<section class="concept-product concept-wheels" aria-labelledby="wheels-${c.slug}">
  <h2 class="label concept-wheels-head" id="wheels-${c.slug}">WHEELS FOR ${esc(c.name.toUpperCase())}</h2>
  ${ws.map((p) => `<article class="concept-wheel">
    <a class="concept-wheel-art" href="${productHref(p)}" tabindex="-1" aria-hidden="true">${wheelArt(p)}</a>
    <p class="label">${p.seenRole === "alternate" ? "ALTERNATE" : "AS SHOWN"}</p>
    <p class="seen-name">${esc(p.name)}${badge(p, "badge-inline")}</p>
    <p class="muted">${esc(p.tagline)}</p>
    <p>${cta(p)}</p>
  </article>`).join("")}
</section>`;
})()}

${c.film ? `<section class="concept-film" aria-label="${esc(c.film.alt)}">
  <div class="film-frame">
    <video preload="none" playsinline width="${c.film.width}" height="${c.film.height}" poster="${c.film.poster}">
      <source src="${c.film.small}" type="video/mp4" media="(max-width: 860px)">
      <source src="${c.film.video}" type="video/mp4">
    </video>
    <button class="film-play" type="button" aria-label="Play the film, ${esc(c.film.duration)}"><span class="film-play-icon" aria-hidden="true"></span><span class="film-play-label">Play the film<span>${esc(c.film.duration)}</span></span></button>
  </div>
  <p class="film-caption"><span class="label">THE FILM</span><span>${esc(c.film.title)}, ${esc(c.film.duration)}</span></p>
</section>
<script>document.querySelectorAll(".film-frame").forEach(function (f) { var v = f.querySelector("video"), b = f.querySelector(".film-play"); b.addEventListener("click", function () { v.controls = true; f.classList.add("is-playing"); v.play(); }); });</script>` : ""}
${c.gallery && c.gallery.length ? `<section class="gallery" aria-label="${esc(c.name)} gallery">
  ${c.gallery.map((g) => `<figure class="${g.wide ? "wide" : ""}"><img src="${g.small}" srcset="${g.small} 1000w, ${g.image} ${g.width}w" sizes="${g.wide ? "90vw" : "(min-width: 860px) 45vw, 90vw"}" width="${g.width}" height="${g.height}" alt="${esc(g.alt)}" loading="lazy" decoding="async"></figure>`).join("")}
</section>` : ""}
${c.badge ? `<section class="concept-badge" aria-label="${esc(c.badge.alt)}"><img src="${c.badge.image}" width="${c.badge.width}" height="${c.badge.height}" alt="${esc(c.badge.alt)}" loading="lazy" decoding="async"></section>` : ""}

<section class="ask ask-cta" aria-labelledby="ask">
  <h2 class="serif-xl" id="ask">What should your car have been?</h2>
  <div>
    <p class="body-lg muted">We define commissioned concepts for private owners, shops and makers.</p>
    <p class="ask-links"><a class="btn btn-light" href="/inquire/">Commission a concept</a>${live.length > 1 ? `<a class="text-link" href="/concepts/${next.slug}/">Next: ${esc(next.name)}</a>` : ""}</p>
  </div>
</section>`,
  }));
});

// Studio
write("studio/index.html", page({
  title: `Studio | ${site.name}`,
  description: `${site.manifesto.lead}  Concept commissions and design consulting.`,
  path: "/studio/",
  room: firstRoom,
  active: "studio",
  body: `<section class="room room-first page-hero" style="--room: ${esc(firstRoom)}">
  <h1 class="room-name">The<br>studio</h1>
  <p class="room-lede">${esc(site.manifesto.lead)}</p>
</section>

<section class="paper manifesto">
  <h2 class="label">THE STORY</h2>
  <div class="manifesto-body story-first">
    ${(site.story || []).map((t) => `<p class="body-lg">${esc(t)}</p>`).join("")}
    <figure class="founder">
      <blockquote><p>${esc(site.founder.quote)}</p></blockquote>
      <figcaption>${esc(site.founder.name)}, ${esc(site.founder.role)}</figcaption>
    </figure>
  </div>
</section>

<section class="paper studio-band" aria-labelledby="work">
  <h2 class="label" id="work">SERVICES</h2>
  <div>${services()}</div>
</section>
${site.commission && (site.commission.steps || []).length ? `<section class="paper studio-band commission-steps" aria-labelledby="how">
  <h2 class="label" id="how">${esc(site.commission.title.toUpperCase())}</h2>
  <ol class="steps">${site.commission.steps.map((s, i) => `<li><span class="step-num">${two(i + 1)}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></li>`).join("")}</ol>
</section>` : ""}

<section class="ask" aria-labelledby="ask">
  <h2 class="serif-xl" id="ask">Tell us the car.</h2>
  ${form("studio")}
</section>`,
}));

// Inquire + thanks
write("inquire/index.html", page({
  title: `Inquire | ${site.name}`,
  description: "Commission a concept of your car, or bring the studio in on your project.",
  path: "/inquire/",
  room: firstRoom,
  active: "inquire",
  body: `<section class="ask ask-page">
  <div>
    <h1 class="serif-xl">Tell us the car.</h1>
    <p class="body-lg muted">Commissions, consulting, or something we have not thought of yet.  Every inquiry is read by the designer.</p>
  </div>
  ${form("inquire")}
</section>`,
}));
write("inquire/thanks/index.html", page({
  title: `Thank you | ${site.name}`,
  description: "Your inquiry is in.",
  path: "/inquire/thanks/",
  room: firstRoom,
  noindex: true,
  body: `<section class="ask ask-page">
  <div>
    <h1 class="serif-xl">Received.</h1>
    <p class="body-lg muted">Thank you.  We read every inquiry and will reply by email.</p>
    <p><a class="btn btn-light" href="/">Back to the collection</a></p>
  </div>
</section>`,
}));

// Privacy
write("privacy/index.html", page({
  title: `Privacy | ${site.name}`,
  description: "How Breitspur handles your information.",
  path: "/privacy/",
  room: firstRoom,
  body: `<section class="paper prose">
  <div class="prose-body">
  <h1 class="serif-xl">Privacy</h1>
  <p class="label">UPDATED ${esc(site.privacy.updated.toUpperCase())}</p>
  <p class="body-lg">${esc(site.privacy.intro)}</p>
  ${site.privacy.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.body.map((b) => `<p>${esc(b)}</p>`).join("")}`).join("")}
  </div>
</section>`,
}));

// Shop (built only when enabled)
if (site.shop.enabled) {
  const shopRoom = "#2E2C29";

  // Shop index: one band per category.  Live categories list their products, "soon" categories show as in development.
  write("shop/index.html", page({
    title: `Shop | ${site.name}`,
    description: site.shop.intro || "Wheels and parts from Breitspur.",
    path: "/shop/",
    room: shopRoom,
    active: "shop",
    body: `<section class="room room-first page-hero" style="--room: ${shopRoom}">
  <h1 class="room-name">The<br>shop</h1>
  <p class="room-lede">${esc(site.shop.intro || "")}</p>
</section>

${shopCats.filter((k) => k.status === "live" && products.some((p) => p.category === k.slug)).map((k) => `<section class="shop-cat" id="${k.slug}" aria-labelledby="cat-${k.slug}">
  <div class="shop-cat-head">
    <h2 class="serif-xl" id="cat-${k.slug}">${esc(k.title)}</h2>
    <div class="shop-cat-intro"><p class="body-lg muted">${esc(k.body || "")}</p></div>
  </div>
  ${productRow(products.filter((p) => p.category === k.slug), "#ask", "More are in development.  Leave your car below and hear first.")}
</section>`).join("\n")}
${(() => {
  const later = shopCats.filter((k) => !(k.status === "live" && products.some((p) => p.category === k.slug)));
  return later.length ? `<section class="shop-later" aria-labelledby="later">
  <h2 class="label" id="later">IN DEVELOPMENT</h2>
  <ul>${later.map((k) => `<li id="${k.slug}"><h3 class="shop-soon-title">${esc(k.title)}</h3><p class="muted">${esc(k.body || "")}</p></li>`).join("")}</ul>
</section>` : "";
})()}

${faqSection()}

<section class="ask" aria-labelledby="ask">
  <div>
    <h2 class="serif-xl" id="ask">Hear first.</h2>
    <p class="body-lg muted">Not sure which piece yet?  Leave your email and your car.  We will write when something fits.</p>
  </div>
  ${notifyForm()}
</section>`,
  }));

  // Product pages
  for (const p of products) {
    const k = catOf(p);
    const concept = p.seenOn ? concepts.find((c) => c.slug === p.seenOn) : null;
    // "seenOnImage": false hides the concept photo, for when the concept car wears a stand in wheel.
    // "seenImage" is the car wearing this wheel.  Without one, the concept's first gallery photo is used, unless "seenOnImage" is false.
    const seenImg = concept ? p.seenImage || (p.seenOnImage !== false ? (concept.gallery && concept.gallery[0]) || concept.profile : null) : null;
    const pRoom = p.room || shopRoom;
    const cta = p.availability === "interest"
      ? `<a class="btn btn-solid" href="#interest">${p.category === "wheels" ? "Inquire" : "Notify me"}</a>`
      : `<a class="btn btn-solid" href="${esc(p.buyUrl)}">${p.availability === "preorder" ? "Pre-order" : "Buy"}${p.price ? `, ${esc(p.price)}` : ""}</a>`;
    write(`shop/${p.category}/${p.slug}/index.html`, page({
      title: `${p.name}: ${p.tagline} | ${site.name}`,
      description: `${p.tagline}  ${p.lede || ""}`.trim(),
      path: productHref(p),
      room: pRoom,
      active: "shop",
      image: p.image ? p.image.image : "/assets/img/og.jpg",
      scripts: p.configurator ? ["/assets/configurator.js"] : [],
      body: `<section class="room room-first product-hero" style="--room: ${esc(pRoom)}" aria-labelledby="product-name"${p.configurator ? ` data-config data-polish="wr-${p.slug}-polish"` : ""}>
  <p class="crumbs label"><a href="/shop/">SHOP</a>  /  <a href="/shop/#${k.slug}">${esc(k.title.toUpperCase())}</a></p>
  <div class="product-hero-grid">
    <div class="product-hero-art">${p.configurator && p.configurator.renders ? wheelPhoto(p) : wheelArt(p, { eager: true, big: true })}</div>
    <div class="product-hero-text">
      <p class="product-code">${esc((p.code || two(p.number)).toUpperCase())}  /  ${esc(k.title.toUpperCase())}${badge(p, "badge-inline")}</p>
      <h1 class="product-title" id="product-name">${esc(p.name)}</h1>
      <p class="room-lede">${esc(p.tagline)}</p>
      ${p.lede && !p.configurator ? `<p class="product-lede">${esc(p.lede)}</p>` : ""}
      ${cfgControls(p)}
      <p class="product-cta">${cta}${p.price ? `<span class="product-price">${esc(p.price)}</span>` : ""}</p>
      ${p.category === "wheels" ? `<p class="cfg-note product-lead">Made to order in your size.  Custom widths and offsets.</p>` : ""}
      ${p.category === "wheels" ? heroDetails(p) : ""}
    </div>
  </div>
</section>
<section class="paper concept-story" aria-labelledby="about">
  <h2 class="label" id="about">THE ${esc(k.single ? k.single.toUpperCase() : "PIECE")}</h2>
  <div class="story-body">
    ${(p.story || []).map((t, i) => `<p class="${i === 0 ? "serif-lead" : "body-lg"}">${esc(t)}</p>`).join("")}
  </div>
  ${p.specs && p.specs.length ? `<dl class="specs">
    ${p.specs.map((s) => `<div><dt>${esc(s.label.toUpperCase())}</dt><dd>${esc(s.value)}</dd></div>`).join("")}
  </dl>` : ""}
  ${p.specsNote ? `<p class="concept-note">${esc(p.specsNote)}</p>` : ""}
  ${concept && !seenImg ? `<p class="drawn-for"><span class="label">DEBUTED ON</span><a class="text-link" href="/concepts/${concept.slug}/">${esc(concept.name)}, ${esc(concept.subtitle.charAt(0).toLowerCase() + concept.subtitle.slice(1))}</a></p>` : ""}
</section>
${p.configurator && p.configurator.renders ? wheelGallery(p, pRoom) : ""}
${!p.configurator && p.gallery && p.gallery.length ? `<section class="gallery product-gallery" style="--room: ${esc(pRoom)}" aria-label="${esc(p.name)} photos">
  ${p.gallery.map((g) => `<figure class="${g.wide ? "wide" : ""}"><img src="${g.small}" srcset="${g.small} ${g.width > g.height ? 1000 : 800}w, ${g.image} ${g.width}w" sizes="${g.wide ? "90vw" : "(min-width: 860px) 45vw, 90vw"}" width="${g.width}" height="${g.height}" alt="${esc(g.alt)}"${g.position ? ` style="object-position: ${esc(g.position)}"` : ""} loading="lazy" decoding="async">${g.note ? `<figcaption class="gallery-note">${esc(g.note)}</figcaption>` : ""}</figure>`).join("")}
</section>` : ""}
${p.engineering && p.engineering.length ? `<section class="paper concept-story product-engineering" aria-labelledby="engineering">
  <h2 class="label" id="engineering">ENGINEERING</h2>
  <div class="story-body">
    ${p.engineeringIntro ? `<p class="body-lg">${esc(p.engineeringIntro)}</p>` : ""}
  </div>
  <dl class="specs">
    ${p.engineering.map((s) => `<div><dt>${esc(s.label.toUpperCase())}</dt><dd>${esc(s.value)}</dd></div>`).join("")}
  </dl>
  ${p.engineeringNote ? `<p class="concept-note">${esc(p.engineeringNote)}</p>` : ""}
</section>` : ""}

${concept && seenImg ? `<section class="seen-on${seenImg ? "" : " seen-on-text"}" style="--room: ${esc(concept.room)}" aria-labelledby="seen">
  ${seenImg ? `<figure>
    <img src="${seenImg.small}" srcset="${seenImg.small} 1000w, ${seenImg.image} ${seenImg.width}w" sizes="(min-width: 860px) 60vw, 90vw" width="${seenImg.width}" height="${seenImg.height}" alt="${esc(seenImg.alt)}" loading="lazy" decoding="async">
  </figure>` : ""}
  <div>
    <h2 class="label" id="seen">${p.seenRole === "alternate" ? "THE ALTERNATE FOR" : "DEBUTED ON"}</h2>
    <p class="seen-name">${esc(concept.name)}</p>
    <p class="muted">${esc(concept.subtitle)}</p>
    <p><a class="text-link" href="/concepts/${concept.slug}/">View the concept</a></p>
  </div>
</section>` : ""}

${p.category === "wheels" ? faqSection() : ""}

${p.availability === "interest" ? `<section class="ask" id="interest" aria-labelledby="ask">
  <div>
    <h2 class="serif-xl" id="ask">${p.category === "wheels" ? "Start your set." : "Hear first."}</h2>
    <p class="body-lg muted">${p.category === "wheels" ? `${esc(p.name)} is not on sale yet.  Tell us your car and the size you have in mind.  We work out the fitment with you and send a price for your exact set.` : `${esc(p.name)} is not on sale yet.  Leave your size and you hear first when the first run is ready.`}</p>
  </div>
  ${interestForm(p)}
</section>` : ""}

${products.length > 1 ? `<section class="shop-cat" aria-labelledby="more">
  <div class="shop-cat-head"><h2 class="label" id="more">MORE FROM THE SHOP</h2></div>
  <div class="product-grid">${products.filter((o) => o !== p).slice(0, 3).map(productCard).join("")}</div>
</section>` : ""}`,
    }));
  }

  write("shop/thanks/index.html", page({
    title: `You are on the list | ${site.name}`,
    description: "Your inquiry is in.",
    path: "/shop/thanks/",
    room: shopRoom,
    noindex: true,
    body: `<section class="ask ask-page">
  <div>
    <h1 class="serif-xl">You are on the list.</h1>
    <p class="body-lg muted">Thank you.  We read every one.  You will hear from us by email when there is real news: pricing, fitment and build slots.</p>
    <p class="ask-links"><a class="btn btn-light" href="/shop/">Back to the shop</a><a class="text-link" href="/">The collection</a></p>
  </div>
</section>`,
  }));
}

// 404
write("404.html", page({
  title: `Not found | ${site.name}`,
  description: "This page does not exist.  Yet.",
  path: "/404.html",
  room: firstRoom,
  noindex: true,
  body: `<section class="room room-first page-hero">
  <h1 class="room-name">Never<br>built</h1>
  <p class="room-lede">This page does not exist.  Yet.</p>
  <p class="room-cta"><a class="btn btn-light" href="/">Back to the collection</a></p>
</section>`,
}));

// Cache busting: every asset link gets ?v=<content hash>, so browsers can cache files for a year
// (see netlify.toml) and still pick up a changed image or stylesheet on the next visit.
// Fonts are left alone because styles.css links them without a version and they never change.
const crypto = require("crypto");
const hashes = {};
const version = (rel) => {
  if (!(rel in hashes)) {
    const f = path.join(ROOT, rel);
    hashes[rel] = fs.existsSync(f) ? crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex").slice(0, 10) : null;
  }
  return hashes[rel];
};
const walk = (d) => fs.readdirSync(d).flatMap((f) => { const a = path.join(d, f); return fs.statSync(a).isDirectory() ? walk(a) : [a]; });
for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(file, "utf8").replace(/\/assets\/(?!fonts\/)[A-Za-z0-9_\-./]+\.(?:webp|jpg|jpeg|png|svg|css|js|mp4|webm)/g, (m) => {
    const v = version(m.slice(1));
    return v ? `${m}?v=${v}` : m;
  });
  fs.writeFileSync(file, html);
}

// Keep alloy designations like 7075-T6 on one line.
for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(file, "utf8").replace(/>([^<]*)</g, (m, t) => ">" + t.replace(/\b(\d{4}-T\d)\b/g, '<span class="nw">$1</span>') + "<");
  fs.writeFileSync(file, html);
}

// SEO files
const pages = ["/", ...live.map((c) => `/concepts/${c.slug}/`), "/studio/", "/inquire/", "/privacy/", ...(site.shop.enabled ? ["/shop/", ...products.map(productHref)] : [])];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${url(p)}</loc></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${url("/sitemap.xml")}\n`);

// Redirects: concepts still unveiling, and the shop while it is off, go somewhere useful instead of a 404.
const redirects = [
  ...concepts.filter((c) => c.status === "soon").map((c) => `/concepts/${c.slug}/*  /#concepts  302`),
  ...(site.shop.enabled ? [] : ["/shop/*  /  302", "/shop  /  302"]),
];
write("_redirects", redirects.join("\n") + "\n");

console.log(`Built ${pages.length} pages: ${live.length} live concept(s), ${concepts.length - live.length} unveiling soon${site.shop.enabled ? `, shop on with ${products.length} product(s)` : ", shop off"}${crest ? ", crest in header" : ", no crest yet (add assets/brand/crest.svg)"}.`);
