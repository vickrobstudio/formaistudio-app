// Client-side DXF → raster converter.
//
// Parses a DXF file with `dxf-parser`, walks every drawable entity
// (LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, ELLIPSE), normalizes to a
// bounding box, and renders the geometry as crisp black-on-white lines
// on a high-resolution canvas. The result feeds straight into the
// existing DetectionEditor pipeline as `imageDataUrl`, skipping the
// PDF OCR/clean step entirely — DXF is already vector.

import DxfParser from "dxf-parser";

type Pt = { x: number; y: number };

type AnyEntity = {
  type: string;
  vertices?: Pt[];
  start?: Pt;
  end?: Pt;
  center?: Pt;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  majorAxisEndPoint?: Pt;
  axisRatio?: number;
  shape?: boolean;
};

export type DxfRasterResult = {
  dataUrl: string;
  width: number;
  height: number;
  /** Real-world width of the drawing in DXF units (typically mm). */
  realWidth: number;
  realHeight: number;
  entityCount: number;
};

/**
 * Read a DXF file as text + render to a high-res PNG canvas.
 * Returns the data URL plus the real-world bounds so downstream code can
 * calibrate scale without OCRing dimension text.
 */
export async function rasterizeDxf(
  fileText: string,
  opts: { targetLongSide?: number; lineWidthPx?: number } = {},
): Promise<DxfRasterResult> {
  const targetLongSide = opts.targetLongSide ?? 3400;
  const parser = new DxfParser();
  const dxf = parser.parseSync(fileText);
  if (!dxf || !Array.isArray(dxf.entities)) throw new Error("Could not parse DXF file.");

  // 1. Bounding box from every entity vertex.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const seen = (p?: Pt) => { if (!p) return; if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; };
  for (const ent of dxf.entities as AnyEntity[]) {
    if (ent.start) seen(ent.start);
    if (ent.end) seen(ent.end);
    if (ent.center && typeof ent.radius === "number") {
      seen({ x: ent.center.x - ent.radius, y: ent.center.y - ent.radius });
      seen({ x: ent.center.x + ent.radius, y: ent.center.y + ent.radius });
    }
    if (Array.isArray(ent.vertices)) for (const v of ent.vertices) seen(v);
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    throw new Error("DXF file has no drawable geometry.");
  }
  const realWidth = Math.max(1e-6, maxX - minX);
  const realHeight = Math.max(1e-6, maxY - minY);

  // 2. Pixel canvas sized so the long side hits targetLongSide.
  const scale = targetLongSide / Math.max(realWidth, realHeight);
  const margin = Math.round(targetLongSide * 0.02);
  const W = Math.ceil(realWidth * scale) + margin * 2;
  const H = Math.ceil(realHeight * scale) + margin * 2;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for DXF rasterization.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = opts.lineWidthPx ?? Math.max(1, Math.round(targetLongSide * 0.0015));
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // DXF Y axis points UP; canvas Y points DOWN — flip while mapping.
  const tx = (x: number) => (x - minX) * scale + margin;
  const ty = (y: number) => H - ((y - minY) * scale + margin);

  let drawn = 0;
  for (const ent of dxf.entities as AnyEntity[]) {
    switch (ent.type) {
      case "LINE":
        if (!ent.start || !ent.end) break;
        ctx.beginPath();
        ctx.moveTo(tx(ent.start.x), ty(ent.start.y));
        ctx.lineTo(tx(ent.end.x), ty(ent.end.y));
        ctx.stroke();
        drawn++;
        break;
      case "LWPOLYLINE":
      case "POLYLINE": {
        const verts = ent.vertices ?? [];
        if (verts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(tx(verts[0].x), ty(verts[0].y));
        for (let i = 1; i < verts.length; i++) ctx.lineTo(tx(verts[i].x), ty(verts[i].y));
        if (ent.shape) ctx.closePath();
        ctx.stroke();
        drawn++;
        break;
      }
      case "CIRCLE":
        if (!ent.center || typeof ent.radius !== "number") break;
        ctx.beginPath();
        ctx.arc(tx(ent.center.x), ty(ent.center.y), ent.radius * scale, 0, Math.PI * 2);
        ctx.stroke();
        drawn++;
        break;
      case "ARC":
        if (!ent.center || typeof ent.radius !== "number") break;
        ctx.beginPath();
        // DXF angles are CCW from +X; flipped Y axis means we need to negate angles + swap start/end.
        ctx.arc(
          tx(ent.center.x), ty(ent.center.y),
          ent.radius * scale,
          -((ent.endAngle ?? 0) * Math.PI / 180),
          -((ent.startAngle ?? 0) * Math.PI / 180),
        );
        ctx.stroke();
        drawn++;
        break;
      case "ELLIPSE": {
        if (!ent.center || !ent.majorAxisEndPoint) break;
        const mx = ent.majorAxisEndPoint.x;
        const my = ent.majorAxisEndPoint.y;
        const major = Math.sqrt(mx * mx + my * my);
        const minor = major * (ent.axisRatio ?? 1);
        const rot = Math.atan2(my, mx);
        ctx.beginPath();
        ctx.ellipse(tx(ent.center.x), ty(ent.center.y), major * scale, minor * scale, -rot, 0, Math.PI * 2);
        ctx.stroke();
        drawn++;
        break;
      }
      // TEXT / DIMENSION / HATCH / INSERT — intentionally skipped.
      // DXF text and dimensions are the noise we want gone anyway, so
      // we get a "pre-cleaned" plan for free.
      default:
        break;
    }
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: W,
    height: H,
    realWidth,
    realHeight,
    entityCount: drawn,
  };
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read DXF file."));
    reader.readAsText(file);
  });
}