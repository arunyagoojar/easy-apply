import type { Metadata } from "next";

const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const siteUrl = new URL(configuredUrl || "https://easyapply.eu.cc");
export const siteName = "EasyApply";
export const siteDescription = "Free browser-based tools to resize passport photos, prepare signatures, convert images and work with PDFs privately on your device.";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
};

export function createPageMetadata({ title, description, path, noIndex = false }: PageMetadataOptions): Metadata {
  const canonical = new URL(path, siteUrl).href;
  const socialTitle = `${title} | ${siteName}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: socialTitle,
      description,
      url: canonical,
      siteName,
      type: "website",
      locale: "en_IN",
      images: [{ url: "/og.png", width: 1672, height: 941, alt: "EasyApply private document preparation tools" }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: ["/og.png"],
    },
  };
}
