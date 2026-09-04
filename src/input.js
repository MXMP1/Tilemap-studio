import {
  TILE_SIZE,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_FACTOR,
  FLAG_TILE_ID,
} from './constants.js';
import { getTileAtWorld, applyBrush, floodFill, applyRect, applyLine, setTileWithHistory } from './chunks.js';
import { startRecording, stopRecording, undo, redo } from './history.js';
import { objectAt, overlapsObjects, placeObject, moveObject, deleteObject } from './objects.js';
import { updateObjectsPaletteUI } from './ui.js';
import { DIR_KEYS } from './hero.js';

/**
 * Инициализирует все обработчики событий мыши на canvas.
 */
export function initInput(canvas, paletteGrid, state, actions) {
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

    // Режим расстановки объектов: ЛКМ — поставить (можно несколько подряд),
    // ПКМ — отменить расстановку. Призрак рисуется в renderer (drawGhosts).
    if (state.placingFile) {
      if (e.button === 2) {
        state.placingFile = null;
        updateObjectsPaletteUI(null);
        return;
      }
      if (e.button === 0) {
        startRecording();
        placeObject(state, state.placingFile, state.mouse.gridX, state.mouse.gridY);
        stopRecording();
      }
      return;
    }

    // Инструмент «Выбор»: ЛКМ по объекту — выделить и начать перенос (drag),
    // клик в пустое место — снять выделение. Кисть здесь не работает.
    if (state.toolMode === 'select') {
      if (e.button === 0) {
        const inst = objectAt(state, state.mouse.gridX, state.mouse.gridY);
        if (inst) {
          state.selectedObjectId = inst.id;
          // «Захват» объекта: смещение курсора от опорной точки низа объекта.
          // При drag опорная точка следует за курсором с этим смещением —
          // объект не «прыгает» при захвате за любую клетку.
          const anchorX = inst.gx + Math.floor((inst.w - 1) / 2);
          const anchorY = inst.gy + inst.h - 1;
          state.objDrag = {
            id: inst.id,
            file: inst.file,
            w: inst.w,
            h: inst.h,
            ox: anchorX - state.mouse.gridX,
            oy: anchorY - state.mouse.gridY,
            gx: inst.gx,
            gy: inst.gy,
            valid: true,
          };
        } else {
          state.selectedObjectId = null;
        }
      }
      return;
    }

    // Пипетка: один клик по клетке — взять тайл, затем вернуть кисть
    if (state.toolMode === 'pick') {
      if (e.button === 0 && pickTileAtCursor(state, actions)) {
        state.toolMode = 'brush';
        onToolChanged('brush');
      }
      return;
    }

    const tileId = getEffectiveTileId(state, e.button);
    state.currentButton = e.button;

    // Ничего не выбрано (и это не ластик) — рисовать нечем, клик игнорируем.
    // ВАЖНО: null НЕ превращаем в -1, иначе ластик сотрёт клетки без спроса.
    if (tileId === null) return;

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

    // Перенос объекта: призрак идёт за курсором (опорная точка — низ объекта)
    if (state.objDrag) {
      const d = state.objDrag;
      const bx = state.mouse.gridX + d.ox;
      const by = state.mouse.gridY + d.oy;
      d.gx = bx - Math.floor((d.w - 1) / 2);
      d.gy = by - d.h + 1;
      d.valid = !overlapsObjects(state, d.gx, d.gy, d.w, d.h, d.id);
      return;
    }

    // Превью для rect/line
    if (state.isDrawing && (state.toolMode === 'rect' || state.toolMode === 'line')) {
      state.previewEnd = { gx: state.mouse.gridX, gy: state.mouse.gridY };
      return;
    }

    // Рисование кистью при зажатой кнопке
    if (state.isDrawing && state.toolMode === 'brush') {
      const tileId = getEffectiveTileId(state, e.buttons & 1 ? 0 : 2);

      // Выбор тайла исчез во время рисования — двигаемся дальше, не рисуем
      if (tileId === null) {
        lastGridX = state.mouse.gridX;
        lastGridY = state.mouse.gridY;
        return;
      }

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
    // Завершение переноса объекта: ставим на новое место, если оно свободно
    if (state.objDrag) {
      const d = state.objDrag;
      state.objDrag = null;
      const inst = state.objects.find((o) => o.id === d.id);
      if (inst && d.valid && (d.gx !== inst.gx || d.gy !== inst.gy)) {
        startRecording();
        moveObject(state, inst, d.gx, d.gy);
        stopRecording();
      }
      state.isPanning = false;
      state.isDrawing = false;
      return;
    }

    if (state.isDrawing && (state.toolMode === 'rect' || state.toolMode === 'line')) {
      const tileId = getEffectiveTileId(state, state.currentButton);

      // Прямоугольник/линия без выбранного тайла не рисуются (но не стирают!)
      if (tileId !== null) {
        startRecording();
        if (state.toolMode === 'rect') {
          applyRect(state, startX, startY, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
        } else {
          applyLine(state, startX, startY, state.mouse.gridX, state.mouse.gridY, state.currentLayer, tileId);
        }
        stopRecording();
      }

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

  paletteGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (!item || !paletteGrid.contains(item)) return;
    const tileId = parseInt(item.dataset.tileId, 10);
    if (Number.isNaN(tileId)) return;
    state.selectedTileId = tileId;
    // Тайл из палитры = рисование ТЕКСТУРЫ terrain → активный слой floor
    if (state.currentLayer !== 'floor') {
      state.currentLayer = 'floor';
      actions.onTileChanged('floor');
    }
    actions.onPaletteChanged(tileId);
  });

  /* ---------- Клавиатура ---------- */

  document.addEventListener('keydown', (e) => {
    // ===== Режим героя: WASD плавное движение, выход по H / Escape =====
    if (state.heroMode) {
      const heroDir = DIR_KEYS[e.code];
      if (heroDir) {
        e.preventDefault();
        state.hero.keys[heroDir] = true;
        return;
      }
      if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey) {
        // «Сквозь перекрытия» — переключатель, доступный и в симуляции
        actions.onSeeThroughChanged(!state.seeThrough);
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
    // Пипетка (выбор инструмента; клик по карте возьмёт тайл)
    else if (e.key === 'i' || e.key === 'I') {
      state.toolMode = 'pick';
      onToolChanged('pick');
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
    // «Сквозь перекрытия» [T] — эффект заметен в режиме героя, но переключать
    // можно и в редакторе (состояние сохраняется при входе в симуляцию)
    else if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey) {
      actions.onSeeThroughChanged(!state.seeThrough);
    }
    else if (e.key === 'r' || e.key === 'R') {
      state.toolMode = 'rect';
      onToolChanged('rect');
    }
    else if (e.key === 'l' || e.key === 'L') {
      state.toolMode = 'line';
      onToolChanged('line');
    }
    // Инструмент «Выбор» (V): смена инструмента отменяет расстановку объектов
    else if (e.key === 'v' || e.key === 'V') {
      state.toolMode = 'select';
      onToolChanged('select');
    }
    // Отмена: сначала перенос, потом расстановка, потом выделение
    else if (e.key === 'Escape') {
      if (state.objDrag) {
        state.objDrag = null;
        state.isDrawing = false;
      } else if (state.placingFile) {
        state.placingFile = null;
        updateObjectsPaletteUI(null);
      } else if (state.toolMode === 'select') {
        state.selectedObjectId = null;
      }
    }
    // Удаление выделенного объекта (Delete / Backspace)
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.toolMode === 'select' && state.selectedObjectId != null) {
        const inst = state.objects.find((o) => o.id === state.selectedObjectId);
        if (inst) {
          startRecording();
          deleteObject(state, inst);
          stopRecording();
          state.selectedObjectId = null;
        }
      }
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

  // Отпускание WASD — герой отпускает направление
  document.addEventListener('keyup', (e) => {
    if (!state.heroMode || !state.hero) return;
    const heroDir = DIR_KEYS[e.code];
    if (heroDir) {
      state.hero.keys[heroDir] = false;
    }
  });
}

/**
 * Возвращает tileId для операции:
 *  - ластик или ПКМ → -1 (стирание),
 *  - слой флага (2/3) → маркер FLAG_TILE_ID (значение не важно, палитра не нужна),
 *  - ЛКМ на слое 1 без выбранного тайла → null (ничего не рисуем, НЕ стираем),
 *  - ЛКМ на слое 1 с выбранным тайлом → id тайла.
 */
function getEffectiveTileId(state, button) {
  if (button === 0 && !state.isEraser) {
    // Флаги поведения walls/overhead красятся без палитры
    if (state.currentLayer !== 'floor') return FLAG_TILE_ID;
    return state.selectedTileId; // null = ничего не выбрано
  }
  return -1;
}

/**
 * Пипетка: берёт ТЕКСТУРУ (floor) из клетки под курсором.
 * Флаги walls/overhead невидимы — их пипетка не трогает.
 * Активный слой переключается на floor (рисование тайлов).
 * @returns {boolean} true, если в клетке есть тайл
 */
function pickTileAtCursor(state, actions) {
  const { gridX, gridY } = state.mouse;
  const tileId = getTileAtWorld(state, gridX, gridY, 'floor');
  if (tileId === -1) return false;
  state.selectedTileId = tileId;
  if (state.currentLayer !== 'floor') {
    state.currentLayer = 'floor';
    actions.onTileChanged('floor');
  }
  actions.onPaletteChanged(tileId);
  return true;
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