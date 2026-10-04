"use client";

/**
 * Grows a PDF to at least `minBytes` by adding an XMP metadata packet with
 * whitespace padding. Padding is a standard part of XMP (it exists so tools
 * can edit metadata in place), readers ignore it, and pages are untouched.
 */
export async function padPdf(bytes: Uint8Array, minBytes: number): Promise<Uint8Array> {
  if (bytes.length >= minBytes) return bytes;
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const encoder = new TextEncoder();
  const head = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>EasyApply</pdf:Producer></rdf:Description></rdf:RDF></x:xmpmeta>\n';
  const tail = '<?xpacket end="w"?>';
  const line = `${" ".repeat(99)}\n`;

  let padding = minBytes - bytes.length;
  let output = bytes;
  for (let attempt = 0; attempt < 4 && output.length < minBytes; attempt += 1) {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    const fill = line.repeat(Math.floor(Math.max(0, padding) / line.length)) + " ".repeat(Math.max(0, padding) % line.length);
    const packet = encoder.encode(head + fill + tail);
    const stream = document.context.stream(packet, { Type: "Metadata", Subtype: "XML" });
    const ref = document.context.register(stream);
    // Keep any existing metadata; the padding packet is then stored alongside it.
    if (!document.catalog.has(PDFName.of("Metadata"))) document.catalog.set(PDFName.of("Metadata"), ref);
    output = await document.save({ useObjectStreams: true });
    padding += minBytes - output.length + 32;
  }
  return output;
}
