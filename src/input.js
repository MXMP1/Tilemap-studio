import {
  TILE_SIZE,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_FACTOR,
  CHUNK_SIZE,
} from './constants.js';
import { setTileAtWorld, getTileAtWorld } from './chunks.js';

/**
 * Инициализирует все обработчики событий мыши на canvas.
 */
export function initInput(canvas, paletteCanvas, state, actions) {
  const { onTileChanged, onPaletteChanged } = actions;

  /* ---------- Canvas (редактор) ---------- */

  canvas.addEventListener('mousedown', (e) => {
    updateMouseCoords(canvas, state, e);

    if (e.button === 1) {
      // Колесико — Pan
      state.isPanning = true;
      e.preventDefault();
    } else if (e.button === 0) {
      // ЛКМ — Рисование
      state.isDrawing = true;
      setTileAtWorld(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer, state.selectedTileId);
    } else if (e.button === 2) {
      // ПКМ — Стирание
      state.isDrawing = true;
      setTileAtWorld(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer, -1);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
      state.camera.x -= e.movementX / state.camera.zoom;
      state.camera.y -= e.movementY / state.camera.zoom;
    }

    updateMouseCoords(canvas, state, e);

    if (state.isDrawing) {
      const tileId = (e.buttons & 1) ? state.selectedTileId : -1;
      setTileAtWorld(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
    }
  });

  window.addEventListener('mouseup', () => {
    state.isPanning = false;
    state.isDrawing = false;
  });

  // Отключаем контекстное меню
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Зум колесиком ---------- */

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const oldZoom = state.camera.zoom;

    if (e.deltaY < 0) {
      state.camera.zoom = Math.min(state.camera.zoom * ZOOM_FACTOR, ZOOM_MAX);
    } else {
      state.camera.zoom = Math.max(state.camera.zoom / ZOOM_FACTOR, ZOOM_MIN);
    }

    // Фокус зума в точку курсора
    state.camera.x = state.mouse.worldX - (state.mouse.x / state.camera.zoom);
    state.camera.y = state.mouse.worldY - (state.mouse.y / state.camera.zoom);
  });

  /* ---------- Палитра ---------- */

  paletteCanvas.addEventListener('click', (e) => {
    const rect = paletteCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);

    const tilesPerRow = Math.floor(paletteCanvas.width / TILE_SIZE);
    const totalTiles = tilesPerRow * Math.floor(paletteCanvas.height / TILE_SIZE);
    const clickedId = ty * tilesPerRow + tx;

    if (clickedId < totalTiles) {
      state.selectedTileId = clickedId;
      onPaletteChanged(state.selectedTileId);
    }
  });

  /* ---------- Клавиатура ---------- */

  document.addEventListener('keydown', (e) => {
    // Цифры 1,2,3 для переключения слоёв
    if (e.key === '1') onTileChanged('floor');
    else if (e.key === '2') onTileChanged('walls');
    else if (e.key === '3') onTileChanged('overhead');
    // E — пипетка (eyedropper)
    else if (e.key === 'e' || e.key === 'E') {
      const tileId = getTileAtWorld(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer);
      if (tileId !== -1) {
        state.selectedTileId = tileId;
        onPaletteChanged(state.selectedTileId);
      }
    }
  });
}

/**
 * Обновляет mouse-координаты в state на основе события.
 */
function updateMouseCoords(canvas, state, e) {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = e.clientX - rect.left;
  state.mouse.y = e.clientY - rect.top;

  state.mouse.worldX = (state.mouse.x / state.camera.zoom) + state.camera.x;
  state.mouse.worldY = (state.mouse.y / state.camera.zoom) + state.camera.y;

  state.mouse.gridX = Math.floor(state.mouse.worldX / TILE_SIZE);
  state.mouse.gridY = Math.floor(state.mouse.worldY / TILE_SIZE);
}