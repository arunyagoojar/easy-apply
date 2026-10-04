# EasyApply

Free, private tools for getting documents ready for online application forms.
Photos, signatures and PDFs are processed **entirely in your browser**; nothing
is uploaded.

**Live site:** https://easyapply.eu.cc

## What it does

The site opens straight on the tools page. Everything lives in two workspaces:

### Image (`/tools/image`)

Pick what you are preparing: **Photo**, **Signature** or **Any image**.

- Crop on the image with an aspect-locked box. Rotate, flip and straighten.
  Each image in a batch keeps its own crop.
- Exact output size in px, mm, cm or inches with a DPI (written into the file).
  Presets: passport 35 × 45 mm, US 2 × 2 in, bank exams (IBPS/SBI), stamp size.
- File-size range in KB: quality is tuned to stay **under the maximum**, and
  files **below the minimum** are raised in quality, then padded with harmless
  metadata. Fixed pixel dimensions are never changed to hit a size.
- JPG, PNG, WebP or PDF output. Unchanged images are returned byte for byte.
- Photo: on-device background removal and replacement, name & date caption,
  face guide, print sheets (4 × 6 in JPG, A4 PDF).
- Signature: adaptive clean-up (white paper, dark ink, works with shadows),
  ink colour, transparent PNG.
- Brightness, contrast, saturation and black & white (pixel-exact, works in Safari).

Entry points: `/tools/passport-photo`, `/tools/signature`, `/tools/image`,
`/tools/increase-image-size`.

### PDF (`/tools/pdf`)

- Add PDFs and images (phone photos are turned upright); every page shows as a
  thumbnail.
- Reorder by drag and drop (grip handle on touch screens, Alt + arrows on the
  keyboard), rotate, delete with undo, select pages.
- Click a page to **sign or fill it in**: drawn, typed or uploaded signatures,
  text (any language), dates, ticks, crosses, white-out and images. Works on
  rotated pages.
- Download as one PDF, as single-page PDFs, or as JPG images.
- File size: keep as is, **smaller file** (re-compresses photos inside, text stays
  sharp), or **a size range** (e.g. 40–200 KB): too big is compressed, too
  small is padded with XMP metadata so the pages are unchanged.
- Password-protected PDFs open after asking for the password; their pages are
  saved as images.

Entry points: `/tools/pdf`, `/tools/images-to-pdf`, `/tools/compress-pdf`,
`/tools/increase-pdf-size`, `/tools/sign-pdf`, `/tools/edit-pdf`.

### Privacy

- Files are kept in memory only, never in browser storage, and are gone when
  the tab is closed. Only size and format preferences are remembered.
- No upload step, no account, no analytics on file contents.
- Background removal downloads its AI model (about 40 MB) from IMG.LY's CDN on
  first use; the photo itself is never sent.

English and Hindi, light and dark themes (follows the system), fully responsive.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (copies pdf.js assets into public/pdfjs)
npm test           # build + unit and server-render tests
npm run test:unit  # byte, geometry and unit-conversion tests only
npm run test:e2e   # Playwright end-to-end tests (uses the dev server)
npm run lint
npm run typecheck
```

The site runs on [vinext](https://github.com/cloudflare/vinext) (Next.js App
Router on Vite and Cloudflare Workers). `worker/index.ts` is the Worker entry
point; the app itself is static and needs no database.

## Project layout

```
app/
  page.tsx                     tools page (/)
  tools/*/page.tsx             entry points for the two workspaces
  privacy-faq/page.tsx         help & privacy
  components/
    Hub.tsx, AppHeader.tsx, HelpPage.tsx, ui.tsx
    image/                     image workspace (stage, settings, result)
    pdf/                       PDF workspace (page grid, page editor, signatures)
  lib/
    bytes.ts                   JPEG/PNG DPI, padding, EXIF (pure, unit-tested)
    geometry.ts                crop and page-rotation maths (pure, unit-tested)
    image/                     decode, render, encode, presets, print sheets
    pdf/                       pdf.js loading, export, compression, padding
    messages.ts                all interface copy (English + Hindi)
tests/                         node:test unit and server-render tests
e2e/                           Playwright tests that check the downloaded files
```

## Licences

`@imgly/background-removal` (used for photo background removal) is licensed
under the AGPL-3.0. The typed-signature fonts (Dancing Script, Great Vibes,
Caveat) are under the SIL Open Font License.
