import { ToolWorkspace } from "../../components/ToolWorkspace";
import { createPageMetadata } from "../../lib/site";

export const metadata = createPageMetadata({ title: "Free PDF Text Editor — Cover & Retype", description: "Edit simple text PDFs in your browser: cover anything, retype names, dates and fixes, then download. Free, private and processed locally.", path: "/tools/edit-pdf" });

export default function EditPdfPage() {
  return <ToolWorkspace kind="edit" />;
}
