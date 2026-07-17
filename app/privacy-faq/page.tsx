import { ToolWorkspace } from "../components/ToolWorkspace";
import { createPageMetadata } from "../lib/site";

export const metadata = createPageMetadata({ title: "Privacy & Frequently Asked Questions", description: "Learn how EasyApply processes files locally, protects your privacy and prepares photos, signatures, images and PDFs.", path: "/privacy-faq" });

export default function Page() { return <ToolWorkspace kind="faq" />; }
