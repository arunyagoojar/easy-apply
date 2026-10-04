"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  FileArchive,
  FileImage,
  FilePen,
  Files,
  Image as ImageIcon,
  PenLine,
  Signature,
  SquareUser,
  Upload,
} from "lucide-react";
import type { ComponentType } from "react";
import type { MessageKey } from "../lib/messages";
import { handOffFiles, isImageFile, isPdfFile } from "../lib/files";
import { AppHeader, SiteFooter } from "./AppHeader";
import { useT } from "./LanguageProvider";
import { useFilePicker, useToast, useWindowDrop } from "./ui";

type Task = { href: string; icon: ComponentType<{ size?: number }>; title: MessageKey; desc: MessageKey; pdf?: boolean };

const imageTasks: Task[] = [
  { href: "/tools/passport-photo", icon: SquareUser, title: "task.photo.title", desc: "task.photo.desc" },
  { href: "/tools/signature", icon: Signature, title: "task.signature.title", desc: "task.signature.desc" },
  { href: "/tools/image", icon: ImageIcon, title: "task.image.title", desc: "task.image.desc" },
  { href: "/tools/images-to-pdf", icon: FileImage, title: "task.imagesToPdf.title", desc: "task.imagesToPdf.desc", pdf: true },
];

const pdfTasks: Task[] = [
  { href: "/tools/pdf", icon: Files, title: "task.merge.title", desc: "task.merge.desc", pdf: true },
  { href: "/tools/compress-pdf", icon: FileArchive, title: "task.compress.title", desc: "task.compress.desc", pdf: true },
  { href: "/tools/sign-pdf", icon: PenLine, title: "task.sign.title", desc: "task.sign.desc", pdf: true },
  { href: "/tools/edit-pdf", icon: FilePen, title: "task.edit.title", desc: "task.edit.desc", pdf: true },
];

export const ACCEPT_ANY = "image/*,.heic,.heif,application/pdf,.pdf";

export function Hub() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();

  const route = (files: File[]) => {
    const pdfs = files.filter(isPdfFile);
    const images = files.filter((file) => !isPdfFile(file) && isImageFile(file));
    const unsupported = files.find((file) => !isPdfFile(file) && !isImageFile(file));
    if (unsupported) toast(t("common.unsupported", { name: unsupported.name }), "error");
    if (pdfs.length) {
      handOffFiles("pdf", [...pdfs, ...images]);
      router.push("/tools/pdf");
    } else if (images.length) {
      handOffFiles("image", images);
      router.push("/tools/image");
    }
  };

  const picker = useFilePicker(ACCEPT_ANY, route);
  const dragging = useWindowDrop(route);

  const renderTasks = (tasks: Task[]) => (
    <div className="task-grid">
      {tasks.map((task) => {
        const Icon = task.icon;
        return (
          <Link key={task.href} href={task.href} className="task-card">
            <span className={`task-icon${task.pdf ? " pdf" : ""}`}><Icon size={20} /></span>
            <span><b>{t(task.title)}</b><small>{t(task.desc)}</small></span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="app">
      <AppHeader />
      <main className="hub">
        <div className="hub-intro">
          <h1>{t("hub.title")}</h1>
          <p>{t("hub.subtitle")}</p>
        </div>

        {picker.input}
        <div
          className={`dropzone hub-drop${dragging ? " is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={picker.open}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); picker.open(); } }}
        >
          <span className="dz-icon"><Upload size={24} /></span>
          <h2>{t("hub.drop.title")}</h2>
          <p>{t("hub.drop.body")}</p>
          <small>{t("hub.drop.formats")}</small>
        </div>

        <section className="hub-section" aria-labelledby="hub-images">
          <h2 id="hub-images">{t("hub.section.images")}</h2>
          {renderTasks(imageTasks)}
        </section>
        <section className="hub-section" aria-labelledby="hub-pdf">
          <h2 id="hub-pdf">{t("hub.section.pdf")}</h2>
          {renderTasks(pdfTasks)}
        </section>

        <div className="privacy-strip">
          <span><CircleCheck size={16} />{t("hub.trust.local")}</span>
          <span><CircleCheck size={16} />{t("hub.trust.noUpload")}</span>
          <span><CircleCheck size={16} />{t("hub.trust.free")}</span>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
