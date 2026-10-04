import { ImageWorkspace } from "../../components/image/ImageWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Increase Image Size in KB — Make a Photo or Signature Bigger",
  description: "Make a small JPG or PNG reach the minimum file size a form asks for, such as 20 KB or 40 KB, without changing the picture. Free and private.",
  path: "/tools/increase-image-size",
});

export default function IncreaseImageSizePage() {
  return <ImageWorkspace initialMode="any" />;
}
