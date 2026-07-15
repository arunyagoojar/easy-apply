import { FaqPage } from "../components/FaqPage";
import { createPageMetadata } from "../lib/site";
export const metadata = createPageMetadata({ title: "Document Tool Questions & Answers", description: "Answers about EasyApply photo, signature, image and PDF tools, supported formats, file sizes and local privacy.", path: "/privacy-faq", noIndex: true });
export default function Page() { return <FaqPage />; }
