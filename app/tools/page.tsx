import Link from "next/link";
import { ArrowRight, FileImage, FilePen, FileSignature, Files, Image as ImageIcon, PenLine, ShieldCheck } from "lucide-react";
import { SiteHeader } from "../components/SiteHeader";
import { createPageMetadata } from "../lib/site";

export const metadata = createPageMetadata({ title: "All Tools — Photo, Signature, Image & PDF", description: "Browse every EasyApply tool: passport photo resizer, signature preparer, image converter, PDF toolkit, PDF signer and PDF text editor. All of them run locally in your browser.", path: "/tools" });

const tools = [
  {
    href: "/tools/passport-photo",
    icon: FileImage,
    title: "Passport Photo",
    description: "Crop, resize and compress a photo to the exact dimensions, format and file size an application portal asks for.",
    features: ["35:45 and custom crop shapes", "Exact pixel dimensions", "Target file size in KB", "White or custom background"],
  },
  {
    href: "/tools/signature",
    icon: FileSignature,
    title: "Signature",
    description: "Crop a signature from any image, clean it up and export it in the format and size your form requires.",
    features: ["Wide 4:1 crop preset", "Brightness and contrast controls", "JPEG, PNG, WebP or PDF output", "Target file size in KB"],
  },
  {
    href: "/tools/image",
    icon: ImageIcon,
    title: "Image Toolkit",
    description: "Resize, convert and adjust one image or a whole batch with the same output settings, then download them together.",
    features: ["Batch processing with ZIP download", "JPEG, PNG and WebP conversion", "Resize with crop-ratio linking", "Brightness, contrast and saturation"],
  },
  {
    href: "/tools/pdf",
    icon: Files,
    title: "PDF Toolkit",
    description: "Merge PDFs, split a document into single pages, rotate pages or turn images into a PDF without uploading anything.",
    features: ["Merge in upload order", "Split into one file per page", "Rotate all pages 90°", "Images to PDF converter"],
  },
  {
    href: "/tools/sign-pdf",
    icon: PenLine,
    title: "Sign PDF",
    description: "Place your signature on any page of a PDF, drag it into position and download the signed document.",
    features: ["Choose the exact page", "Drag and resize placement", "Transparent PNG signatures", "Nothing leaves your device"],
  },
  {
    href: "/tools/edit-pdf",
    icon: FilePen,
    title: "Edit PDF",
    description: "Fix simple text PDFs: cover anything and retype names, dates or typos directly in your browser.",
    features: ["White-out and cover boxes", "Retype text in four fonts", "Size and colour controls", "Multi-page editing"],
  },
];

export default function ToolsDirectoryPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="directory-page container">
        <div className="directory-heading">
          <span className="section-kicker">EasyApply tools</span>
          <h1>Every tool, one place.</h1>
          <p>Pick the workspace you need. Each tool keeps its own files and settings on this device, and nothing is ever uploaded.</p>
        </div>
        <div className="directory-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link className="directory-card" href={tool.href} key={tool.href}>
                <div className="card-top">
                  <span className="tool-icon"><Icon size={22} /></span>
                  <ArrowRight size={18} style={{ color: "var(--muted-2)" }} />
                </div>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
                <ul>{tool.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <span className="card-link">Open tool <ArrowRight size={14} /></span>
              </Link>
            );
          })}
        </div>
        <div className="directory-privacy">
          <ShieldCheck size={20} />
          <span><b>Private by design.</b> Every tool processes files locally with browser APIs. There is no upload step and no account.</span>
          <Link href="/privacy-faq">How it works</Link>
        </div>
      </main>
    </div>
  );
}
