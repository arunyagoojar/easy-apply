import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished EasyApply landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Free Passport Photo, Signature &amp; PDF Tools \| EasyApply<\/title>/i);
  assert.match(html, /<meta name="description"/i);
  assert.match(html, /EasyApply/);
  assert.match(html, /Prepare your documents/);

  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  assert.ok(jsonLd);
  const structuredData = JSON.parse(jsonLd[1]);
  assert.equal(structuredData["@context"], "https://schema.org");
  assert.ok(Array.isArray(structuredData["@graph"]));
});

test("ships real crop selection and linked output controls", async () => {
  const workspace = await readFile(new URL("../app/components/ToolWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /type CropRect/);
  assert.match(workspace, /data-crop-handle/);
  assert.match(workspace, /Free selection — any shape/);
  assert.match(workspace, /Custom shape/);
  assert.match(workspace, /Output dimensions always follow the crop selection/);
  assert.doesNotMatch(workspace, /autoTrim|ratioLocked|detectSignatureBounds/);
});

test("keeps a separate device-local workspace for every tool", async () => {
  const workspace = await readFile(new URL("../app/components/ToolWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /<ToolWorkspaceInner key=\{kind\} kind=\{kind\}/);
  assert.match(workspace, /const WORKSPACE_DATABASE = "easyapply-workspaces"/);
  assert.match(workspace, /indexedDB\.open\(WORKSPACE_DATABASE/);
  assert.match(workspace, /easyapply-workspace-settings-v1-/);
  assert.match(workspace, /inputs: files\.map/);
  assert.match(workspace, /outputs: prepared\.map/);
  assert.match(workspace, /deleteStoredWorkspace\(kind\)/);
});

test("uses purpose-specific default crop shapes", async () => {
  const workspace = await readFile(new URL("../app/components/ToolWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /kind === "passport" \? "passport" : kind === "signature" \? "signature" : "free"/);
  assert.match(workspace, /const defaultRatio = cropRatios\[defaultCropAspect\]/);
  assert.match(workspace, /setCropAspect\(defaultCropAspect\)/);
});

test("guards numeric inputs against invalid values", async () => {
  const workspace = await readFile(new URL("../app/components/ToolWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /function toSafeInteger/);
  assert.match(workspace, /Number\.isFinite/);
  assert.match(workspace, /changeWidth\(Number\(event\.target\.value\)\)/);
});

test("enforces the target file size for every raster format", async () => {
  const workspace = await readFile(new URL("../app/components/ToolWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /gently step the size down until the file fits/);
  assert.match(workspace, /Math\.sqrt\(target \/ blob\.size\)/);
  assert.match(workspace, /supportsWebpEncoding/);
  assert.match(workspace, /webp-unsupported/);
});

test("renders every tool workspace route", async () => {
  const routes = [
    ["/tools/passport-photo", /Passport Photo Resizer/i],
    ["/tools/signature", /Signature Resizer/i],
    ["/tools/pdf", /PDF Toolkit/i],
    ["/tools/image", /Image Resizer/i],
    ["/tools/sign-pdf", /PDF Signature Tool/i],
    ["/tools/edit-pdf", /PDF Text Editor/i],
  ];
  for (const [pathname, title] of routes) {
    const response = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
    const html = await response.text();
    assert.match(html, title, `${pathname} should have its title`);
    assert.match(html, /EasyApply/);
  }
});

test("renders the tools directory page", async () => {
  const response = await render("/tools");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>All Tools/i);
  assert.match(html, /tools\/passport-photo/);
  assert.match(html, /tools\/signature/);
  assert.match(html, /tools\/pdf/);
  assert.match(html, /tools\/image/);
});

test("renders the privacy and FAQ workspace", async () => {
  const response = await render("/privacy-faq");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Privacy &amp; Frequently Asked Questions/i);
  assert.match(html, /Processed locally/);
});

test("redirects legacy privacy and faq routes to privacy-faq", async () => {
  for (const pathname of ["/privacy", "/faq"]) {
    const response = await render(pathname);
    assert.ok([307, 308].includes(response.status), `${pathname} should redirect`);
    assert.match(response.headers.get("location") ?? "", /\/privacy-faq$/);
  }
});

test("publishes a sitemap covering every public page", async () => {
  const response = await render("/sitemap.xml");
  assert.equal(response.status, 200);
  const xml = await response.text();
  for (const path of ["/", "/tools", "/tools/passport-photo", "/tools/signature", "/tools/pdf", "/tools/image", "/tools/sign-pdf", "/tools/edit-pdf", "/privacy-faq"]) {
    assert.match(xml, new RegExp(`<loc>[^<]*${path.replace(/\//g, "\\/")}<\\/loc>`), `sitemap should include ${path}`);
  }
});

test("publishes robots.txt pointing at the sitemap", async () => {
  const response = await render("/robots.txt");
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /User-agent: \*/i);
  assert.match(body, /Sitemap: .*sitemap\.xml/i);
});

test("serves the PWA manifest", async () => {
  const response = await render("/manifest.webmanifest");
  assert.equal(response.status, 200);
  const manifest = JSON.parse(await response.text());
  assert.equal(manifest.name, "EasyApply — Private Document Tools");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test("returns a styled 404 for unknown routes", async () => {
  const response = await render("/this-route-does-not-exist");
  assert.equal(response.status, 404);
});
