import { Hub } from "./components/Hub";
import { createPageMetadata } from "./lib/site";

export const metadata = createPageMetadata({
  title: "Free Photo, Signature & PDF Tools for Online Forms",
  description: "Resize passport photos and signatures to exact pixels, cm and KB, and merge, compress, sign or fill PDFs. Free, private and processed in your browser.",
  path: "/",
});

export default function Home() {
  return <Hub />;
}
