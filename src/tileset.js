import { TILE_SIZE, TILESET_COLS, TILESET_ROWS, TOTAL_TILES } from './constants.js';

/**
 * Генерирует процедурный тайлсет и возвращает его как Image.
 * Тайлы рисуются на canvas и экспортируются в PNG.
 * Порядок тайлов (32×32 каждый):
 *   Ряд 0: травяной пол, земля, песок, каменный пол
 *   Ряд 1: плитка, деревянный пол, вода, лава
 *   Ряд 2: каменная стена, деревянная стена, кирпичная стена, забор
 *   Ряд 3: крыша/черепица, деревянная крыша, куст, сундук
 */
export function generateTileset() {
  const canvas = document.createElement('canvas');
  canvas.width = TILESET_COLS * TILE_SIZE;
  canvas.height = TILESET_ROWS * TILE_SIZE;
  const ctx = canvas.getContext('2d');

  // --- Ряд 0: Полы ---
  drawTile(ctx, 0, 0, '#4a7c3f', '#3d6b34', '•');           // трава
  drawTile(ctx, 1, 0, '#8B6914', '#7a5c10', ',');           // земля
  drawTile(ctx, 2, 0, '#d4c78a', '#c4b87a', '.');           // песок
  drawTile(ctx, 3, 0, '#7a7a7a', '#6a6a6a', ':');           // каменный пол

  // --- Ряд 1: Полы ---
  drawTile(ctx, 4, 0, '#5a5a6a', '#4a4a5a', '+');           // плитка
  drawTile(ctx, 5, 0, '#8B5E3C', '#7a4e2c', '≡');           // деревянный пол
  drawTile(ctx, 6, 0, '#2a5a8a', '#1a4a7a', '~');           // вода
  drawTile(ctx, 7, 0, '#aa3a1a', '#8a2a0a', '≋');          // лава

  // --- Ряд 2: Стены ---
  drawTile(ctx, 0, 1, '#5a5a5a', '#4a4a4a', '█');           // каменная стена
  drawTile(ctx, 1, 1, '#6B4226', '#5a3216', '▓');           // деревянная стена
  drawTile(ctx, 2, 1, '#8B4513', '#7a3503', '▒');           // кирпичная стена
  drawTile(ctx, 3, 1, '#6a5a3a', '#5a4a2a', '░');           // забор

  // --- Ряд 3: Декорации ---
  drawTile(ctx, 4, 1, '#6a3a2a', '#5a2a1a', '▲');           // крыша черепица
  drawTile(ctx, 5, 1, '#5a3a1a', '#4a2a0a', '▲');           // крыша дерево
  drawTile(ctx, 6, 1, '#2a6a2a', '#1a5a1a', '♣');           // куст
  drawTile(ctx, 7, 1, '#8B6914', '#7a5810', '♦');           // сундук

  // Конвертируем canvas в Image
  const img = new Image();
  img.src = canvas.toDataURL('image/png');
  return img;
}

/**
 * Рисует один тайл на переданном контексте.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} col - колонка в тайлсете (0-based)
 * @param {number} row - ряд в тайлсете (0-based)
 * @param {string} fillColor - основной цвет
 * @param {string} borderColor - цвет границы/тени
 * @param {string} symbol - символ для текстуры
 */
function drawTile(ctx, col, row, fillColor, borderColor, symbol) {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;

  // Заливка
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  // Граница (пиксель-арт эффект)
  ctx.fillStyle = borderColor;
  ctx.fillRect(x, y, TILE_SIZE, 1);           // верх
  ctx.fillRect(x, y, 1, TILE_SIZE);           // лево
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + TILE_SIZE - 1, TILE_SIZE, 1); // низ
  ctx.fillRect(x + TILE_SIZE - 1, y, 1, TILE_SIZE); // право

  // Текстурный символ
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.font = `${TILE_SIZE * 0.6}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x + TILE_SIZE / 2, y + TILE_SIZE / 2);
}

/**
 * Создаёт tileset PNG и загружает в Image.
 * Возвращает Promise, который резолвится с Image.
 */
export function loadTileset() {
  return new Promise((resolve) => {
    const img = generateTileset();
    img.onload = () => resolve(img);
    // Если Image уже загружен (data: URI может быть синхронным)
    if (img.complete && img.naturalWidth > 0) {
      resolve(img);
    }
  });
}

/**
 * Вычисляет количество тайлов в строке и общее количество.
 */
export function getTilesetInfo(img) {
  return {
    tilesPerRow: Math.floor(img.width / TILE_SIZE),
    totalTiles: Math.floor((img.width / TILE_SIZE) * (img.height / TILE_SIZE)),
  };
}