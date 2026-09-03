import { TILE_SIZE, LAYERS, WORLD_PIXEL_CHUNK, CHUNK_SIZE, TOTAL_TILES } from './constants.js';

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

  // Рисуем тайлы по слоям
  for (let cy = startY; cy <= endY; cy++) {
    for (let cx = startX; cx <= endX; cx++) {
      const chunk = state.chunks[`${cx},${cy}`];
      if (!chunk) continue;

      const chunkPixelX = cx * WORLD_PIXEL_CHUNK;
      const chunkPixelY = cy * WORLD_PIXEL_CHUNK;

      for (const layer of LAYERS) {
        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
          const tileId = chunk[layer][i];
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

  // Сетка
  drawGrid(state);

  // Границы чанков
  drawChunkBorders(state, startX, startY, endX, endY);

  // Курсор
  drawCursor(state);

  // Центр мира (0,0)
  drawOrigin();

  ctx.restore();
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

function drawCursor(state) {
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(state.mouse.gridX * TILE_SIZE, state.mouse.gridY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

function drawOrigin() {
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
}

/**
 * Обновление resize самого canvas.
 */
export function resizeCanvas() {
  const container = document.getElementById('canvas-container');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}