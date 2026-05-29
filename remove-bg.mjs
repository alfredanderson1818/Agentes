// Quita el fondo casi-blanco de los sprites mediante relleno (flood-fill) desde
// las 4 esquinas. No toca los blancos INTERNOS (gi, capa, armadura) porque el
// contorno del personaje detiene el relleno. Solo procesa imágenes con fondo opaco.
import Jimp from "jimp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const names = ["krillin", "piccolo", "vegeta", "gohan", "goku"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "public", "assets");

for (const n of names) {
  const p = path.join(dir, n + ".png");
  const img = await Jimp.read(p);
  const { data, width, height } = img.bitmap;
  const idx = (x, y) => (y * width + x) * 4;

  const cornerA = data[idx(0, 0) + 3];
  if (cornerA < 20) {
    console.log(`${n}: ya transparente (esquina alpha=${cornerA}) → se deja igual`);
    continue;
  }

  const isBg = (i) => {
    if (data[i + 3] === 0) return true;
    return Math.min(data[i], data[i + 1], data[i + 2]) >= 190; // casi blanco
  };

  const visited = new Uint8Array(width * height);
  const stack = [];
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pi = y * width + x;
    if (!visited[pi] && isBg(pi * 4)) stack.push(pi);
  };
  [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]].forEach(([x, y]) => tryPush(x, y));

  let cleared = 0;
  while (stack.length) {
    const pi = stack.pop();
    if (visited[pi]) continue;
    visited[pi] = 1;
    const i = pi * 4;
    data[i + 3] = 0;
    cleared++;
    const x = pi % width, y = (pi - x) / width;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }

  // Suaviza el halo: pixeles claros pegados a transparencia → transparentes.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      if (data[i + 3] === 0) continue;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 210) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < width && ny < height && data[idx(nx, ny) + 3] === 0;
      });
      if (near) data[i + 3] = 0;
    }
  }

  await img.writeAsync(p);
  console.log(`${n}: ${width}x${height} → fondo eliminado (${cleared} px)`);
}
console.log("Listo ✅");
