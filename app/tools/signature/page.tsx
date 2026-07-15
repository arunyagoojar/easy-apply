import { ToolWorkspace } from "../../components/ToolWorkspace";
import { createPageMetadata } from "../../lib/site";
export const metadata = createPageMetadata({ title: "Free Signature Resizer & Compressor", description: "Trim, resize, compress and convert signature images for online applications. Export as JPEG, PNG, WebP or PDF privately.", path: "/tools/signature" });
export default function SignaturePage() { return <ToolWorkspace kind="signature" />; }
