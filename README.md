# Illume — website source

The live site: **https://www.illumeandco.online**

This folder is the complete website. It is a plain static site — no build step, no
framework, no dependencies. Open `index.html` in a browser and it works.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home — hero, before/after transformation, how it works, portfolio preview, $250 founding offer, about, FAQ |
| `portfolio.html` | Full portfolio grid |
| `start.html` | Enquiry form ("Start your project") |
| `thanks.html` | Confirmation page the form redirects to after submitting |

## Shared files

| File | What it is |
|---|---|
| `ind.css` | All shared styling — colour tokens, type, buttons, layout, footer |
| `ind.js` | Small scroll-reveal script |
| `logo.svg` | The Illume wordmark used in every header |

## Images

Every image lives in `images/` and is committed here. Nothing loads from an
external host, so the site cannot break because someone else's link expired.

| Folder | Contents |
|---|---|
| `images/before/` | Unedited client phone photos (the "before" side) |
| `images/after/` | Finished Illume creative paired with a "before" |
| `images/work/` | Portfolio pieces |
| `images/promo/` | Promo / social graphics with text on them |

## The enquiry form

`start.html` posts to **formsubmit.co**, which forwards submissions to
`illumeandco.online@gmail.com` and then sends the visitor to `thanks.html`.
There is no server and no database — the form is the whole backend.

If the studio email address ever changes, it has to be updated in two places in
`start.html`: the `<form action="...">` URL and the `mailto:` link below it.

## Editing

Edit the HTML/CSS directly. To preview a change, open the file in a browser.

To publish, commit and push — Vercel is connected to this repository and deploys
`main` automatically.

```bash
git add -A
git commit -m "Describe the change"
git push
```

## Where this is hosted

- **Repository:** https://github.com/stevesdigitalcroissant-star/Illumeandco
- **Vercel project:** `illume-site` (team: Freelance Marketing)
- **Domains:** illumeandco.online, www.illumeandco.online
