import { ImageWorkspace } from "../../components/image/ImageWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free Image Resizer & Compressor — Resize to KB, Convert JPG, PNG, WebP",
  description: "Resize, crop, compress and convert one image or a whole batch. Set exact pixels or cm, a KB limit and the format. Free, private and processed in your browser.",
  path: "/tools/image",
});

export default function ImageToolPage() {
  return <ImageWorkspace initialMode="any" />;
}
