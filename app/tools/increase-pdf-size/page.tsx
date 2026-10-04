import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Increase PDF Size in KB — Make a PDF Bigger for Online Forms",
  description: "Make a small PDF reach the minimum size a form asks for, such as 40 KB, without changing its pages. Free, private and processed in your browser.",
  path: "/tools/increase-pdf-size",
});

export default function IncreasePdfSizePage() {
  return <PdfWorkspace intent="increase" />;
}
