# Illume — website source

The live site: **https://www.illumeandco.online**

This folder is the complete website. It is a plain static site — no build step, no
framework, no dependencies. Open `index.html` in a browser and it works.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home — hero, transformation, work teaser with the reel, the Studio Plan, Launch Month, sample month, comparison, who it's for, what we need, what happens next, the two of us, FAQ, CTA |
| `portfolio.html` | Full portfolio grid |
| `start.html` | Enquiry form ("Start your project") — applying for the Studio Plan |
| `thanks.html` | Confirmation page the form redirects to after submitting |

## The offer

One plan: **The Studio Plan, $950 / month, USD, month to month**, cancel anytime with
7 days' notice, everything made is the client's to keep. Month one is the Launch Month.
There is no trial, no one-off package, and no client cap or spots count anywhere on the
site — keep it that way.

## The showcase page

`showcase/` is a standalone portfolio, live at **https://www.illumeandco.online/showcase**.
It is separate from the site: it carries its own CSS inline, never loads `ind.css`, and
nothing on the site links to it — it exists to be sent to people directly.

| File | What it is |
|---|---|
| `showcase/index.html` | The page. Generated, but committed, so nothing needs building to deploy |
| `showcase/images/` | The pieces it displays |
| `showcase/build.py` | Regenerates `index.html` from the section list at the top of the file |

To change what appears or how it is grouped, edit the `SECTIONS` list in
`showcase/build.py` and run it — it needs Python and Pillow:

```bash
cd showcase
python3 build.py                     # rewrites index.html
python3 build.py /tmp/one-file.html  # also writes a single-file copy with images inlined
```

## Shared files

| File | What it is |
|---|---|
| `ind.css` | All shared styling — tokens, fonts, type, buttons, footer, WhatsApp button, homepage sections |
| `ind.js` | Scroll reveal, before/after slider, comparison count-up, desktop card tilt, reel autoplay |
| `logo.svg` | The Illume wordmark used in every header |
| `fonts/` | Self-hosted, latin-subset woff2 files for Fraunces, DM Sans and DM Mono |
| `og.png` | 1200×630 Open Graph image used when links are shared |

## Images

Every image lives in `images/` and is committed here. Nothing loads from an
external host, so the site cannot break because someone else's link expired.

The pages reference the **`.webp`** files, which are resized for display and
compressed. The original `.png` / `.jpg` files sit beside them as masters — if you
add or replace an image, make a WebP at roughly 800–960px wide and point the page at that.

| Folder | Contents |
|---|---|
| `images/before/` | Unedited client phone photos (the "before" side) |
| `images/after/` | Finished Illume creative paired with a "before" |
| `images/work/` | Portfolio pieces |
| `images/promo/` | Promo / social graphics with text on them |

## The reel

The homepage work teaser has a self-hosted reel slot: `media/reel.mp4` with the poster
`media/reel-poster.webp`. The video is `muted`, `playsinline`, `loop`, `preload="none"`,
and only plays while it is scrolled into view. Until `media/reel.mp4` exists the slot shows
the poster with a "coming soon" label.

To add the reel: export an H.264 MP4, 1080×1920 or 720×1280, ideally under 3 MB, and save
it as `media/reel.mp4`. Replace `media/reel-poster.webp` with a real frame from it
(720×1280) so the poster matches.

## The enquiry form

`start.html` posts to **formsubmit.co**, which forwards submissions to
`illumeandco.online@gmail.com` and then sends the visitor to `thanks.html`.
There is no server and no database — the form is the whole backend.

If the studio email address ever changes, it has to be updated in two places in
`start.html`: the `<form action="...">` URL and the `mailto:` link below it.

## Contact links

WhatsApp: `https://wa.me/971555045014` with a prefilled message. Instagram:
`https://www.instagram.com/illumeandco` — the only social account, don't add others.

## Analytics

Every page loads `/_vercel/insights/script.js` (Vercel Web Analytics). It only records
anything once Web Analytics is enabled on the `illume-site` project in the Vercel
dashboard (Project → Analytics → Enable).

## Editing

Edit the HTML/CSS directly. To preview a change, open the file in a browser, or run a
static server from this folder.

To publish, commit and push — Vercel is connected to this repository and deploys
`main` automatically. Any other branch gets a preview URL.

```bash
git add -A
git commit -m "Describe the change"
git push
```

## Where this is hosted

- **Repository:** https://github.com/stevesdigitalcroissant-star/Illumeandco
- **Vercel project:** `illume-site` (team: Freelance Marketing)
- **Domains:** illumeandco.online, www.illumeandco.online
