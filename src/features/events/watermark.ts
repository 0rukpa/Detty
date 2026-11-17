/**
 * Auto-watermarked flyers (spec 6.7).
 *
 * Every uploaded flyer gets a second version with a QR code, the short official
 * link and a small Detty logo in the bottom-right corner. The feed and share
 * sheets always use this version, so a repost still leads to the real payment page.
 *
 * No "server-only" import here: the seed script uses this too.
 */
import QRCode from "qrcode";
import sharp from "sharp";
import { BRAND } from "@/config/brand";
import { eventUrl, officialEventLink } from "@/lib/slug";

export const FLYER_MAX_WIDTH = 1440;

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** QR modules drawn as SVG rects, so no second raster pass is needed. */
function qrRects(text: string, size: number): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  let rects = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) {
        rects += `<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}"/>`;
      }
    }
  }
  return rects;
}

/** The watermark badge as an SVG sized for a flyer `width` pixels wide. */
export function watermarkSvg(slug: string, width: number): { svg: string; w: number; h: number } {
  const u = Math.max(width / 1080, 0.45); // scale unit
  const qr = Math.round(150 * u);
  const pad = Math.round(14 * u);
  const textH = Math.round(54 * u);
  const w = qr + pad * 2;
  const h = qr + pad * 2 + textH;
  const link = officialEventLink(slug);
  const shown = link.length > 26 ? `${link.slice(0, 25)}…` : link;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" rx="${Math.round(18 * u)}" fill="#08070b" fill-opacity="0.92"/>
  <rect x="${pad}" y="${pad}" width="${qr}" height="${qr}" rx="${Math.round(8 * u)}" fill="#ffffff"/>
  <g transform="translate(${pad + qr * 0.06} ${pad + qr * 0.06})" fill="#08070b">${qrRects(eventUrl(slug), qr * 0.88)}</g>
  <text x="${w / 2}" y="${pad * 2 + qr + 20 * u}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${(24 * u).toFixed(1)}" fill="#ffffff">${escapeXml(BRAND.appName)}<tspan fill="#ff2e93">.</tspan></text>
  <text x="${w / 2}" y="${pad * 2 + qr + 40 * u}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${(11.5 * u).toFixed(1)}" fill="#c9c4d6">${escapeXml(shown)}</text>
</svg>`;
  return { svg, w, h };
}

export type ProcessedFlyer = { original: Buffer; watermarked: Buffer; width: number; height: number };

/** Normalise an uploaded flyer to WebP and produce its watermarked twin. */
export async function processFlyer(input: Buffer, slug: string): Promise<ProcessedFlyer> {
  const base = sharp(input, { failOn: "error" })
    .rotate() // respect EXIF orientation, then strip metadata
    .resize({ width: FLYER_MAX_WIDTH, withoutEnlargement: true });
  const { data: original, info } = await base.webp({ quality: 86 }).toBuffer({ resolveWithObject: true });

  const mark = watermarkSvg(slug, info.width);
  const margin = Math.round(info.width * 0.025);
  const watermarked = await sharp(original)
    .composite([
      {
        input: Buffer.from(mark.svg),
        left: Math.max(info.width - mark.w - margin, 0),
        top: Math.max(info.height - mark.h - margin, 0),
      },
    ])
    .webp({ quality: 86 })
    .toBuffer();

  return { original, watermarked, width: info.width, height: info.height };
}

/** Story images and video posters: just normalise, no watermark. */
export async function processImage(input: Buffer, maxWidth = 1080): Promise<Buffer> {
  return sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
}
