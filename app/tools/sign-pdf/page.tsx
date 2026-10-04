import { ToolWorkspace } from "../../components/ToolWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({ title: "Free PDF Signature Tool — Sign PDFs Online", description: "Place your signature on any page of a PDF, drag it into position and download the signed document. Free, private and processed entirely in your browser.", path: "/tools/sign-pdf" });

export default function SignPdfPage() {
  return <ToolWorkspace kind="sign" />;
}
