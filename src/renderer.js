import { TILE_SIZE, LAYERS, WORLD_PIXEL_CHUNK, CHUNK_SIZE } from './constants.js';

// Ссылки на DOM-элементы (заполняются в init)
let canvas, ctx, paletteCanvas, paletteCtx, infoOverlay;

/**
 * Инициализация рендерера ссылками на DOM-элементы.
 */
export function initRenderer(elements) {
  canvas = elements.canvas;
  ctx = elements.ctx;
  paletteCanvas = elements.paletteCanvas;
  paletteCtx = elements.paletteCtx;
  infoOverlay = elements.infoOverlay;
}

/**
 * Рисует палитру тайлов и подсвечивает выбранный.
 */
export function drawPalette(tilesetImg, tilesPerRow, selectedTileId) {
  paletteCtx.clearRect(0, 0, paletteCanvas.width, paletteCanvas.height);
  paletteCtx.drawImage(tilesetImg, 0, 0);

  const tx = selectedTileId % tilesPerRow;
  const ty = Math.floor(selectedTileId / tilesPerRow);
  paletteCtx.strokeStyle = '#ff0000';
  paletteCtx.lineWidth = 2;
  paletteCtx.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

/**
 * Главный цикл отрисовки мира.
 */
export function render(state, tilesetImg, tilesPerRow) {
  // Очистка
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  // Определяем видимые чанки
  const startX = Math.floor(state.camera.x / WORLD_PIXEL_CHUNK);
  const startY = Math.floor(state.camera.y / WORLD_PIXEL_CHUNK);
  const endX = Math.ceil((state.camera.x + canvas.width / state.camera.zoom) / WORLD_PIXEL_CHUNK);
  const endY = Math.ceil((state.camera.y + canvas.height / state.camera.zoom) / WORLD_PIXEL_CHUNK);

  // 1) Пол + стены
  drawWorldLayer(state, startX, startY, endX, endY, 'floor', tilesetImg, tilesPerRow);
  drawWorldLayer(state, startX, startY, endX, endY, 'walls', tilesetImg, tilesPerRow);

  // 2) Герой рисуется ПОД overhead — может «зайти за» куст/крышу
  if (state.heroMode) {
    drawHero(state);
  }

  // 3) Крыши/декор (overhead) — поверх героя
  drawWorldLayer(state, startX, startY, endX, endY, 'overhead', tilesetImg, tilesPerRow);

  // 4) Подсветка ПЕРИМЕТРА клеток (walls — красный, overhead — зелёный).
  //    Показывается только вместе с сеткой: сетка скрыта → подсветки тоже скрыты.
  if (state.showGrid) {
    drawLayerHighlights(state, startX, startY, endX, endY);
    drawGrid(state);
  }

  // Границы чанков
  drawChunkBorders(state, startX, startY, endX, endY);

  // Превью/курсор (только не в режиме героя)
  if (!state.heroMode) {
    drawPreview(state);
    drawCursor(state);
  }

  // Центр мира (0,0)
  drawOrigin();

  ctx.restore();

  // Мини-карта поверх всего
  drawMiniMap(state, tilesetImg, tilesPerRow);
}

/**
 * Рисует один слой всех видимых чанков.
 */
function drawWorldLayer(state, startX, startY, endX, endY, layer, tilesetImg, tilesPerRow) {
  for (let cy = startY; cy <= endY; cy++) {
    for (let cx = startX; cx <= endX; cx++) {
      const chunk = state.chunks[`${cx},${cy}`];
      if (!chunk) continue;

      const chunkPixelX = cx * WORLD_PIXEL_CHUNK;
      const chunkPixelY = cy * WORLD_PIXEL_CHUNK;
      const layerData = chunk[layer];

      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        const tileId = layerData[i];
        if (tileId === -1) continue;

        const lx = i % CHUNK_SIZE;
        const ly = Math.floor(i / CHUNK_SIZE);
        const srcX = (tileId % tilesPerRow) * TILE_SIZE;
        const srcY = Math.floor(tileId / tilesPerRow) * TILE_SIZE;
        const destX = chunkPixelX + lx * TILE_SIZE;
        const destY = chunkPixelY + ly * TILE_SIZE;

        ctx.drawImage(tilesetImg, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

/**
 * Подсветка периметра клеток для навигации (рисуется ПОВЕРХ спрайтов):
 *  - walls    → красная рамка вокруг клетки (коллизия, пройти нельзя)
 *  - overhead → зелёная рамка вокруг клетки (можно пройти «за» объект)
 *  - floor    → подсветка не нужна
 * Заливка не используется: она сливается с прозрачностью ассетов.
 */
function drawLayerHighlights(state, startX, startY, endX, endY) {
  for (let cy = startY; cy <= endY; cy++) {
    for (let cx = startX; cx <= endX; cx++) {
      const chunk = state.chunks[`${cx},${cy}`];
      if (!chunk) continue;

      const baseX = cx * WORLD_PIXEL_CHUNK;
      const baseY = cy * WORLD_PIXEL_CHUNK;

      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        const wallsId = chunk.walls[i];
        const overId = chunk.overhead[i];
        if (wallsId === -1 && overId === -1) continue;

        const lx = i % CHUNK_SIZE;
        const ly = Math.floor(i / CHUNK_SIZE);
        const x = baseX + lx * TILE_SIZE;
        const y = baseY + ly * TILE_SIZE;

        if (wallsId !== -1) {
          ctx.strokeStyle = 'rgba(255, 80, 80, 0.95)';
        } else {
          ctx.strokeStyle = 'rgba(80, 255, 150, 0.95)';
        }
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1.5, y + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
      }
    }
  }
}

function drawGrid(state) {
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const gridStartX = Math.floor(state.camera.x / TILE_SIZE) * TILE_SIZE;
  const gridEndX = Math.ceil((state.camera.x + canvas.width / state.camera.zoom) / TILE_SIZE) * TILE_SIZE + TILE_SIZE;
  const gridStartY = Math.floor(state.camera.y / TILE_SIZE) * TILE_SIZE;
  const gridEndY = Math.ceil((state.camera.y + canvas.height / state.camera.zoom) / TILE_SIZE) * TILE_SIZE + TILE_SIZE;

  for (let x = gridStartX; x <= gridEndX; x += TILE_SIZE) {
    ctx.beginPath(); ctx.moveTo(x, gridStartY); ctx.lineTo(x, gridEndY); ctx.stroke();
  }
  for (let y = gridStartY; y <= gridEndY; y += TILE_SIZE) {
    ctx.beginPath(); ctx.moveTo(gridStartX, y); ctx.lineTo(gridEndX, y); ctx.stroke();
  }
}

function drawChunkBorders(state, startX, startY, endX, endY) {
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
  for (let x = startX * WORLD_PIXEL_CHUNK; x <= (endX + 1) * WORLD_PIXEL_CHUNK; x += WORLD_PIXEL_CHUNK) {
    ctx.beginPath(); ctx.moveTo(x, startY * WORLD_PIXEL_CHUNK); ctx.lineTo(x, (endY + 1) * WORLD_PIXEL_CHUNK); ctx.stroke();
  }
  for (let y = startY * WORLD_PIXEL_CHUNK; y <= (endY + 1) * WORLD_PIXEL_CHUNK; y += WORLD_PIXEL_CHUNK) {
    ctx.beginPath(); ctx.moveTo(startX * WORLD_PIXEL_CHUNK, y); ctx.lineTo((endX + 1) * WORLD_PIXEL_CHUNK, y); ctx.stroke();
  }
}

function drawPreview(state) {
  if (!state.previewStart || !state.previewEnd) return;
  if (!state.isDrawing) return;

  const x1 = state.previewStart.gx * TILE_SIZE;
  const y1 = state.previewStart.gy * TILE_SIZE;
  const x2 = (state.previewEnd.gx + 1) * TILE_SIZE;
  const y2 = (state.previewEnd.gy + 1) * TILE_SIZE;

  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);

  if (state.toolMode === 'rect') {
    ctx.strokeRect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1)
    );
  } else if (state.toolMode === 'line') {
    const cx1 = (state.previewStart.gx + 0.5) * TILE_SIZE;
    const cy1 = (state.previewStart.gy + 0.5) * TILE_SIZE;
    const cx2 = (state.previewEnd.gx + 0.5) * TILE_SIZE;
    const cy2 = (state.previewEnd.gy + 0.5) * TILE_SIZE;
    ctx.beginPath();
    ctx.moveTo(cx1, cy1);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function drawCursor(state) {
  if (state.toolMode === 'pick') {
    // Курсор пипетки — жёлтая пунктирная рамка одной клетки
    const x = state.mouse.gridX * TILE_SIZE;
    const y = state.mouse.gridY * TILE_SIZE;
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.setLineDash([]);
    return;
  }

  if (state.isEraser) {
    // Курсор ластика — красный крестик
    const half = Math.floor(state.brushSize / 2);
    const x = (state.mouse.gridX - half) * TILE_SIZE;
    const y = (state.mouse.gridY - half) * TILE_SIZE;
    const size = state.brushSize * TILE_SIZE;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    // Диагональный крестик
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    return;
  }

  const half = Math.floor(state.brushSize / 2);
  const x = (state.mouse.gridX - half) * TILE_SIZE;
  const y = (state.mouse.gridY - half) * TILE_SIZE;
  const size = state.brushSize * TILE_SIZE;

  if (state.toolMode === 'fill') {
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, size, size);
    ctx.setLineDash([]);
    return;
  }

  if (state.toolMode === 'rect' || state.toolMode === 'line') {
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(state.mouse.gridX * TILE_SIZE, state.mouse.gridY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    return;
  }

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, size, size);
}

function drawOrigin() {
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
}

/**
 * Рисует героя: 2 квадрата по вертикали (ноги + голова).
 * h.px, h.py — верхний левый угол НИЖНЕГО квадрата (клетка ног).
 */
function drawHero(state) {
  const h = state.hero;
  if (!h) return;

  const x = h.px;
  const y = h.py;
  const headY = y - TILE_SIZE;

  // Ноги (нижний квадрат) — синие штаны
  ctx.fillStyle = '#2f6fd0';
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = '#143a7a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  // Голова (верхний квадрат)
  ctx.fillStyle = '#eebf8f';
  ctx.fillRect(x, headY, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = '#8a5a30';
  ctx.strokeRect(x + 1, headY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  // Глаза
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 7, headY + 10, 5, 8);
  ctx.fillRect(x + TILE_SIZE - 12, headY + 10, 5, 8);
}

// ========== MINI-MAP ==========

const MINI_MAP_SIZE = 160;
const MINI_MAP_MARGIN = 10;

function drawMiniMap(state, tilesetImg, tilesPerRow) {
  const mmX = canvas.width - MINI_MAP_SIZE - MINI_MAP_MARGIN;
  const mmY = canvas.height - MINI_MAP_SIZE - MINI_MAP_MARGIN;

  // Фон
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(mmX, mmY, MINI_MAP_SIZE, MINI_MAP_SIZE);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX, mmY, MINI_MAP_SIZE, MINI_MAP_SIZE);

  // Находим границы загруженных чанков
  let minCx = Infinity, maxCx = -Infinity;
  let minCy = Infinity, maxCy = -Infinity;
  for (const key of Object.keys(state.chunks)) {
    const [cx, cy] = key.split(',').map(Number);
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
  }

  if (minCx === Infinity) return;

  const chunkSpanX = maxCx - minCx + 1;
  const chunkSpanY = maxCy - minCy + 1;
  const scale = Math.min(
    (MINI_MAP_SIZE - 4) / (chunkSpanX * CHUNK_SIZE),
    (MINI_MAP_SIZE - 4) / (chunkSpanY * CHUNK_SIZE)
  );
  const pixelSize = Math.max(1, Math.floor(scale));

  // Рисуем каждый чанк миниатюрой
  for (const key of Object.keys(state.chunks)) {
    const [cx, cy] = key.split(',').map(Number);
    const chunk = state.chunks[key];

    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      let found = false;
      for (let li = 0; li < LAYERS.length; li++) {
        const tileId = chunk[LAYERS[li]][i];
        if (tileId !== -1) {
          const lx = i % CHUNK_SIZE;
          const ly = Math.floor(i / CHUNK_SIZE);
          const mmPixelX = mmX + 2 + ((cx - minCx) * CHUNK_SIZE + lx) * pixelSize;
          const mmPixelY = mmY + 2 + ((cy - minCy) * CHUNK_SIZE + ly) * pixelSize;

          const srcX = (tileId % tilesPerRow) * TILE_SIZE;
          const srcY = Math.floor(tileId / tilesPerRow) * TILE_SIZE;
          ctx.drawImage(tilesetImg, srcX, srcY, TILE_SIZE, TILE_SIZE, mmPixelX, mmPixelY, pixelSize, pixelSize);
          found = true;
          break; // показываем только верхний слой в мини-карте
        }
      }
      if (!found) {
        // Пустая клетка — чёрная
        const lx = i % CHUNK_SIZE;
        const ly = Math.floor(i / CHUNK_SIZE);
        const mmPixelX = mmX + 2 + ((cx - minCx) * CHUNK_SIZE + lx) * pixelSize;
        const mmPixelY = mmY + 2 + ((cy - minCy) * CHUNK_SIZE + ly) * pixelSize;
        ctx.fillStyle = '#111';
        ctx.fillRect(mmPixelX, mmPixelY, pixelSize, pixelSize);
      }
    }
  }

  // Рамка видимой области камеры
  const camChunkX = Math.floor(state.camera.x / WORLD_PIXEL_CHUNK);
  const camChunkY = Math.floor(state.camera.y / WORLD_PIXEL_CHUNK);
  const viewLeft = ((camChunkX - minCx) * CHUNK_SIZE + (state.camera.x % WORLD_PIXEL_CHUNK) / TILE_SIZE) * pixelSize;
  const viewTop = ((camChunkY - minCy) * CHUNK_SIZE + (state.camera.y % WORLD_PIXEL_CHUNK) / TILE_SIZE) * pixelSize;
  const viewWidth = (canvas.width / state.camera.zoom / TILE_SIZE) * pixelSize;
  const viewHeight = (canvas.height / state.camera.zoom / TILE_SIZE) * pixelSize;

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX + 2 + viewLeft, mmY + 2 + viewTop, viewWidth, viewHeight);

  // Маркер героя на мини-карте
  if (state.heroMode && state.hero) {
    const heroTileX = Math.round(state.hero.px / TILE_SIZE);
    const heroTileY = Math.round(state.hero.py / TILE_SIZE);
    const dotSize = Math.max(3, pixelSize + 1);
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(
      mmX + 2 + (heroTileX - minCx * CHUNK_SIZE) * pixelSize - 1,
      mmY + 2 + (heroTileY - minCy * CHUNK_SIZE) * pixelSize - 1,
      dotSize,
      dotSize
    );
  }
}

/**
 * Экспортирует видимые сейчас чанки в PNG.
 */
export function exportToPng(state) {
  const tilesetImg = state._tilesetImg;
  const tilesPerRow = state._tilesPerRow;
  if (!tilesetImg) return;
  // Находим все загруженные чанки
  let minGx = Infinity, maxGx = -Infinity;
  let minGy = Infinity, maxGy = -Infinity;

  for (const key of Object.keys(state.chunks)) {
    const [cx, cy] = key.split(',').map(Number);
    minGx = Math.min(minGx, cx * CHUNK_SIZE);
    maxGx = Math.max(maxGx, (cx + 1) * CHUNK_SIZE - 1);
    minGy = Math.min(minGy, cy * CHUNK_SIZE);
    maxGy = Math.max(maxGy, (cy + 1) * CHUNK_SIZE - 1);
  }

  if (minGx === Infinity) return;

  const outW = (maxGx - minGx + 1) * TILE_SIZE;
  const outH = (maxGy - minGy + 1) * TILE_SIZE;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');

  for (const key of Object.keys(state.chunks)) {
    const [cx, cy] = key.split(',').map(Number);
    const chunk = state.chunks[key];
    const baseX = (cx * CHUNK_SIZE - minGx) * TILE_SIZE;
    const baseY = (cy * CHUNK_SIZE - minGy) * TILE_SIZE;

    for (const layer of LAYERS) {
      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        const tileId = chunk[layer][i];
        if (tileId === -1) continue;
        const lx = i % CHUNK_SIZE;
        const ly = Math.floor(i / CHUNK_SIZE);
        const srcX = (tileId % tilesPerRow) * TILE_SIZE;
        const srcY = Math.floor(tileId / tilesPerRow) * TILE_SIZE;
        outCtx.drawImage(tilesetImg, srcX, srcY, TILE_SIZE, TILE_SIZE, baseX + lx * TILE_SIZE, baseY + ly * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  const link = document.createElement('a');
  link.download = 'tilemap.png';
  link.href = outCanvas.toDataURL('image/png');
  link.click();
}

/**
 * Обновление resize самого canvas.
 */
export function resizeCanvas() {
  const container = document.getElementById('canvas-container');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}