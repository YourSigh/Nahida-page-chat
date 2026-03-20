/**
 * 以 assets/floating-icon.png 为主 Logo（不会被本脚本覆盖）。
 * 去掉透明边后生成扩展栏 icon-*.png，以及页面悬浮球用的 floating-icon-cropped.png。
 *
 * 若源图没有透明通道、四周与主体同色，trim 可能几乎无效，需在画图软件里手动裁边。
 */
import sharp from "sharp";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "assets", "floating-icon.png");

try {
  await access(sourcePath, fsConstants.R_OK);
} catch {
  console.error("缺少源文件：请先把主 Logo 放到 assets/floating-icon.png");
  process.exit(1);
}

const trimmedPng = await sharp(sourcePath)
  .ensureAlpha()
  .trim({ threshold: 1 })
  .png()
  .toBuffer();

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const out = join(root, "assets", `icon-${size}.png`);
  await sharp(trimmedPng)
    .resize(size, size, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out);
}

const floatMax = 256;
const croppedOut = join(root, "assets", "floating-icon-cropped.png");
await sharp(trimmedPng)
  .resize(floatMax, floatMax, {
    fit: "contain",
    position: "centre",
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png({ compressionLevel: 9 })
  .toFile(croppedOut);
console.log("wrote", croppedOut);

console.log(
  "Done. 未修改 floating-icon.png。请到 chrome://extensions 重新加载扩展。"
);
