import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free PDF Merger & Organizer — Merge, Split, Reorder, Rotate",
  description: "Combine PDFs and images, reorder, rotate or delete pages, split into single pages or save pages as JPG. Free, private and processed in your browser.",
  path: "/tools/pdf",
});

export default function PdfToolPage() {
  return <PdfWorkspace intent="organize" />;
}
