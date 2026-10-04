// Server-render checks against the production build (run `npm run build` first).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
const built = existsSync(workerUrl);

async function render(pathname = "/") {
  const url = new URL(workerUrl);
  url.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const options = { skip: built ? false : "run `npm run build` first" };

test("server-renders the tools page at /", options, async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Free Photo, Signature &amp; PDF Tools for Online Forms \| EasyApply<\/title>/i);
  assert.match(html, /<meta name="description"/i);
  assert.match(html, /Get your documents ready for online forms/);
  for (const href of ["/tools/passport-photo", "/tools/signature", "/tools/image", "/tools/images-to-pdf", "/tools/pdf", "/tools/compress-pdf", "/tools/sign-pdf", "/tools/edit-pdf"]) {
    assert.match(html, new RegExp(`href="${href}"`), `links to ${href}`);
  }
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  assert.ok(jsonLd);
  const structuredData = JSON.parse(jsonLd[1]);
  assert.equal(structuredData["@context"], "https://schema.org");
  assert.ok(Array.isArray(structuredData["@graph"]));
});

test("applies the saved or system theme before the first paint", options, async () => {
  const html = await (await render("/")).text();
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /easyapply-theme/);
});

test("renders every tool route with its own title", options, async () => {
  const routes = [
    ["/tools/passport-photo", /Passport Photo Maker/i],
    ["/tools/signature", /Signature Resizer/i],
    ["/tools/image", /Image Resizer &amp; Compressor/i],
    ["/tools/increase-image-size", /Increase Image Size in KB/i],
    ["/tools/pdf", /PDF Merger &amp; Organizer/i],
    ["/tools/images-to-pdf", /Images to PDF Converter/i],
    ["/tools/compress-pdf", /PDF Compressor/i],
    ["/tools/increase-pdf-size", /Increase PDF Size in KB/i],
    ["/tools/sign-pdf", /PDF Signature Tool/i],
    ["/tools/edit-pdf", /PDF Editor/i],
  ];
  for (const [pathname, title] of routes) {
    const response = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
    const html = await response.text();
    assert.match(html, new RegExp(`<title>[^<]*${title.source}`, "i"), `${pathname} title`);
    assert.match(html, new RegExp(`<link rel="canonical" href="[^"]*${pathname}"`), `${pathname} canonical`);
  }
});

test("sends the old directory and legacy pages to their new homes", options, async () => {
  const tools = await render("/tools");
  assert.ok([307, 308].includes(tools.status), "/tools redirects");
  assert.match(tools.headers.get("location") ?? "", /^(https?:\/\/[^/]+)?\/$/);
  for (const pathname of ["/privacy", "/faq"]) {
    const response = await render(pathname);
    assert.ok([307, 308].includes(response.status), `${pathname} should redirect`);
    assert.match(response.headers.get("location") ?? "", /\/privacy-faq$/);
  }
});

test("renders the help and privacy page", options, async () => {
  const response = await render("/privacy-faq");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Help &amp; Privacy \| EasyApply/i);
  assert.match(html, /Processed on your device/);
  assert.match(html, /github\.com\/arunyagoojar\/easy-apply/);
});

test("publishes a sitemap covering every public page", options, async () => {
  const response = await render("/sitemap.xml");
  assert.equal(response.status, 200);
  const xml = await response.text();
  for (const path of ["/", "/tools/passport-photo", "/tools/signature", "/tools/image", "/tools/increase-image-size", "/tools/pdf", "/tools/images-to-pdf", "/tools/compress-pdf", "/tools/increase-pdf-size", "/tools/sign-pdf", "/tools/edit-pdf", "/privacy-faq"]) {
    assert.match(xml, new RegExp(`<loc>[^<]*${path.replace(/\//g, "\\/")}<\\/loc>`), `sitemap should include ${path}`);
  }
  assert.doesNotMatch(xml, /\/tools<\/loc>/, "the redirect is not listed");
});

test("publishes robots.txt pointing at the sitemap", options, async () => {
  const response = await render("/robots.txt");
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /User-agent: \*/i);
  assert.match(body, /Sitemap: .*sitemap\.xml/i);
});

test("serves the PWA manifest", options, async () => {
  const response = await render("/manifest.webmanifest");
  assert.equal(response.status, 200);
  const manifest = JSON.parse(await response.text());
  assert.equal(manifest.name, "EasyApply — Private Document Tools");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test("returns a 404 page for unknown routes", options, async () => {
  const response = await render("/this-route-does-not-exist");
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Page not found/);
});
