# Illume — website source

The live site: **https://www.illumeandco.online**

This folder is the complete website. It is a plain static site — no build step, no
framework, no dependencies. Open `index.html` in a browser and it works.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home — spotlight hero (mosaic of the best pieces, the light follows the cursor), the film slot, the work strip (scrolls sideways on its own, never holds the page), the light slider (what the client sent → the finished creative), the reel, five disciplines, numbers, the Studio Plan, FAQ, CTA |
| `portfolio.html` | Our Work — pieces grouped by what they were made to do (sell a product, fill the chairs, fill the tables, move people to act, film). Every picture is shown whole at its own aspect ratio, never cropped. Pieces marked B reveal the client's original picture on hover or tap |
| `start.html` | Enquiry form ("Start your project") — applying for the Studio Plan |
| `thanks.html` | Confirmation page the form redirects to after submitting |

## The offer

One plan: **The Studio Plan, month to month**, cancel anytime with 7 days' notice, everything
made is the client's to keep. Month one is the Launch Month. **No price is shown on the site**:
the plan is scoped and priced to the work in the reply to each enquiry (the FAQ says so). There is
no trial, no one-off package, and no client cap or spots count anywhere on the site — keep it that way.

## Design rules

- Dark studio look: warm black `#0F0D0B`, cream type, brass accent `#E8B54B`. Tokens live at the top of `ind.css`.
- **Pictures are always shown whole.** Every frame takes the picture's own aspect ratio. Never crop a piece to fit a layout.
- The copy never says "phone photo". Clients send *the pictures or video they already have*; we create original content from it.
- Restraint over interactivity: the browser's own cursor, no spinning 3D marks, no pictures that follow the pointer. Motion is limited to the hero spotlight, the light slider, the reel and gentle reveals.
- No phone number or WhatsApp contact anywhere on the site — contact is email and Instagram only.
- No fake testimonials, no timers, no spots counters.

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
| `ind.css` | All shared styling — tokens, fonts, cursor, hero, strip, slider, cinema, plan, FAQ, footer, work page, form pages |
| `ind.js` | Reveal, hero spotlight, work-strip dragging, light slider, video playback, count-up, magnetic buttons, work-page flips. Desktops with a mouse also load Lenis (smooth scroll) from a CDN; phones load nothing extra |
| `logo.svg`, `logo-light.svg` | The Illume wordmark; the light version is the one the dark site uses |
| `fonts/` | Self-hosted, latin-subset woff2 files for Fraunces (upright and italic), DM Sans and DM Mono |
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

## The film (16:9)

A 16:9 slot sits right under the home hero, and beside the reel on the work page. Until the file
exists it shows "In the edit." over a blurred poster. When the film is ready: save it as
`media/ad.mp4` (H.264, 1920×1080 or 1280×720, ideally under 5 MB) with a 1280×720 still as
`media/ad-poster.webp`, then add `<source src="media/ad.mp4" type="video/mp4">` inside the two
`<video>` tags marked with a comment in `index.html` and `portfolio.html`. It then autoplays
muted in view with a "Sound on" button.

## The reel

`media/reel.mp4` is the Chunk'd cookie reel: 10 s, 720×1280 H.264 with an AAC
audio track, faststart. It autoplays muted in view (browsers require that), and
the "Sound on" button unmutes and restarts it from the top. If a phone refuses
to autoplay, a brass play badge appears over the frame and a tap starts it.


## The enquiry form

`start.html` posts to **formsubmit.co**, which forwards submissions to
`illumeandco.online@gmail.com` and then sends the visitor to `thanks.html`.
There is no server and no database — the form is the whole backend.

If the studio email address ever changes, it has to be updated in two places in
`start.html`: the `<form action="...">` URL and the `mailto:` link below it.

## Contact links

Contact is email (`illumeandco.online@gmail.com`) and Instagram
(`https://www.instagram.com/illumeandco`) only. No phone number or WhatsApp anywhere on the
site — don't add one. The price appears only in the Studio Plan card, the comparison and the
price FAQ on the home page.

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
