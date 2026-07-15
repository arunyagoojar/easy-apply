"use client";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { SiteHeader } from "./SiteHeader";
const questions = [
  ["Do my files get uploaded anywhere?", "No. EasyApply processes files in your browser on this device. There is no document upload or cloud copy."],
  ["Can I target a file size such as 20 KB?", "Yes. Choose a target size in the tool. For JPEG and WebP, EasyApply adjusts quality to get close to that limit without exceeding it where possible."],
  ["Can a photo or signature be downloaded as a PDF?", "Yes. JPEG, PNG, WebP and PDF are available from the output format menu on the photo and signature pages."],
  ["What does the output summary check?", "It restates the dimensions, format, background and target size you selected. After processing, it also shows the actual output file size."],
  ["Does EasyApply know the rules for my exam or application?", "No. You enter the requirements shown by the portal. EasyApply helps prepare a file to those settings and lets you confirm the result before downloading."],
  ["Which image formats can I open?", "PNG, JPEG and WebP work in modern browsers. HEIC support depends on the browser and device. EasyApply exports JPEG, PNG, WebP and PDF."],
  ["Can I process multiple images?", "Yes. Add multiple files, apply one set of output settings, then download the results together as a ZIP file."],
];
export function FaqPage() { const [open, setOpen] = useState(0); return <div className="site-shell"><SiteHeader /><main className="info-page faq-page container"><div className="directory-heading"><span className="section-kicker">Help centre</span><h1>Questions, answered clearly.</h1><p>What EasyApply does, what it does not do, and what happens to your files.</p></div><div className="large-faq-list">{questions.map(([question, answer], index) => <article className={open === index ? "open" : ""} key={question}><button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{question}</span><ChevronDown size={19} /></button>{open === index && <p>{answer}</p>}</article>)}</div><div className="faq-footer">Still ready to prepare a file? <Link href="/tools">View all tools</Link></div></main></div>; }
