import {
  TILE_SIZE,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_FACTOR,
} from './constants.js';
import { getTileAtWorld, applyBrush, floodFill, applyRect, applyLine, setTileWithHistory } from './chunks.js';
import { startRecording, stopRecording, undo, redo } from './history.js';
import { DIR_KEYS } from './hero.js';

/**
 * Инициализирует все обработчики событий мыши на canvas.
 */
export function initInput(canvas, paletteCanvas, state, actions) {
  const { onToolChanged, onBrushSizeChanged, onEraserChanged, onGridChanged, onHeroModeChanged } = actions;
  let lastGridX = null;
  let lastGridY = null;
  let startX = null;
  let startY = null;

  /* ---------- Canvas (редактор) ---------- */

  canvas.addEventListener('mousedown', (e) => {
    updateMouseCoords(canvas, state, e);

    // В режиме героя рисование мышью отключено
    if (state.heroMode) return;

    if (e.button === 1) {
      state.isPanning = true;
      e.preventDefault();
      return;
    }

    if (e.button !== 0 && e.button !== 2) return;

    const tileId = getEffectiveTileId(state, e.button);
    state.currentButton = e.button;

    if (state.toolMode === 'fill') {
      startRecording();
      floodFill(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
      stopRecording();
      return;
    }

    // Прямоугольник / Линия — запоминаем старт
    if (state.toolMode === 'rect' || state.toolMode === 'line') {
      state.isDrawing = true;
      startX = state.mouse.gridX;
      startY = state.mouse.gridY;
      state.previewStart = { gx: startX, gy: startY };
      state.previewEnd = { gx: startX, gy: startY };
      return;
    }

    // Обычная кисть
    state.isDrawing = true;
    lastGridX = state.mouse.gridX;
    lastGridY = state.mouse.gridY;
    startRecording();
    applyBrush(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId, state.brushSize);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
      state.camera.x -= e.movementX / state.camera.zoom;
      state.camera.y -= e.movementY / state.camera.zoom;
    }

    updateMouseCoords(canvas, state, e);

    // Превью для rect/line
    if (state.isDrawing && (state.toolMode === 'rect' || state.toolMode === 'line')) {
      state.previewEnd = { gx: state.mouse.gridX, gy: state.mouse.gridY };
      return;
    }

    // Рисование кистью при зажатой кнопке
    if (state.isDrawing && state.toolMode === 'brush') {
      const tileId = (e.buttons & 1) && !state.isEraser ? state.selectedTileId : -1;

      if (state.mouse.gridX !== lastGridX || state.mouse.gridY !== lastGridY) {
        // Если зажат Shift — рисуем линию от последней точки
        if (e.shiftKey) {
          startRecording();
          applyLine(state, lastGridX, lastGridY, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
          stopRecording();
          lastGridX = state.mouse.gridX;
          lastGridY = state.mouse.gridY;
        } else {
          lastGridX = state.mouse.gridX;
          lastGridY = state.mouse.gridY;
          applyBrush(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId, state.brushSize);
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.isDrawing && (state.toolMode === 'rect' || state.toolMode === 'line')) {
      const tileId = state.currentButton === 0 && !state.isEraser ? state.selectedTileId : -1;

      startRecording();
      if (state.toolMode === 'rect') {
        applyRect(state, startX, startY, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
      } else {
        applyLine(state, startX, startY, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
      }
      stopRecording();

      startX = null;
      startY = null;
      state.previewStart = null;
      state.previewEnd = null;
    }

    state.isPanning = false;
    state.isDrawing = false;
    stopRecording();
    lastGridX = null;
    lastGridY = null;
  });

  // Отключаем контекстное меню
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Зум колесиком ---------- */

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (e.deltaY < 0) {
      state.camera.zoom = Math.min(state.camera.zoom * ZOOM_FACTOR, ZOOM_MAX);
    } else {
      state.camera.zoom = Math.max(state.camera.zoom / ZOOM_FACTOR, ZOOM_MIN);
    }

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
      actions.onPaletteChanged(state.selectedTileId);
    }
  });

  /* ---------- Клавиатура ---------- */

  document.addEventListener('keydown', (e) => {
    // ===== Режим героя: WASD-движение, выход по H / Escape =====
    if (state.heroMode) {
      const heroDir = DIR_KEYS[e.code];
      if (heroDir) {
        e.preventDefault();
        state.hero.dir = heroDir;
        return;
      }
      if (e.code === 'KeyH' || e.code === 'Escape') {
        onHeroModeChanged(false);
        return;
      }
      // Остальные клавиши в симуляции игнорируем
      return;
    }

    // Включение режима героя по H
    if (e.code === 'KeyH') {
      onHeroModeChanged(true);
      return;
    }

    // Слои
    if (e.key === '1') actions.onTileChanged('floor');
    else if (e.key === '2') actions.onTileChanged('walls');
    else if (e.key === '3') actions.onTileChanged('overhead');
    // Пипетка
    // Пипетка
    else if (e.key === 'i' || e.key === 'I') {
      const tileId = getTileAtWorld(state, state.mouse.gridX, state.mouse.gridY, state.currentLayer);
      if (tileId !== -1) {
        state.selectedTileId = tileId;
        actions.onPaletteChanged(state.selectedTileId);
      }
    }
    // Ластик (toggle)
    else if (e.key === 'e' || e.key === 'E') {
      state.isEraser = !state.isEraser;
      onEraserChanged(state.isEraser);
    }
    // Инструменты
    else if (e.key === 'b' || e.key === 'B') {
      state.toolMode = 'brush';
      onToolChanged('brush');
    }
    else if (e.key === 'f' || e.key === 'F') {
      state.toolMode = state.toolMode === 'fill' ? 'brush' : 'fill';
      onToolChanged(state.toolMode);
    }
    // Сетка (toggle)
    else if (e.key === 'g' || e.key === 'G') {
      state.showGrid = !state.showGrid;
      onGridChanged(state.showGrid);
    }
    else if (e.key === 'r' || e.key === 'R') {
      state.toolMode = 'rect';
      onToolChanged('rect');
    }
    else if (e.key === 'l' || e.key === 'L') {
      state.toolMode = 'line';
      onToolChanged('line');
    }
    // Размер кисти
    else if (e.key === '[') {
      state.brushSize = Math.max(1, state.brushSize - 2);
      onBrushSizeChanged(state.brushSize);
    }
    else if (e.key === ']') {
      state.brushSize = Math.min(15, state.brushSize + 2);
      onBrushSizeChanged(state.brushSize);
    }
    // Undo / Redo
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo(state);
    }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo(state);
    }
  });

  // Отпускание WASD — герой останавливается
  document.addEventListener('keyup', (e) => {
    if (!state.heroMode || !state.hero) return;
    const releasedDir = DIR_KEYS[e.code];
    if (releasedDir && state.hero.dir === releasedDir) {
      state.hero.dir = null;
    }
  });
}

/**
 * Возвращает tileId для операции: в режиме ластика или ПКМ → -1, иначе выбранный тайл.
 */
function getEffectiveTileId(state, button) {
  return (button === 0 && !state.isEraser) ? state.selectedTileId : -1;
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