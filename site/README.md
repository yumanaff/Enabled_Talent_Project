# Ease website

A one-page website for Ease, ready for GitHub Pages. Plain HTML, CSS and JavaScript, no build step for the page itself.

## What is on the page
1. **The 3D story** (`story.js`, Three.js). A noisy web page comes apart into its layers while you scroll, like a video.
   The dock buttons turn layers off. At the end, a calm page comes forward.
2. **The live demo** (`demo/`). The **real extension popup** sits next to a noisy sample news website.
   Both run the real extension code, with nothing to install. `site.js` keeps the one settings store they share.
3. **The AI helpers**: Explain simply, Show me how and Time limits, on the same demo website.
4. Who it's for, privacy, caregivers, questions.

## Calm this site
The site practises what it preaches. "Calm this site" (top right) stops all 3D movement, animation and smooth scrolling.
It is on by itself when the computer asks for reduced motion. The story then becomes a still page that is easy to read.
All text is real HTML, not drawn in the 3D scene, so screen readers and "Bigger text" work.

## Files
- `index.html`, `style.css`, `site.js` (Calm this site, demo panel, helpers)
- `story.js` – the 3D story, **built** from `src/story.js` with Three.js 0.169.0 (MIT) inside.
  It is one ordinary script, so the site also works when `index.html` is opened straight from a file.
- `demo/sample.html` – the noisy sample website
- `demo/shim.js` – a small stand-in for Chrome's extension API. Settings live in memory only.
  The page and the demo website talk with messages. "Explain simply" plays a recorded example when the
  browser has no built-in AI.
- `demo/ext/` – a copy of the extension code. **Do not edit it.**
- `llms.txt`, `robots.txt`, `sitemap.xml` – for search engines and AI assistants

## Build (only after changing `src/story.js` or the extension)
```
cd site
npm install
npm run build
```
This bundles the 3D story into `story.js` and copies the extension code into `demo/ext/`.
Both results are committed, so the site works without building.

## Without the 3D
The page is complete without the 3D: all text and buttons are plain HTML.
`story.js` adds the class `story-on` only when the 3D is ready and motion is allowed.

## Change the name
The name is not final. Change `NAME` at the top of `site.js`. The page text, title and `llms.txt` also say "Ease".

## Download
`downloads/ease-extension.zip` is the extension folder, zipped. After changing the extension, make it again:
```
cd extension
zip -r ../site/downloads/ease-extension.zip . -x "*.DS_Store"
```
Also update the version number on the Download button in `index.html`.
When Ease is on the Chrome Web Store, point the Download buttons to the store instead.

## Before launch
1. Replace `EASE-SITE-URL` and `EASE-GITHUB-URL` in all files with the real addresses.
2. Replace the GitHub link with the Chrome Web Store link when it is live.

## Publish with GitHub Pages
GitHub Pages can only publish the repository root or `/docs` from a branch, and `/docs` holds our documentation.
So we publish `/site` with a GitHub Action: Repository → Settings → Pages → Source: "GitHub Actions",
then add a small workflow that uploads the `site` folder (`actions/upload-pages-artifact` with `path: site`,
then `actions/deploy-pages`).
