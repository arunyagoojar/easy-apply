"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, EyeOff, FileCheck2, HardDrive, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { SiteHeader } from "./SiteHeader";
import { useLanguage } from "./LanguageProvider";

export function PrivacyFaqPage() {
  const { language } = useLanguage();
  const hi = language === "hi";
  const privacy = hi
    ? [[HardDrive, "लोकल प्रोसेसिंग", "क्रॉपिंग, कम्प्रेशन और कन्वर्ज़न इसी ब्राउज़र में होते हैं।"], [EyeOff, "फ़ाइल की जाँच नहीं", "EasyApply आपकी फ़ाइलों का विश्लेषण या क्लाउड रिकॉर्ड नहीं बनाता।"], [Trash2, "कुछ भी सेव नहीं", "टैब बंद करते ही वर्तमान कार्य सत्र समाप्त हो जाता है।"]]
    : [[HardDrive, "Processed locally", "Cropping, compression and conversion happen inside this browser."], [EyeOff, "Nothing is inspected", "EasyApply does not analyse your files or create a cloud record."], [Trash2, "Nothing is retained", "Close the tab and the current working session is gone."]];
  const faqs = hi
    ? [["क्या EasyApply मेरे आवेदन की आवश्यकताएँ जानता है?", "नहीं। पोर्टल पर दिए गए आयाम, फ़ॉर्मेट और आकार आप चुनते हैं।"], ["क्या मैं सटीक फ़ाइल आकार चुन सकता हूँ?", "हाँ। EasyApply चुनी हुई सीमा के करीब पहुँचने के लिए गुणवत्ता समायोजित करता है।"], ["क्या फोटो और हस्ताक्षर PDF में मिल सकते हैं?", "हाँ। आउटपुट फ़ॉर्मेट में PDF चुनें।"], ["क्या कई फ़ाइलें एक साथ प्रोसेस हो सकती हैं?", "हाँ। समान सेटिंग लागू करें और परिणाम ZIP में डाउनलोड करें।"]]
    : [["Does EasyApply know my application requirements?", "No. You choose the dimensions, format and size shown by the application portal."], ["Can I target an exact file size?", "Yes. EasyApply adjusts quality to get close to the selected limit where possible."], ["Can I export photos and signatures as PDF?", "Yes. Choose PDF from the output-format menu."], ["Can I process several files?", "Yes. Apply the same settings and download the results together as a ZIP."]];

  return <div className="site-shell privacy-faq-page"><SiteHeader /><main className="container privacy-faq-main"><div className="privacy-faq-hero"><span className="tool-icon"><ShieldCheck size={23} /></span><span className="section-kicker">{hi ? "गोपनीयता और सामान्य प्रश्न" : "Privacy & frequently asked questions"}</span><h1>{hi ? "जानें कि EasyApply कैसे काम करता है।" : "Know exactly how EasyApply works."}</h1><p>{hi ? "आपके दस्तावेज़ आपके डिवाइस पर रहते हैं और हर आउटपुट सेटिंग आपके नियंत्रण में रहती है।" : "Your documents stay on your device, and every output setting remains under your control."}</p></div><div className="privacy-faq-grid"><section><h2>{hi ? "सरल भाषा में गोपनीयता" : "Privacy, in plain language"}</h2><div className="privacy-faq-cards">{privacy.map(([Icon, title, text]) => { const ItemIcon = Icon as typeof HardDrive; return <article key={title as string}><ItemIcon size={20} /><div><b>{title as string}</b><p>{text as string}</p></div></article>; })}</div><div className="panel-local-note"><Lock size={17} /><span><b>{hi ? "कोई अपलोड नहीं।" : "No upload step."}</b> {hi ? "फ़ाइलें इस डिवाइस से बाहर नहीं जातीं।" : "Your files never leave this device."}</span></div></section><section><h2>{hi ? "सामान्य प्रश्न" : "Common questions"}</h2><div className="privacy-faq-cards faq-cards">{faqs.map(([question, answer]) => <article key={question}><FileCheck2 size={19} /><div><b>{question}</b><p>{answer}</p></div></article>)}</div></section></div><div className="privacy-faq-footer"><span><CheckCircle2 size={17} /> {hi ? "अकाउंट की आवश्यकता नहीं" : "No account required"}</span><Link className="button button-primary" href="/tools/passport-photo">{hi ? "तैयारी शुरू करें" : "Start preparing"} <ArrowRight size={16} /></Link></div></main></div>;
}
