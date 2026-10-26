# Breitspur

The Breitspur studio site.  Static, no dependencies, deployed on Netlify.

## Build

    node build.js        # writes the site to dist/
    npm run serve        # build and preview locally

The build stops with a clear message if a concept is missing something it needs, an image has no alt text, or any copy contains an em or en dash.

## Add a concept

1. Copy `content/concepts/breitspur-03.json` and rename it.
2. Set `status`:
   * `draft`: hidden everywhere.
   * `soon`: shows on the homepage as "Unveiling soon", no page yet.
   * `live`: full concept page.  Needs a profile image, a story and alt text for every image.
3. Put images in `assets/img/concepts/<slug>/`.  The profile image is a transparent cutout of a true side profile; the room color behind it comes from `room`.

## Brand

* `assets/brand/crest.svg` is the lion shield.  It inherits the text color, so it works on any room.
* `assets/brand/favicon.svg` is the browser tab icon.

## Shop

Set `shop.enabled` to `true` in `site.json` to switch on the Shop page and nav link.  Products live in `content/products/`, one JSON file each.  While the shop is off, `/shop` redirects home.

## Inquiries

The inquiry form uses Netlify Forms.  Submissions appear under Forms in the Netlify dashboard; turn on email notifications there.

## Build credits

`netlify.toml` skips a deploy when nothing that affects the site changed, because this site shares build credits with ModSheet.
