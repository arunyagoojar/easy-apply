import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({
  title: "Free PDF Signature Tool — Sign PDFs Online",
  description: "Draw, type or upload your signature and place it on any page of a PDF, then download the signed document. Free, private and processed entirely in your browser.",
  path: "/tools/sign-pdf",
});

export default function SignPdfPage() {
  return <PdfWorkspace intent="sign" />;
}
