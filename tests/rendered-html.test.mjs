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
