// Generuje ikony PNG bez zależności: fioletowe tło, trzy paski (LOW, MEDIUM, HIGH).
import fs from "fs"; import zlib from "zlib";
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(S) {
  const bg = [162, 60, 223], bars = [[0.26, [235, 226, 217]], [0.44, [204, 221, 71]], [0.62, [255, 255, 255]]];
  const lens = [0.38, 0.52, 0.66], raw = Buffer.alloc((S * 3 + 1) * S);
  for (let y = 0; y < S; y++) { raw[y * (S * 3 + 1)] = 0; for (let x = 0; x < S; x++) {
    let col = bg; const fx = x / S, fy = y / S;
    bars.forEach(([top, c], i) => { const h = 0.12, l = 0.17, r = l + lens[i]; const ry = h / 2;
      if (fy >= top && fy <= top + h) { const cy = top + h / 2; const inCap = (px) => ((fx - px) ** 2 + (fy - cy) ** 2) <= ry * ry;
        if ((fx >= l && fx <= r) || inCap(l) || inCap(r)) col = c; } });
    const o = y * (S * 3 + 1) + 1 + x * 3; raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(S, 0); ih.writeUInt32BE(S, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [180, 192, 512]) fs.writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), png(s));
