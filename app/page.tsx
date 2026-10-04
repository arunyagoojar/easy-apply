import { HomePage } from "./components/HomePage";
import { createPageMetadata } from "./lib/site";

export const metadata = createPageMetadata({ title: "Free Passport Photo, Signature & PDF Tools", description: "Resize passport photos, compress signatures, convert images and manage PDFs free in your browser. Files stay private on your device.", path: "/" });

export default function Home() {
  return <HomePage />;
}
