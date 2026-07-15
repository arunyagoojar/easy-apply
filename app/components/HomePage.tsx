"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Check, CheckCircle2, EyeOff, FileCheck2, HardDrive, Lock, ShieldCheck, Trash2, X, Zap } from "lucide-react";
import { useState } from "react";
import { SiteHeader } from "./SiteHeader";
import { useLanguage } from "./LanguageProvider";

export function HomePage() {
  const [learnMore, setLearnMore] = useState(false);
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const { language } = useLanguage();
  const hi = language === "hi";
  const previewItems = hi ? ["19.8 KB फ़ाइल आकार", "JPEG फ़ॉर्मेट", "300 × 300 पिक्सेल", "सफेद बैकग्राउंड"] : ["19.8 KB file size", "JPEG format", "300 × 300 pixels", "White background"];
  const privacyItems = hi ? [[HardDrive, "लोकल प्रोसेसिंग", "क्रॉपिंग, कम्प्रेशन और कन्वर्ज़न इसी ब्राउज़र में होते हैं।"], [EyeOff, "फ़ाइल की जाँच नहीं", "EasyApply आपकी फ़ाइलों का विश्लेषण, ट्रैकिंग या क्लाउड रिकॉर्ड नहीं बनाता।"], [Trash2, "कुछ भी सेव नहीं", "काम पूरा होने पर टैब बंद करें और यह सत्र समाप्त हो जाएगा।"]] : [[HardDrive, "Processed locally", "Cropping, compression and conversion happen inside this browser."], [EyeOff, "Nothing is inspected", "EasyApply does not analyse, track or create a cloud record of your files."], [Trash2, "Nothing is retained", "Close the tab when finished and the working session is gone."]];
  const beginStart = () => { if (starting) return; setStarting(true); window.setTimeout(() => router.push("/tools/passport-photo"), 360); };
  const openLearnMore = () => {
    if (window.matchMedia("(max-width: 840px)").matches) router.push("/privacy-faq");
    else setLearnMore(true);
  };

  return (
    <div className="site-shell home-only-shell">
      <SiteHeader onPrivacyFaq={openLearnMore} />
      <main className="landing-main">
        <section className="hero container home-hero single-screen-hero">
          <div className="hero-copy">
            <motion.div className="eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><span className="pulse-dot" /> {hi ? "गोपनीयता पहले · हर आवेदन के लिए" : "Private by design · Built for applications"}</motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>{hi ? "अपने दस्तावेज़ तैयार करें" : "Prepare your documents"} <span>{hi ? "कुछ ही सेकंड में।" : "in seconds."}</span></motion.h1>
            <motion.p className="hero-subtitle" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>{hi ? "फोटो, हस्ताक्षर और PDF को सीधे अपने ब्राउज़र में रिसाइज़, कम्प्रेस और कन्वर्ट करें। कोई अपलोड नहीं। कोई इंतज़ार नहीं। पूरी गोपनीयता।" : "Resize, compress, convert and optimize photos, signatures and PDFs directly inside your browser. No uploads. No waiting. Complete privacy."}</motion.p>
            <motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
              <button className="button button-primary" onClick={beginStart}>{hi ? "तैयारी शुरू करें" : "Start preparing"} <ArrowRight size={17} /></button>
              <button className="button button-secondary" onClick={openLearnMore}>{hi ? "और जानें" : "Learn more"}</button>
            </motion.div>
            <div className="trust-row"><span><Lock size={15} /> {hi ? "100% लोकल प्रोसेसिंग" : "100% local processing"}</span><span><Zap size={15} /> {hi ? "तुरंत कन्वर्ज़न" : "Instant conversion"}</span><span><ShieldCheck size={15} /> {hi ? "गोपनीयता पहले" : "Privacy first"}</span></div>
          </div>

          <motion.div className="hero-visual" initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .5 }}>
            <div className="visual-glow" />
            <div className="visual-window concise-window">
              <div className="window-bar"><div className="window-dots"><span /><span /><span /></div><span className="window-title"><Lock size={11} /> {hi ? "लोकल प्रोसेसिंग" : "Processed locally"}</span><span className="status-pill">{hi ? "तैयार" : "Ready"}</span></div>
              <div className="concise-preview">
                <div className="passport-card"><div className="face-placeholder"><span className="face-head" /><span className="face-body" /></div><span>300 × 300 px</span></div>
                <div className="concise-checks">
                  <span><BadgeCheck size={19} /> {hi ? "आउटपुट सही है" : "Output matches"}</span>
                  {previewItems.map((item) => <div key={item}><CheckCircle2 size={16} />{item}</div>)}
                  <span className="ready-bar"><Check size={14} /> {hi ? "डाउनलोड के लिए तैयार" : "Ready to download"}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <AnimatePresence>{learnMore && <motion.div className="landing-modal-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setLearnMore(false)}><motion.div className="landing-modal homepage-info-panel" role="dialog" aria-modal="true" aria-labelledby="learn-more-title" initial={{ opacity: 0, y: 24, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .98 }} transition={{ duration: .22 }} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setLearnMore(false)} aria-label="Close"><X size={18} /></button><div className="info-panel-heading"><span className="tool-icon"><ShieldCheck size={23} /></span><div><span className="section-kicker">{hi ? "गोपनीयता और सामान्य प्रश्न" : "Privacy & frequently asked questions"}</span><h2 id="learn-more-title">{hi ? "जानें कि EasyApply कैसे काम करता है।" : "Know exactly how EasyApply works."}</h2><p>{hi ? "आपके दस्तावेज़ आपके डिवाइस पर रहते हैं और हर आउटपुट सेटिंग आपके नियंत्रण में रहती है।" : "Your documents stay on your device, and you remain in control of every output setting."}</p></div></div><div className="info-panel-columns"><section className="panel-privacy"><h3>{hi ? "सरल भाषा में गोपनीयता" : "Privacy, in plain language"}</h3><div className="panel-privacy-list">{privacyItems.map(([Icon, title, text]) => { const PrivacyIcon = Icon as typeof HardDrive; return <article key={title as string}><PrivacyIcon size={19} /><div><b>{title as string}</b><p>{text as string}</p></div></article>; })}</div><div className="panel-local-note"><Lock size={17} /><span><b>{hi ? "कोई अपलोड नहीं।" : "No upload step."}</b> {hi ? "आपकी फ़ाइलें इस डिवाइस से बाहर नहीं जातीं।" : "Your files never leave this device."}</span></div></section><section className="panel-faq"><h3>{hi ? "सामान्य प्रश्न" : "Common questions"}</h3><div className="panel-faq-list"><article><FileCheck2 size={18} /><div><b>{hi ? "क्या EasyApply मेरे आवेदन की आवश्यकताएँ जानता है?" : "Does EasyApply know my application requirements?"}</b><p>{hi ? "नहीं। पोर्टल पर दिए गए आयाम, फ़ॉर्मेट और आकार आप चुनते हैं।" : "No. You enter the dimensions, format and size shown by the portal. EasyApply prepares the file to your selected settings."}</p></div></article><article><FileCheck2 size={18} /><div><b>{hi ? "क्या मैं सटीक फ़ाइल आकार चुन सकता हूँ?" : "Can I target an exact file size?"}</b><p>{hi ? "हाँ। JPEG और WebP की गुणवत्ता चुनी गई सीमा के करीब पहुँचने के लिए समायोजित होती है।" : "Yes. JPEG and WebP quality is adjusted to get close to the chosen limit without exceeding it where possible."}</p></div></article><article><FileCheck2 size={18} /><div><b>{hi ? "क्या फोटो और हस्ताक्षर PDF में मिल सकते हैं?" : "Can I export photos and signatures as PDF?"}</b><p>{hi ? "हाँ। आउटपुट फ़ॉर्मेट मेनू में PDF चुनें।" : "Yes. Choose PDF from the output-format menu in either workspace."}</p></div></article><article><FileCheck2 size={18} /><div><b>{hi ? "क्या कई फ़ाइलें एक साथ प्रोसेस हो सकती हैं?" : "Can I process several files?"}</b><p>{hi ? "हाँ। एक सेटिंग लागू करें और परिणाम ZIP में डाउनलोड करें।" : "Yes. Apply one set of options to multiple images and download the results together as a ZIP."}</p></div></article></div></section></div><div className="info-panel-footer"><span><CheckCircle2 size={17} /> {hi ? "अकाउंट की आवश्यकता नहीं" : "No account required"}</span><button className="button button-primary" onClick={beginStart}>{hi ? "तैयारी शुरू करें" : "Start preparing"} <ArrowRight size={16} /></button></div></motion.div></motion.div>}</AnimatePresence>
      <AnimatePresence>{starting && <motion.div className="start-transition" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: .36, ease: [0.76, 0, 0.24, 1] }}><span className="brand-mark"><span /><span /><Check size={14} strokeWidth={3} /></span><b>EasyApply</b><small>{hi ? "आपका वर्कस्पेस तैयार हो रहा है…" : "Preparing your workspace…"}</small></motion.div>}</AnimatePresence>
    </div>
  );
}
