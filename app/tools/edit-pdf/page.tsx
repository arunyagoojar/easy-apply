import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free PDF Editor — Fill In, Add Text, Dates & Ticks",
  description: "Fill in PDF forms: add text, dates, ticks and crosses, cover mistakes with white-out and place images. Free, private and processed in your browser.",
  path: "/tools/edit-pdf",
});

export default function EditPdfPage() {
  return <PdfWorkspace intent="edit" />;
}
