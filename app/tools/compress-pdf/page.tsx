import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free PDF Compressor — Reduce PDF Size to KB",
  description: "Make a PDF smaller while keeping text sharp, or get it under a size limit such as 200 KB or 1 MB. Free, private and processed in your browser.",
  path: "/tools/compress-pdf",
});

export default function CompressPdfPage() {
  return <PdfWorkspace intent="compress" />;
}
