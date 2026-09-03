import { TILE_SIZE } from './constants.js';
import { loadTileset, getTilesetInfo } from './tileset.js';
import { initRenderer, buildPalette, drawPalette, render, resizeCanvas } from './renderer.js';
import { initInput } from './input.js';
import { updateHero, spawnHero } from './hero.js';
import { initUI, updateOverlay, highlightLayer, initLayerButtons, updateBrushSizeUI, updateToolUI, initToolButtons, initBrushSizeButtons, initSaveLoadButtons, initExportPngButton, initEraserButton, updateEraserUI, initGridButton, updateGridUI, initHeroButton, updateHeroUI } from './ui.js';
import { clearHistory } from './history.js';

// --- Состояние редактора ---
const state = {
  currentLayer: 'floor',
  selectedTileId: 0,
  brushSize: 1,
  toolMode: 'brush', // 'brush' | 'fill' | 'rect' | 'line'
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
  hero: { px: 0, py: 0, tx: 0, ty: 0, dir: null },
  _tilesetImg: null,
  _tilesPerRow: 0,
};

// --- DOM-элементы ---
const canvas = document.getElementById('editor');
const ctx = canvas.getContext('2d');
const paletteGrid = document.getElementById('palette-grid');
const infoOverlay = document.getElementById('info-overlay');

const elements = { canvas, ctx, paletteGrid, infoOverlay };

// --- Actions (колбэки для модулей) ---
const actions = {
  onTileChanged(layer) {
    state.currentLayer = layer;
    highlightLayer(layer);
  },
  onPaletteChanged(tileId) {
    state.selectedTileId = tileId;
    const { tilesPerRow } = getTilesetInfo(tilesetImg);
    drawPalette(tilesetImg, tilesPerRow, state.selectedTileId);
  },
  onToolChanged(tool) {
    state.toolMode = tool;
    updateToolUI(tool);
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
  onHeroModeChanged(active) {
    state.heroMode = active;
    updateHeroUI(active);
    if (active) {
      // Спавним героя под курсором (или ближайшей свободной клетке)
      spawnHero(state, state.mouse.gridX, state.mouse.gridY);
    }
  },
};

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
// Экспорт PNG — переустанавливаем обработчик с ссылками на изображение
// (ui.js уже делает динамический импорт renderer.js)
highlightLayer('floor');

// --- Загрузка тайлсета ---
let tilesetImg = null;
let tilesPerRow = 0;

loadTileset().then((img) => {
  tilesetImg = img;
  state._tilesetImg = img;
  const info = getTilesetInfo(img);
  tilesPerRow = info.tilesPerRow;
  state._tilesPerRow = tilesPerRow;

  // Настраиваем палитру (DOM-сетка тайлов, переносится по ширине)
  buildPalette(img, tilesPerRow, state.selectedTileId);

  // Настраиваем canvas
  resizeCanvas();
  state.camera.x = -canvas.width / 2;
  state.camera.y = -canvas.height / 2;

  // Инициализация ввода после готовности тайлсета
  initInput(canvas, paletteGrid, state, actions);

  // Обновляем UI стартовых значений
  updateBrushSizeUI(state.brushSize);
  updateToolUI(state.toolMode);

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

  render(state, tilesetImg, tilesPerRow);
  updateOverlay(state);
  requestAnimationFrame(animate);
}