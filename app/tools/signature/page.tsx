import { ImageWorkspace } from "../../components/image/ImageWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free Signature Resizer — Crop, Clean & Compress Signatures to KB",
  description: "Crop your signature from a photo, make the paper white and the ink clear, then resize it to the pixels and KB your form needs. Free and private.",
  path: "/tools/signature",
});

export default function SignaturePage() {
  return <ImageWorkspace initialMode="signature" />;
}
