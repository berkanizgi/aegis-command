import fs from "node:fs/promises";
import { deflateSync } from "node:zlib";
// A tiny dependency-free rasterizer for the project's geometric A mark.
const size = 256,
  raw = Buffer.alloc((size * 4 + 1) * size);
const polygon = [
  [128, 55],
  [196, 199],
  [165, 199],
  [148, 160],
  [108, 160],
  [91, 199],
  [60, 199],
];
const hole = [
  [128, 103],
  [119, 132],
  [137, 132],
];
function inside(x, y, points) {
  let b = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      c = points[j];
    if (
      a[1] > y !== c[1] > y &&
      x < ((c[0] - a[0]) * (y - a[1])) / (c[1] - a[1]) + a[0]
    )
      b = !b;
  }
  return b;
}
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const index = y * (size * 4 + 1) + 1 + x * 4;
    const glyph = inside(x, y, polygon) && !inside(x, y, hole);
    raw.set(glyph ? [131, 244, 226, 255] : [7, 19, 27, 255], index);
  }
function crc(buf) {
  let n = 0xffffffff;
  for (const byte of buf) {
    n ^= byte;
    for (let k = 0; k < 8; k++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    len = Buffer.alloc(4),
    end = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  end.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, end]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
await fs.mkdir(new URL("../public/", import.meta.url), { recursive: true });
await fs.writeFile(
  new URL("../public/aegis-icon.png", import.meta.url),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
const png = await fs.readFile(
  new URL("../public/aegis-icon.png", import.meta.url),
);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await fs.writeFile(
  new URL("../public/aegis-icon.ico", import.meta.url),
  Buffer.concat([ico, png]),
);
