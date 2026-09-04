import { TILE_SIZE } from './constants.js';
import { loadTilesets } from './tileset.js';
import { initRenderer, render, resizeCanvas } from './renderer.js';
import { initInput } from './input.js';
import { updateHero, spawnHero } from './hero.js';
import { initUI, updateOverlay, highlightLayer, initLayerButtons, updateBrushSizeUI, updateToolUI, initToolButtons, initBrushSizeButtons, initSaveLoadButtons, initExportPngButton, initEraserButton, updateEraserUI, initGridButton, updateGridUI, initHeroButton, updateHeroUI, initSeeThroughButton, updateSeeThroughUI, initPaletteTabs, buildObjectsPalette, initObjectsPalette, updateObjectsPaletteUI, buildTerrainPalette, updateTilePaletteUI, freshMapTilesets } from './ui.js';
import { clearHistory } from './history.js';
import { loadObjects } from './objects.js';

// --- Состояние редактора ---
const state = {
  currentLayer: 'floor',
  // null = ничего не выбрано (курсор — пустой квадрат); кисть ничего не рисует
  selectedTileId: null,
  // --- Объекты (этап 4) ---
  objects: [],            // инстансы: { id, file, w, h, gx, gy } (gx,gy — ВЕРХ-ЛЕВЫЙ тайл)
  _objectImages: {},      // file → HTMLImageElement (рендер / экспорт)
  _objectDefs: [],        // определения из objects.js ({file,label,img,w,h})
  _objectLabels: {},      // file → label (оверлей)
  _nextObjectId: 0,       // счётчик id инстансов (сохраняется как есть при load)
  placingFile: null,      // выбранный в палитре объект → режим расстановки
  selectedObjectId: null, // выделенный инстанс (инструмент «Выбор»)
  objDrag: null,          // перенос: {id,file,w,h,gx,gy,valid} (призрак)
  brushSize: 1,
  toolMode: 'brush', // 'brush' | 'fill' | 'rect' | 'line' | 'select'
  chunks: {},
  camera: { x: 0, y: 0, zoom: 1.0 },
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0, gridX: 0, gridY: 0 },
  isPanning: false,
  isDrawing: false,
  previewStart: null,
  previewEnd: null,
  currentButton: 0,
  isEraser: false,
  showGrid: true,
  heroMode: false,
  // «Сквозь перекрытия» [T]: объект или overhead-тайл, который сейчас накрывает
  // героя, рисуется полупрозрачно, чтобы персонаж был виден. Работает только в
  // режиме героя; значение переживает выход из симуляции (не сбрасывается).
  seeThrough: false,
  hero: { px: 0, py: 0, keys: { up: false, down: false, left: false, right: false } },
  // --- Тайлсеты (этап 5, мульти-тайлсет) ---
  _tilesets: [],       // реестр: загруженные defs [{file,label,img,tpr,total}]
  _mapTilesets: [],    // тайлсеты ТЕКУЩЕЙ карты: [{file,label,img,tpr,total,start}] —
                       // по ним раскладываются ГЛОБАЛЬНЫЕ id тайлов (рендер,
                       // мини-карта, экспорт, палитра). Формат v3 сохраняет
                       // их start/count — старые карты не «съезжают».
};

// --- DOM-элементы ---
const canvas = document.getElementById('editor');
const ctx = canvas.getContext('2d');
const infoOverlay = document.getElementById('info-overlay');

const elements = { canvas, ctx, infoOverlay };

// --- Actions (колбэки для модулей) ---
const actions = {
  onTileChanged(layer) {
    cancelPlacing(); // смена слоя — флаги/тайлы красить, расстановку завершаем
    state.currentLayer = layer;
    highlightLayer(layer);
  },
  onPaletteChanged(tileId) {
    // Клик по тайлу terrain / пипетка: выбор глобального id (этап 5 —
    // палитра из нескольких тайлсетов, id уникальны в пределах карты)
    cancelPlacing();
    state.selectedTileId = tileId;
    updateTilePaletteUI(tileId);
  },
  onTilePaletteClicked(tileId) {
    // Тайл из палитры = рисование ТЕКСТУРЫ terrain → активный слой floor
    if (state.currentLayer !== 'floor') {
      state.currentLayer = 'floor';
      highlightLayer('floor');
    }
    actions.onPaletteChanged(tileId);
  },
  onToolChanged(tool) {
    state.toolMode = tool;
    cancelPlacing(); // смена инструмента отменяет режим расстановки
    if (tool === 'select') {
      // «Выбор» не красит — снимаем ластик, чтобы не путался
      state.isEraser = false;
      updateEraserUI(false);
    }
    updateToolUI(tool);
    updateCanvasCursor();
  },
  onObjectChosen(def) {
    if (state.heroMode) return;
    // Повторный клик по тому же превью — снять режим расстановки
    if (state.placingFile && state.placingFile.file === def.file) {
      cancelPlacing();
      return;
    }
    state.isEraser = false;
    updateEraserUI(false);
    state.selectedObjectId = null; // призрак вместо рамки выделения
    state.isDrawing = false;
    state.previewStart = null;
    state.previewEnd = null;
    state.toolMode = 'select';
    updateToolUI('select');
    state.placingFile = def;
    updateObjectsPaletteUI(def);
    updateCanvasCursor();
  },
  onBrushSizeChanged(size) {
    state.brushSize = size;
    updateBrushSizeUI(size);
  },
  onEraserChanged(isEraser) {
    state.isEraser = isEraser;
    updateEraserUI(isEraser);
  },
  onGridChanged(showGrid) {
    state.showGrid = showGrid;
    updateGridUI(showGrid);
  },
  onSeeThroughChanged(on) {
    state.seeThrough = on;
    updateSeeThroughUI(on);
  },
  onHeroModeChanged(active) {
    state.heroMode = active;
    // В симуляции редакторские состояния не нужны
    cancelPlacing();
    state.selectedObjectId = null;
    state.objDrag = null;
    state.isDrawing = false;
    state.previewStart = null;
    state.previewEnd = null;
    updateHeroUI(active);
    if (active) {
      // Спавним героя под курсором (или ближайшей свободной клетке)
      spawnHero(state, state.mouse.gridX, state.mouse.gridY);
    }
    updateCanvasCursor();
  },
};

/** Снять режим расстановки (если активен) и подсветку в палитре объектов. */
function cancelPlacing() {
  if (!state.placingFile) return;
  state.placingFile = null;
  updateObjectsPaletteUI(null);
}

/** Курсор canvas: «Выбор» и герой — обычная стрелка, рисование — крест. */
function updateCanvasCursor() {
  canvas.style.cursor = state.heroMode || state.toolMode === 'select' ? 'default' : 'crosshair';
}

// --- Инициализация подсистем ---
initRenderer(elements);
initUI(elements);
initLayerButtons(actions.onTileChanged);
initToolButtons(actions.onToolChanged);
initBrushSizeButtons(actions.onBrushSizeChanged);
initSaveLoadButtons(state);
initExportPngButton(state);
initEraserButton(actions.onEraserChanged);
initGridButton(actions.onGridChanged);
initHeroButton(actions.onHeroModeChanged);
initSeeThroughButton(actions.onSeeThroughChanged);
updateSeeThroughUI(state.seeThrough);
initPaletteTabs();
initObjectsPalette(actions.onObjectChosen);
// Экспорт PNG — переустанавливаем обработчик с ссылками на изображение
// (ui.js уже делает динамический импорт renderer.js)
highlightLayer('floor');

// --- Загрузка тайлсетов (реестр, этап 5) ---

// Предзагрузка объектов: картинки для рендера + превью в палитре.
// Идёт параллельно с тайлсетами — ввод пользователя начнётся позже.
loadObjects().then(({ defs, images }) => {
  state._objectDefs = defs;
  state._objectImages = images;
  const labels = {};
  for (const d of defs) labels[d.file] = d.label;
  state._objectLabels = labels;
  buildObjectsPalette(defs);
});

loadTilesets().then(({ defs }) => {
  state._tilesets = defs;
  // Тайлсеты текущей карты изначально = весь реестр (диапазоны подряд)
  state._mapTilesets = freshMapTilesets(defs);

  // Палитра тайлов: подразделы по тайлсетам (клик → глобальный id)
  buildTerrainPalette(state._mapTilesets, actions.onTilePaletteClicked);
  updateTilePaletteUI(state.selectedTileId);

  // Настраиваем canvas
  resizeCanvas();
  state.camera.x = -canvas.width / 2;
  state.camera.y = -canvas.height / 2;

  // Инициализация ввода после готовности тайлсетов
  initInput(canvas, state, actions);

  // Обновляем UI стартовых значений
  updateBrushSizeUI(state.brushSize);
  updateToolUI(state.toolMode);
  updateCanvasCursor();

  // Запуск цикла анимации
  animate();
});

// --- Подписка на resize ---
window.addEventListener('resize', resizeCanvas);

// --- Анимационный цикл ---
let lastFrameTime = 0;
function animate(timestamp) {
  const dt = lastFrameTime ? Math.min(0.05, (timestamp - lastFrameTime) / 1000) : 0.016;
  lastFrameTime = timestamp;

  // Режим героя: движение + камера следует за героем
  if (state.heroMode) {
    updateHero(state, dt);
    state.camera.x = state.hero.px + TILE_SIZE / 2 - canvas.width / (2 * state.camera.zoom);
    state.camera.y = state.hero.py + TILE_SIZE / 2 - canvas.height / (2 * state.camera.zoom);
  }

  render(state);
  updateOverlay(state);
  requestAnimationFrame(animate);
}