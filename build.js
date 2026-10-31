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
  if (!p.image && !p.drawing) errors.push(`${p._file}: needs an image or a drawing`);
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
  ["/studio/", "Studio", "studio"],
  ...(site.shop.enabled ? [["/shop/", "Shop", "shop"]] : []),
  ["/inquire/", "Inquire", "inquire"],
];

const page = ({ title, description, path: p, room = "#2E2C29", active = "", body, image = "/assets/img/og.jpg", noindex = false }) => `<!doctype html>
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
    ${site.social.instagram ? `<li><a href="${esc(site.social.instagram)}" rel="me">INSTAGRAM</a></li>` : ""}
    ${site.email ? `<li><a href="mailto:${esc(site.email)}">${esc(site.email.toUpperCase())}</a></li>` : ""}
    <li><a href="/privacy/">PRIVACY</a></li>
  </ul>
  ${site.shop.enabled ? "" : `<p class="foot-soon">${esc(site.shop.teaser.toUpperCase())}</p>`}
</footer>
</body>
</html>
`;

// ---------- components ----------
const paras = (text) => text.split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join("");
const bigName = (c, tag = "h2") => {
  const [word, ...rest] = c.name.split(" ");
  return `<${tag} class="room-name">${esc(word)}<br>${esc(rest.join(" "))}</${tag}>`;
};
const plateImg = (img, eager) => `<figure class="plate">
  <img src="${img.image}" srcset="${img.small} 1200w, ${img.image} ${img.width}w" sizes="(min-width: 1400px) 1240px, 88vw" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">
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
  ${isLive && c.profile ? plateImg(c.profile, first) : `<div class="unveil" role="img" aria-label="${esc(c.name)} is being drawn">
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
    <p>${esc(s.body)}</p>
    ${s.details && s.details.length ? `<ul class="ticks">${s.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    ${s.price ? `<p class="price">${esc(s.price)}</p>` : ""}
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
const AVAIL = { interest: "Registering interest", preorder: "Pre-order open", available: "Available" };

// A line drawing that stands in for a wheel until the render exists.  "drawing": { "style": "mesh" | "split" | "spoke", "spokes": 5, "bolts": 5 }
const pt = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`; };
const wheelDrawing = (d = {}, label = "") => {
  const style = d.style || "spoke", n = d.spokes || (style === "mesh" ? 18 : 5), bolts = d.bolts || 5;
  const lines = [];
  if (style === "mesh") {
    for (let i = 0; i < n; i++) {
      const a = (360 / n) * i;
      lines.push(`<path d="M${pt(21, a)} Q${pt(52, a + 14)} ${pt(78, a + 34)}"/>`, `<path d="M${pt(21, a)} Q${pt(52, a - 14)} ${pt(78, a - 34)}"/>`);
    }
    for (let i = 0; i < 36; i++) lines.push(`<circle class="fill" cx="${pt(84, i * 10).split(",")[0]}" cy="${pt(84, i * 10).split(",")[1]}" r="0.9"/>`);
  } else {
    const pairs = style === "split" ? [-5, 5] : [0];
    for (let i = 0; i < n; i++) {
      for (const o of pairs) {
        const a = (360 / n) * i + o, w1 = style === "split" ? 2.2 : 5, w2 = style === "split" ? 3.4 : 7;
        lines.push(`<polygon points="${pt(22, a - w1 * 2)} ${pt(78, a - w2 + o * 0.6)} ${pt(78, a + w2 + o * 0.6)} ${pt(22, a + w1 * 2)}"/>`);
      }
    }
  }
  for (let i = 0; i < bolts; i++) {
    const [x, y] = pt(13, (360 / bolts) * i).split(",");
    lines.push(`<circle cx="${x}" cy="${y}" r="2"/>`);
  }
  return `<svg class="wheel-drawing" viewBox="-100 -100 200 200" role="img" aria-label="${esc(label)}"><g fill="none" stroke="currentColor">
    <circle r="97"/><circle r="91"/><circle r="80"/><circle r="21"/><circle r="8"/>
    ${lines.join("")}
  </g></svg>`;
};

const wheelArt = (p, { eager = false, big = false } = {}) => p.image
  ? `<img src="${p.image.small || p.image.image}" srcset="${p.image.small ? `${p.image.small} 1000w, ` : ""}${p.image.image} ${p.image.width}w" sizes="${big ? "(min-width: 860px) 560px, 80vw" : "(min-width: 860px) 30vw, 80vw"}" width="${p.image.width}" height="${p.image.height}" alt="${esc(p.image.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`
  : wheelDrawing(p.drawing, `${p.name}, design drawing.  Final renders to follow.`);

const productCard = (p) => `<article class="product-card">
  <a href="${productHref(p)}" class="product-link" aria-label="${esc(p.name)}, ${esc(p.tagline)}">
    <div class="product-tile" style="--room: ${esc(p.room || "#2E2C29")}">${wheelArt(p)}${p.image ? "" : '<span class="product-tile-note">Drawing.  Renders to follow.</span>'}</div>
    <div class="product-info">
      <p class="product-code">${esc((p.code || two(p.number)).toUpperCase())}</p>
      <h3 class="product-name">${esc(p.name)}</h3>
      <p class="product-tag">${esc(p.tagline)}</p>
      <ul class="product-facts">
        ${p.construction ? `<li>${esc(p.construction.toUpperCase())}</li>` : ""}
        ${p.sizes && p.sizes.length ? `<li>${esc(p.sizes.join(" / ").toUpperCase())}</li>` : ""}
        <li class="product-state">${esc(AVAIL[p.availability].toUpperCase())}</li>
      </ul>
    </div>
  </a>
</article>`;

const options = (list, extra) => [...list, ...(extra ? [extra] : [])].map((o) => `<option>${esc(o)}</option>`).join("");

// One Netlify form for every product, so all interest lands in one list you can export as CSV.
const interestForm = (p) => `<form class="inquiry" name="product-interest" method="POST" action="/shop/thanks/" data-netlify="true" netlify-honeypot="company">
  <input type="hidden" name="form-name" value="product-interest">
  <input type="hidden" name="subject" value="Interest: ${esc(p.name)} (%{submissionId})">
  <input type="hidden" name="product" value="${esc(p.name)}">
  <p class="hp"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="field"><label for="pi-name">Name</label><input id="pi-name" name="name" type="text" autocomplete="name" required></div>
  <div class="field"><label for="pi-email">Email</label><input id="pi-email" name="email" type="email" autocomplete="email" required></div>
  <div class="field field-wide"><label for="pi-car">Your car</label><input id="pi-car" name="car" type="text" placeholder="Year, make, model" required></div>
  ${p.sizes && p.sizes.length ? `<div class="field"><label for="pi-size">Size</label><select id="pi-size" name="size">${options(p.sizes, "Not sure yet")}</select></div>` : ""}
  ${p.finishes && p.finishes.length ? `<div class="field"><label for="pi-finish">Finish</label><select id="pi-finish" name="finish">${options(p.finishes, "No preference")}</select></div>` : ""}
  ${p.category === "wheels" ? `<div class="field"><label for="pi-qty">Quantity</label><select id="pi-qty" name="quantity">${options(["Set of four", "Staggered set of four", "Pair"])}</select></div>` : ""}
  ${site.shop.budgets && site.shop.budgets.length ? `<div class="field"><label for="pi-budget">Budget${p.category === "wheels" ? ", set of four" : ""}</label><select id="pi-budget" name="budget">${options(site.shop.budgets, "Rather not say")}</select></div>` : ""}
  <div class="field field-wide"><label for="pi-notes">Anything else</label><textarea id="pi-notes" name="notes" rows="3" placeholder="Fitment questions, brake clearance, a finish you want to see"></textarea></div>
  <label class="check field-wide"><input type="checkbox" name="studio-news" value="yes"> Also send occasional studio news, like new concepts and new products.</label>
  <p class="field-wide"><button class="btn btn-solid" type="submit">Register interest</button></p>
  <p class="form-fine field-wide">We will only email you about ${esc(p.name)}: progress, pricing and when orders open.  Unsubscribe any time.  <a href="/privacy/">Privacy</a></p>
</form>`;

const notifyForm = () => `<form class="inquiry" name="shop-updates" method="POST" action="/shop/thanks/" data-netlify="true" netlify-honeypot="company">
  <input type="hidden" name="form-name" value="shop-updates">
  <input type="hidden" name="subject" value="Shop updates signup (%{submissionId})">
  <p class="hp"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="field"><label for="su-name">Name</label><input id="su-name" name="name" type="text" autocomplete="name" required></div>
  <div class="field"><label for="su-email">Email</label><input id="su-email" name="email" type="email" autocomplete="email" required></div>
  <div class="field field-wide"><label for="su-car">Your car</label><input id="su-car" name="car" type="text" placeholder="Year, make, model"></div>
  <fieldset class="field-wide checks"><legend>Interested in</legend>
    ${(site.shop.categories || []).filter((k) => k.status !== "draft").map((k) => `<label class="check"><input type="checkbox" name="interests[]" value="${esc(k.title)}"> ${esc(k.title)}</label>`).join("")}
  </fieldset>
  <p class="field-wide"><button class="btn btn-solid" type="submit">Keep me posted</button></p>
  <p class="form-fine field-wide">Only shop news, a few times a year.  Unsubscribe any time.  <a href="/privacy/">Privacy</a></p>
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
  body: `<div id="concepts">${concepts.map((c, i) => room(c, i, { first: i === 0 })).join("\n")}</div>

<section class="paper manifesto" aria-labelledby="mission">
  <h2 class="label" id="mission">${esc(site.tagline.toUpperCase())}</h2>
  <div class="manifesto-body">
    <p class="serif-lead">${esc(site.manifesto.lead)}</p>
    <p class="body-lg">${esc(site.manifesto.body)}</p>
    <figure class="founder">
      <blockquote><p>${esc(site.founder.quote)}</p></blockquote>
      <figcaption>${esc(site.founder.name)}, ${esc(site.founder.role)}</figcaption>
    </figure>
  </div>
</section>

${index()}

<section class="paper studio-band" aria-labelledby="work">
  <h2 class="label" id="work">WORK WITH THE STUDIO</h2>
  <div>
    ${services()}
    <p class="bio">${esc(site.founder.bio)}  <a href="/studio/">About the studio</a></p>
  </div>
</section>

<section class="ask" aria-labelledby="ask">
  <h2 class="serif-xl" id="ask">Tell us the car.</h2>
  ${form("home")}
</section>${(() => {
  const wheels = products.filter((p) => p.category === "wheels");
  if (!wheels.length) return "";
  const k = shopCats.find((c) => c.slug === "wheels");
  return `

<section class="shop-cat home-shop" aria-labelledby="home-wheels">
  <div class="shop-cat-head">
    <h2 class="serif-xl" id="home-wheels">${esc(k.title)}</h2>
    <div>
      <p class="body-lg muted">${esc(k.body || "")}  Not on sale yet.  Register interest and you hear first.</p>
      <p><a class="btn btn-light" href="/shop/">Visit the shop</a></p>
    </div>
  </div>
  <div class="product-grid">${wheels.slice(0, 3).map(productCard).join("")}</div>
</section>`;
})()}`,
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
    <p class="serif-lead">${esc(c.counterfactual)}</p>
    ${(c.story || []).map((t) => `<p class="body-lg">${esc(t)}</p>`).join("")}
  </div>
  <dl class="specs">
    ${(c.specs || []).map((s) => `<div><dt>${esc(s.label.toUpperCase())}</dt><dd>${esc(s.value)}</dd></div>`).join("")}
  </dl>
  ${c.note ? `<p class="concept-note">${esc(c.note)}</p>` : ""}
</section>

${products.filter((p) => p.seenOn === c.slug).map((p) => `<section class="concept-product" aria-label="${esc(p.name)}">
  <div class="concept-product-art">${wheelArt(p)}</div>
  <div>
    <p class="label">${esc(catOf(p).single ? `THE ${catOf(p).single.toUpperCase()}` : catOf(p).title.toUpperCase())}</p>
    <p class="seen-name">${esc(p.name)}</p>
    <p class="muted">${esc(p.tagline)}  ${esc(AVAIL[p.availability])}.</p>
    <p><a class="btn btn-light" href="${productHref(p)}">${p.availability === "interest" ? "Register interest" : `View ${esc(p.name)}`}</a></p>
  </div>
</section>`).join("")}

${c.gallery && c.gallery.length ? `<section class="gallery" aria-label="${esc(c.name)} gallery">
  ${c.gallery.map((g) => `<figure class="${g.wide ? "wide" : ""}"><img src="${g.small}" srcset="${g.small} 1000w, ${g.image} ${g.width}w" sizes="${g.wide ? "90vw" : "(min-width: 860px) 45vw, 90vw"}" width="${g.width}" height="${g.height}" alt="${esc(g.alt)}" loading="lazy" decoding="async"></figure>`).join("")}
</section>` : ""}

<section class="ask ask-cta" aria-labelledby="ask">
  <h2 class="serif-xl" id="ask">Your car, the version that should have existed.</h2>
  <div>
    <p class="body-lg muted">We draw commissioned concepts for private owners, shops and makers.</p>
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
  <h2 class="label">HOW WE WORK</h2>
  <div class="manifesto-body">
    <p class="serif-lead">${esc(site.manifesto.body)}</p>
    <figure class="founder">
      <blockquote><p>${esc(site.founder.quote)}</p></blockquote>
      <figcaption>${esc(site.founder.name)}, ${esc(site.founder.role)}</figcaption>
    </figure>
    <p class="body-lg">${esc(site.founder.bio)}</p>
  </div>
</section>

<section class="paper studio-band" aria-labelledby="work">
  <h2 class="label" id="work">SERVICES</h2>
  <div>${services()}</div>
</section>

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
  const steps = site.shop.process || [];
  const stepsBlock = steps.length ? `<ol class="steps">${steps.map((s, i) => `<li><span class="step-num">${two(i + 1)}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></li>`).join("")}</ol>` : "";

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

${shopCats.map((k) => {
  const items = products.filter((p) => p.category === k.slug);
  if (k.status === "live" && items.length) return `<section class="shop-cat" id="${k.slug}" aria-labelledby="cat-${k.slug}">
  <div class="shop-cat-head">
    <h2 class="serif-xl" id="cat-${k.slug}">${esc(k.title)}</h2>
    <p class="body-lg muted">${esc(k.body || "")}</p>
  </div>
  <div class="product-grid">${items.map(productCard).join("")}</div>
</section>`;
  return `<section class="shop-cat shop-cat-soon" id="${k.slug}" aria-labelledby="cat-${k.slug}">
  <h2 class="shop-soon-title" id="cat-${k.slug}">${esc(k.title)}</h2>
  <p class="muted">${esc(k.body || "")}</p>
  <p class="label shop-soon-state">IN DEVELOPMENT</p>
</section>`;
}).join("\n")}

${steps.length ? `<section class="paper" aria-labelledby="how">
  <h2 class="label" id="how">HOW RELEASES WORK</h2>
  ${stepsBlock}
</section>` : ""}

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
    const seenImg = concept && p.seenOnImage !== false ? (concept.gallery && concept.gallery[0]) || concept.profile : null;
    const pRoom = p.room || shopRoom;
    const cta = p.availability === "interest"
      ? `<a class="btn btn-solid" href="#interest">Register interest</a>`
      : `<a class="btn btn-solid" href="${esc(p.buyUrl)}">${p.availability === "preorder" ? "Pre-order" : "Buy"}${p.price ? `, ${esc(p.price)}` : ""}</a>`;
    write(`shop/${p.category}/${p.slug}/index.html`, page({
      title: `${p.name}: ${p.tagline} | ${site.name}`,
      description: `${p.tagline}  ${p.lede || ""}`.trim(),
      path: productHref(p),
      room: pRoom,
      active: "shop",
      image: p.image ? p.image.image : "/assets/img/og.jpg",
      body: `<section class="room room-first product-hero" style="--room: ${esc(pRoom)}" aria-labelledby="product-name">
  <p class="crumbs label"><a href="/shop/">SHOP</a>  /  <a href="/shop/#${k.slug}">${esc(k.title.toUpperCase())}</a></p>
  <div class="product-hero-grid">
    <div class="product-hero-art">${wheelArt(p, { eager: true, big: true })}${p.image ? "" : '<p class="product-tile-note">Design drawing.  Final renders to follow.</p>'}</div>
    <div class="product-hero-text">
      <p class="product-code">${esc((p.code || two(p.number)).toUpperCase())}  /  ${esc(k.title.toUpperCase())}</p>
      <h1 class="product-title" id="product-name">${esc(p.name)}</h1>
      <p class="room-lede">${esc(p.tagline)}</p>
      ${p.lede ? `<p class="product-lede">${esc(p.lede)}</p>` : ""}
      <ul class="labels product-labels">
        <li>${esc(AVAIL[p.availability].toUpperCase())}</li>
        ${p.stage ? `<li>${esc(p.stage.toUpperCase())}</li>` : ""}
        ${p.price && p.availability === "interest" ? `<li>${esc(p.price.toUpperCase())}</li>` : ""}
      </ul>
      <p class="product-cta">${cta}</p>
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
</section>

${concept ? `<section class="seen-on${seenImg ? "" : " seen-on-text"}" style="--room: ${esc(concept.room)}" aria-labelledby="seen">
  ${seenImg ? `<figure>
    <img src="${seenImg.small}" srcset="${seenImg.small} 1000w, ${seenImg.image} ${seenImg.width}w" sizes="(min-width: 860px) 60vw, 90vw" width="${seenImg.width}" height="${seenImg.height}" alt="${esc(seenImg.alt)}" loading="lazy" decoding="async">
  </figure>` : ""}
  <div>
    <h2 class="label" id="seen">AS DRAWN ON</h2>
    <p class="seen-name">${esc(concept.name)}</p>
    <p class="muted">${esc(concept.subtitle)}</p>
    <p><a class="text-link" href="/concepts/${concept.slug}/">View the concept</a></p>
  </div>
</section>` : ""}

${p.availability === "interest" ? `<section class="ask" id="interest" aria-labelledby="ask">
  <div>
    <h2 class="serif-xl" id="ask">Register interest.</h2>
    <p class="body-lg muted">${esc(p.name)} is not for sale yet.  Tell us your car and the size you want.  Your answers decide which fitments get made first, and the list hears about pricing and production slots before anyone else.</p>
    ${stepsBlock}
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
    description: "Your interest is registered.",
    path: "/shop/thanks/",
    room: shopRoom,
    noindex: true,
    body: `<section class="ask ask-page">
  <div>
    <h1 class="serif-xl">You are on the list.</h1>
    <p class="body-lg muted">Thank you.  We read every one.  You will hear from us by email when there is real news: pricing, fitment and production slots.</p>
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
  const html = fs.readFileSync(file, "utf8").replace(/\/assets\/(?!fonts\/)[A-Za-z0-9_\-./]+\.(?:webp|jpg|jpeg|png|svg|css)/g, (m) => {
    const v = version(m.slice(1));
    return v ? `${m}?v=${v}` : m;
  });
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
