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
const products = site.shop.enabled ? loadDir("content/products", ["status", "slug", "name"]).filter((p) => p.status === "live") : [];
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
    <p class="serif-lead">${esc(c.counterfactual)}</p>
    ${(c.story || []).map((t) => `<p class="body-lg">${esc(t)}</p>`).join("")}
  </div>
  <dl class="specs">
    ${(c.specs || []).map((s) => `<div><dt>${esc(s.label.toUpperCase())}</dt><dd>${esc(s.value)}</dd></div>`).join("")}
  </dl>
  ${c.note ? `<p class="concept-note">${esc(c.note)}</p>` : ""}
</section>

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
  write("shop/index.html", page({
    title: `Shop | ${site.name}`,
    description: "Wheels, parts and apparel from Breitspur.",
    path: "/shop/",
    room: firstRoom,
    active: "shop",
    body: `<section class="room room-first page-hero"><h1 class="room-name">The<br>shop</h1></section>
<section class="paper shop">
  ${products.length ? products.map((p) => `<article class="product">
    ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : ""}
    <p class="label">${esc((p.category || "").toUpperCase())}</p>
    <h2>${esc(p.name)}</h2>
    <p>${esc(p.summary || "")}</p>
    ${p.price ? `<p class="price">${esc(p.price)}</p>` : ""}
    ${p.buyUrl ? `<a class="btn btn-solid" href="${esc(p.buyUrl)}">Buy</a>` : ""}
  </article>`).join("") : `<p class="body-lg">${esc(site.shop.teaser)}</p>`}
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
const pages = ["/", ...live.map((c) => `/concepts/${c.slug}/`), "/studio/", "/inquire/", "/privacy/", ...(site.shop.enabled ? ["/shop/"] : [])];
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

console.log(`Built ${pages.length} pages: ${live.length} live concept(s), ${concepts.length - live.length} unveiling soon${crest ? ", crest in header" : ", no crest yet (add assets/brand/crest.svg)"}.`);
