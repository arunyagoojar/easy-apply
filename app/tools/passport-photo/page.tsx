import { ToolWorkspace } from "../../components/ToolWorkspace";
import { createPageMetadata } from "../../lib/site";
export const metadata = createPageMetadata({ title: "Free Passport Photo Resizer & Compressor", description: "Crop, resize and compress passport or application photos to exact dimensions and file sizes. Free, private and processed locally.", path: "/tools/passport-photo" });
export default function PassportPhotoPage() { return <ToolWorkspace kind="passport" />; }
