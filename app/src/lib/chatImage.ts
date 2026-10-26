/*
 * Bild für den Gruppenchat im Browser verkleinern: längere Seite höchstens 1280 px, JPEG, kleiner als MAX_IMG.
 * Neu gezeichnet, dadurch ohne Metadaten (Ort, Kamera). Nur Bilder; was der Browser nicht lesen kann, wirft.
 */
import { fitSize, IMG_EDGE, isImageFile, MAX_IMG } from "./chat";

async function decode(f: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") return createImageBitmap(f);
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export async function shrinkImage(f: File): Promise<string> {
  if (!isImageFile(f)) throw new Error("not an image");
  const src = await decode(f);
  const canvas = document.createElement("canvas");
  for (let edge = IMG_EDGE; edge >= 480; edge = Math.round(edge * 0.75)) {
    const { w, h } = fitSize(src.width, src.height, edge);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    // weißer Grund für durchsichtige Bilder (JPEG kennt keine Transparenz)
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58]) {
      const d = canvas.toDataURL("image/jpeg", q);
      if (d.startsWith("data:image/jpeg") && d.length < MAX_IMG) return d;
    }
  }
  throw new Error("image too large");
}
