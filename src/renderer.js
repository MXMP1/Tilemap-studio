import { TILE_SIZE, WORLD_PIXEL_CHUNK, CHUNK_SIZE } from './constants.js';
import { footprintAt, overlapsObjects } from './objects.js';

// Ссылки на DOM-элементы (заполняются в init)
let canvas, ctx, infoOverlay, paletteGrid;

/**
 * Инициализация рендерера ссылками на DOM-элементы.
 */
export function initRenderer(elements) {
  canvas = elements.canvas;
  ctx = elements.ctx;
  infoOverlay = elements.infoOverlay;
  paletteGrid = elements.paletteGrid;
}

/**
 * Строит DOM-палитру: сетка тайлов переносится по ширине панели
 * (без горизонтального скролла). Каждый тайл — «окошко» в тайлсет через
 * background-image + background-position, поэтому лишние канвасы не нужны.
 */
export function buildPalette(tilesetImg, tilesPerRow, selectedTileId) {
  if (!paletteGrid) return;

  const url = tilesetImg.src;
  const cols = Math.max(1, tilesPerRow);
  const rows = Math.max(1, Math.floor(tilesetImg.height / TILE_SIZE));
  const total = cols * rows;
  const bgSize = `${cols * 100}% ${rows * 100}%`;

  let html = '';
  for (let id = 0; id < total; id++) {
    const px = cols > 1 ? (id % cols) * (100 / (cols - 1)) : 0;
    const py = rows > 1 ? Math.floor(id / cols) * (100 / (rows - 1)) : 0;
    const style = `background-image:url(${url});background-size:${bgSize};background-position:${px}% ${py}%`;
    html += `<div class="palette-item" data-tile-id="${id}" style="${style}"></div>`;
  }
  paletteGrid.innerHTML = html;
  drawPalette(tilesetImg, tilesPerRow, selectedTileId); // null → ничего не выделено
}

/**
 * Подсвечивает выбранный тайл в DOM-палитре.
 */
export function drawPalette(tilesetImg, tilesPerRow, selectedTileId) {
  if (!paletteGrid) return;
  const items = paletteGrid.children;
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('selected', i === selectedTileId);
  }
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
  ctx.imageSmoothingEnabled = false;

  // Определяем видимые чанки
  const startX = Math.floor(state.camera.x / WORLD_PIXEL_CHUNK);
  const startY = Math.floor(state.camera.y / WORLD_PIXEL_CHUNK);
  const endX = Math.ceil((state.camera.x + canvas.width / state.camera.zoom) / WORLD_PIXEL_CHUNK);
  const endY = Math.ceil((state.camera.y + canvas.height / state.camera.zoom) / WORLD_PIXEL_CHUNK);

  // 1) Текстуры terrain (floor) — единственный видимый слой.
  //    Слои walls/overhead теперь НЕВИДИМЫЕ флаги поведения: картинки по ним
  //    не рисуются, о них напоминают только рамки подсветки ниже.
  drawWorldLayer(state, startX, startY, endX, endY, 'floor', tilesetImg, tilesPerRow);

  // 2) ОБЪЕКТЫ и ГЕРОЙ — painter’s algorithm: сначала объекты, у которых низ
  //    выше низа героя (герой «за» ними), затем герой, затем объекты «перед».
  drawObjectsAndHero(state);

  // 3) Подсветка ПЕРИМЕТРА клеток-флагов (walls — красный, overhead — зелёный).
  //    Показывается только вместе с сеткой: сетка скрыта → подсветки тоже скрыты.
  if (state.showGrid) {
    drawLayerHighlights(state, startX, startY, endX, endY);
    drawGrid(state);
  }

  // Границы чанков
  drawChunkBorders(state, startX, startY, endX, endY);

  // Превью/курсор/призраки объектов (только не в режиме героя)
  if (!state.heroMode) {
    drawPreview(state);
    drawGhosts(state);
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
 * Подсветка периметра клеток-ФЛАГОВ (walls/overhead невидимы; рисуется ПОВЕРХ тайлов):
 *  - walls    → красная рамка вокруг клетки (коллизия, пройти нельзя)
 *  - overhead → зелёная рамка вокруг клетки (проходимо «под объектом»)
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
  if (state.placingFile || state.objDrag) return; // вместо курсора — призрак объекта

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

  if (state.toolMode === 'select') {
    // Курсор инструмента «Выбор» — голубая пунктирная рамка клетки
    const x = state.mouse.gridX * TILE_SIZE;
    const y = state.mouse.gridY * TILE_SIZE;
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
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

  // Ничего не выбрано (слой 1) — пустой квадрат в сетке: кисть/фигуры не рисуют.
  // Слои 2/3 — флаги: палитра не нужна, рисуем всегда (курсор ниже обычный).
  if (state.currentLayer === 'floor' && (state.selectedTileId === null || state.selectedTileId === undefined)) {
    const half = Math.floor(state.brushSize / 2);
    const x = (state.mouse.gridX - half) * TILE_SIZE;
    const y = (state.mouse.gridY - half) * TILE_SIZE;
    const size = state.brushSize * TILE_SIZE;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
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

// ========== ОБЪЕКТЫ ==========

/** Рисует картинку объекта в его footprint (тайлы уже масштабированы 1:1). */
function drawObjectImage(state, o, alpha) {
  const images = state._objectImages;
  const img = images ? images[o.file] : null;
  if (!img) return;
  const x = o.gx * TILE_SIZE;
  const y = o.gy * TILE_SIZE;
  const w = o.w * TILE_SIZE;
  const h = o.h * TILE_SIZE;
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, w, h);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

/** Рамка выделенного объекта (пунктирная голубая). */
function drawSelectionFrame(state, inst) {
  if (!inst) return;
  const x = inst.gx * TILE_SIZE;
  const y = inst.gy * TILE_SIZE;
  const w = inst.w * TILE_SIZE;
  const h = inst.h * TILE_SIZE;
  ctx.strokeStyle = 'rgba(0, 205, 255, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);
}

/**
 * Объекты и герой одним проходом (painter’s algorithm):
 * чем ниже НИЗ объекта — тем ближе к зрителю, рисуем позже.
 */
function drawObjectsAndHero(state) {
  const objs = state.objects || [];
  const hero = state.heroMode ? state.hero : null;

  // Рамка выделения — поверх своего объекта
  let selected = null;
  if (state.selectedObjectId != null) {
    for (const o of objs) if (o.id === state.selectedObjectId) selected = o;
  }

  if (objs.length === 0) {
    if (hero) drawHero(state);
    if (selected && !state.objDrag) drawSelectionFrame(state, selected);
    return;
  }

  const sorted = objs.slice().sort((a, b) => (a.gy + a.h) * TILE_SIZE - (b.gy + b.h) * TILE_SIZE);

  if (!hero) {
    for (const o of sorted) drawObjectImage(state, o);
    if (selected && !state.objDrag) drawSelectionFrame(state, selected);
    return;
  }

  // С героем: делим объекты по низу относительно низа героя
  const heroBottom = hero.py + TILE_SIZE;
  for (const o of sorted) {
    if ((o.gy + o.h) * TILE_SIZE < heroBottom) drawObjectImage(state, o);
  }
  drawHero(state);
  for (const o of sorted) {
    if ((o.gy + o.h) * TILE_SIZE >= heroBottom) drawObjectImage(state, o);
  }
  if (selected && !state.objDrag) drawSelectionFrame(state, selected);
}

/**
 * Призраки объектов: режим расстановки (placingFile) и перенос (objDrag).
 * Жёлтая рамка = можно ставить/бросить, красная = пересечение с объектом.
 */
function drawGhosts(state) {
  // 1) Призрак нового объекта под курсором (низ — у курсора)
  const def = state.placingFile;
  if (def) {
    const images = state._objectImages;
    const img = images ? images[def.file] : null;
    if (img) {
      const fp = footprintAt(def, state.mouse.gridX, state.mouse.gridY);
      const ok = !overlapsObjects(state, fp.gx, fp.gy, fp.w, fp.h, null);
      drawGhostRect(state, img, fp.gx, fp.gy, fp.w, fp.h, ok);
    }
  }

  // 2) Призрак переносимого объекта (объект ещё на старом месте)
  const drag = state.objDrag;
  if (drag) {
    const images = state._objectImages;
    const img = images ? images[drag.file] : null;
    if (img) {
      drawGhostRect(state, img, drag.gx, drag.gy, drag.w, drag.h, drag.valid);
    }
  }
}

/** Полупрозрачная картинка + рамка 1px (жёлтая — можно, красная — нельзя). */
function drawGhostRect(state, img, gx, gy, w, h, ok) {
  const x = gx * TILE_SIZE;
  const y = gy * TILE_SIZE;
  const wpx = w * TILE_SIZE;
  const hpx = h * TILE_SIZE;
  ctx.save();
  ctx.globalAlpha = ok ? 0.45 : 0.2;
  ctx.drawImage(img, x, y, wpx, hpx);
  ctx.restore();
  ctx.strokeStyle = ok ? '#ffd54a' : '#ff4444';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, wpx - 1, hpx - 1);
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

  // Ограничиваем всё рисование мини-карты её границами
  ctx.save();
  ctx.beginPath();
  ctx.rect(mmX + 2, mmY + 2, MINI_MAP_SIZE - 4, MINI_MAP_SIZE - 4);
  ctx.clip();

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

    // Показываем только floor — walls/overhead невидимы (флаги поведения)
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      const tileId = chunk.floor[i];
      if (tileId !== -1) {
        const lx = i % CHUNK_SIZE;
        const ly = Math.floor(i / CHUNK_SIZE);
        const mmPixelX = mmX + 2 + ((cx - minCx) * CHUNK_SIZE + lx) * pixelSize;
        const mmPixelY = mmY + 2 + ((cy - minCy) * CHUNK_SIZE + ly) * pixelSize;

        const srcX = (tileId % tilesPerRow) * TILE_SIZE;
        const srcY = Math.floor(tileId / tilesPerRow) * TILE_SIZE;
        ctx.drawImage(tilesetImg, srcX, srcY, TILE_SIZE, TILE_SIZE, mmPixelX, mmPixelY, pixelSize, pixelSize);
      } else {
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

  // Рамка видимой области камеры: переводим камеру в «мировые тайлы»
  // напрямую (camera.x / TILE_SIZE), это корректно и для отрицательных координат,
  // затем — в пиксели мини-карты относительно её левого верхнего угла.
  const viewLeftTiles = state.camera.x / TILE_SIZE - minCx * CHUNK_SIZE;
  const viewTopTiles = state.camera.y / TILE_SIZE - minCy * CHUNK_SIZE;
  const viewTilesW = canvas.width / (TILE_SIZE * state.camera.zoom);
  const viewTilesH = canvas.height / (TILE_SIZE * state.camera.zoom);

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mmX + 2 + viewLeftTiles * pixelSize,
    mmY + 2 + viewTopTiles * pixelSize,
    viewTilesW * pixelSize,
    viewTilesH * pixelSize
  );

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

  ctx.restore();
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

    // Экспортируем только floor — walls/overhead невидимы (флаги поведения)
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      const tileId = chunk.floor[i];
      if (tileId === -1) continue;
      const lx = i % CHUNK_SIZE;
      const ly = Math.floor(i / CHUNK_SIZE);
      const srcX = (tileId % tilesPerRow) * TILE_SIZE;
      const srcY = Math.floor(tileId / tilesPerRow) * TILE_SIZE;
      outCtx.drawImage(tilesetImg, srcX, srcY, TILE_SIZE, TILE_SIZE, baseX + lx * TILE_SIZE, baseY + ly * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  // Объекты поверх terrain
  outCtx.imageSmoothingEnabled = false;
  for (const o of state.objects || []) {
    const img = state._objectImages ? state._objectImages[o.file] : null;
    if (!img) continue;
    outCtx.drawImage(
      img,
      (o.gx - minGx) * TILE_SIZE,
      (o.gy - minGy) * TILE_SIZE,
      o.w * TILE_SIZE,
      o.h * TILE_SIZE
    );
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