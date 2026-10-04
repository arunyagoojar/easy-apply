# EasyApply

Free, private document-preparation tools that run **entirely in your browser**.
Prepare passport photos, signatures, image batches and PDFs for application
portals — without ever uploading a file.

**Live site:** https://easyapply.eu.cc

## Tools

| Tool | What it does |
| --- | --- |
| **Passport Photo** (`/tools/passport-photo`) | Crop to 35:45 (or any custom ratio), resize to exact pixel dimensions, set a background and hit a target file size in KB. Includes on-device **background removal** (AI cut-out, downloaded on first use). |
| **Signature** (`/tools/signature`) | Crop a signature with a wide 4:1 preset, adjust legibility and export as JPEG, PNG, WebP or PDF. |
| **Image Toolkit** (`/tools/image`) | Batch resize, convert and adjust images with one set of settings; download everything as a ZIP. |
| **PDF Toolkit** (`/tools/pdf`) | Merge, split and rotate with a **visual page picker** — real page thumbnails, drag-to-reorder, tick pages to include or skip. Also converts images into a PDF. |
| **Sign PDF** (`/tools/sign-pdf`) | Place your signature on any page of a PDF, drag and resize it into position, export the signed document. |
| **Edit PDF** (`/tools/edit-pdf`) | Simple text-PDF editing: cover anything with a box, retype names/dates/fixes in four standard fonts, position by drag. |

### Privacy model

- Every feature uses browser APIs (`canvas`, `pdf-lib`, `JSZip`) on the device.
- There is no upload step, no account and no analytics on file contents.
- Each tool keeps its own working files in IndexedDB and its settings in
  `localStorage`, so you can close the tab and continue later. Removing files
  (or using **Remove all**) clears that tool's workspace.

### Features

- Direct-manipulation crop box (move, resize, aspect-locked handles) with
  purpose-built presets per tool.
- Output dimensions stay linked to the crop ratio; width/height inputs update
  each other automatically.
- Target file size: quality is tuned automatically for JPEG/WebP, and PNG (or
  any format that cannot reach the target) is gently downscaled until it fits.
- Bilingual UI (English / हिन्दी), dark and light themes, fully responsive.
- Installable as a PWA (`manifest.ts`), SEO-ready metadata, sitemap and robots.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev     # local development server
npm run build   # verify the production build
npm test        # build + render/route assertions
npm run lint    # eslint
```

The site runs on [vinext](https://github.com/cloudflare/vinext) (Next.js-style
App Router on Vite + Cloudflare Workers). `.openai/hosting.json` declares the
optional Cloudflare D1/R2 bindings and `worker/index.ts` is the Worker entry
point; the application itself is static and needs no database.

## Project layout

```
app/
  page.tsx                 landing page
  tools/page.tsx           tools directory
  tools/{passport-photo,signature,image,pdf}/page.tsx
  privacy-faq/page.tsx     privacy + FAQ workspace
  components/
    HomePage.tsx           landing hero
    ToolWorkspace.tsx      shared tool workspace (crop, compress, export)
    SiteHeader.tsx         marketing header
    LanguageProvider.tsx   en/hi context
  lib/site.ts              metadata helpers
worker/index.ts            Cloudflare Worker entry
tests/rendered-html.test.mjs   server-render + shape assertions
```
