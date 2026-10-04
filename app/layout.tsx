import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "./components/LanguageProvider";
import { ToastProvider } from "./components/ui";
import { bootScript } from "./lib/boot-script";
import { siteDescription, siteName, siteUrl } from "./lib/site";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "EasyApply — Free Photo, Signature & PDF Tools for Online Forms",
    template: "%s | EasyApply",
  },
  description: siteDescription,
  applicationName: siteName,
  creator: siteName,
  publisher: siteName,
  category: "utilities",
  referrer: "origin-when-cross-origin",
  keywords: [
    "passport photo resizer",
    "photo resize in kb",
    "signature resizer",
    "compress pdf",
    "merge pdf",
    "sign pdf",
    "images to pdf",
    "image compressor",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    title: "EasyApply — Get your documents ready for online forms",
    description: "Resize photos and signatures to the exact size and KB, and merge, sign or compress PDFs. Free, private, in your browser.",
    type: "website",
    siteName,
    locale: "en_IN",
    url: siteUrl,
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "EasyApply document tools" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EasyApply — Free photo, signature & PDF tools",
    description: "Everything runs in your browser. Nothing is uploaded.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#16161a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl.href}#website`,
        name: siteName,
        url: siteUrl.href,
        description: siteDescription,
        inLanguage: ["en", "hi"],
      },
      {
        "@type": "WebApplication",
        "@id": `${siteUrl.href}#application`,
        name: siteName,
        url: siteUrl.href,
        description: siteDescription,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires a modern browser with JavaScript enabled",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
        featureList: [
          "Passport and exam photo resizing to exact pixels, cm or mm",
          "File size limits in KB (minimum and maximum)",
          "Signature cleanup and resizing",
          "Background removal on the device",
          "Merge, split, reorder and rotate PDF pages",
          "Compress PDFs to a size limit",
          "Sign PDFs by drawing, typing or uploading a signature",
          "Fill in PDFs with text, dates and ticks",
          "Images to PDF and PDF to JPG",
        ],
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
        <LanguageProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
