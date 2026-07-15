import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "./components/LanguageProvider";
import { siteDescription, siteName, siteUrl } from "./lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "EasyApply — Free Passport Photo, Signature & PDF Tools",
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
    "signature resizer",
    "signature compressor",
    "PDF toolkit",
    "image compressor",
    "application photo maker",
    "private document tools",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    title: "EasyApply — Prepare Your Documents in Seconds",
    description: "Resize, compress and convert application documents privately in your browser.",
    type: "website",
    siteName,
    locale: "en_IN",
    url: siteUrl,
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "EasyApply private document preparation workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EasyApply — Prepare Your Documents in Seconds",
    description: "100% local document preparation with complete privacy.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        featureList: ["Passport photo resizing", "Signature preparation", "PDF merge and split", "Image conversion and compression", "Local browser processing"],
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("easyapply-theme")==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}` }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
