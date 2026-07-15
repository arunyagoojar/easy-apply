import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EasyApply — Private Document Tools",
    short_name: "EasyApply",
    description: "Prepare passport photos, signatures, images and PDFs privately in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b0d",
    theme_color: "#111316",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
