import { HelpPage } from "../components/HelpPage";
import { createPageMetadata } from "../lib/site";

export const metadata = createPageMetadata({
  title: "Help & Privacy",
  description: "How EasyApply keeps your files on your device, and answers to common questions about photo sizes, KB limits, signing and compressing PDFs.",
  path: "/privacy-faq",
});

export default function HelpRoute() {
  return <HelpPage />;
}
