import { ToolWorkspace } from "../../components/ToolWorkspace";
import { createPageMetadata } from "../../lib/site";
export const metadata = createPageMetadata({ title: "Free PDF Toolkit — Merge, Split & Rotate", description: "Merge PDFs, split pages, rotate documents and convert images to PDF free. Your files are processed locally and never uploaded.", path: "/tools/pdf" });
export default function PdfPage() { return <ToolWorkspace kind="pdf" />; }
