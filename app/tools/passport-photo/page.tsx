import { ImageWorkspace } from "../../components/image/ImageWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free Passport Photo Maker — Resize Photo to cm, Pixels & KB",
  description: "Crop and resize passport and exam photos to the exact size (35 × 45 mm, 2 × 2 in or pixels) and KB limit. Change the background, add name and date. Free and private.",
  path: "/tools/passport-photo",
});

export default function PassportPhotoPage() {
  return <ImageWorkspace initialMode="photo" />;
}
