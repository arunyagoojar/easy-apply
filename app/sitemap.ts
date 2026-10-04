import type { MetadataRoute } from "next";
import { siteUrl } from "./lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    ["/", "weekly", 1],
    ["/tools/passport-photo", "monthly", 0.9],
    ["/tools/signature", "monthly", 0.9],
    ["/tools/image", "monthly", 0.9],
    ["/tools/increase-image-size", "monthly", 0.8],
    ["/tools/pdf", "monthly", 0.9],
    ["/tools/images-to-pdf", "monthly", 0.9],
    ["/tools/compress-pdf", "monthly", 0.9],
    ["/tools/increase-pdf-size", "monthly", 0.8],
    ["/tools/sign-pdf", "monthly", 0.9],
    ["/tools/edit-pdf", "monthly", 0.9],
    ["/privacy-faq", "monthly", 0.6],
  ] as const;

  return pages.map(([path, changeFrequency, priority]) => ({
    url: new URL(path, siteUrl).href,
    changeFrequency,
    priority,
  }));
}
