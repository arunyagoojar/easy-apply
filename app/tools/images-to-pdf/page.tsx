import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free Images to PDF Converter — JPG, PNG & Phone Photos to PDF",
  description: "Turn photos and scans into one PDF on A4, Letter or fitted pages. Reorder and rotate pages first. Free, private and processed in your browser.",
  path: "/tools/images-to-pdf",
});

export default function ImagesToPdfPage() {
  return <PdfWorkspace intent="images" />;
}
