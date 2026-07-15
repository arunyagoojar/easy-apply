import { ToolWorkspace } from "../../components/ToolWorkspace";
import { createPageMetadata } from "../../lib/site";
export const metadata = createPageMetadata({ title: "Free Image Resizer, Compressor & Converter", description: "Resize, compress, crop and convert JPEG, PNG and WebP images in batches. Fast, free and private browser-based processing.", path: "/tools/image" });
export default function ImageToolsPage() { return <ToolWorkspace kind="image" />; }
