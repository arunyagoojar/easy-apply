import { ToolWorkspace } from "../components/ToolWorkspace";
import { createPageMetadata } from "../lib/site";

export const metadata = createPageMetadata({ title: "Online Document Preparation Tools", description: "Choose a free EasyApply tool for passport photos, signatures, PDFs or images. Processing happens privately in your browser.", path: "/tools/passport-photo", noIndex: true });

export default function ToolsPage() {
  return <ToolWorkspace kind="passport" />;
}
