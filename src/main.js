import { loadTileset, getTilesetInfo } from './tileset.js';
import { initRenderer, drawPalette, render, resizeCanvas } from './renderer.js';
import { initInput } from './input.js';
import { initUI, updateOverlay, highlightLayer, initLayerButtons, updateBrushSizeUI, updateToolUI, initToolButtons, initBrushSizeButtons, initSaveLoadButtons, initExportPngButton, initEraserButton, updateEraserUI, initGridButton, updateGridUI } from './ui.js';
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
  _tilesetImg: null,
  _tilesPerRow: 0,
};

// --- DOM-элементы ---
const canvas = document.getElementById('editor');
const ctx = canvas.getContext('2d');
const paletteCanvas = document.getElementById('palette-canvas');
const paletteCtx = paletteCanvas.getContext('2d');
const infoOverlay = document.getElementById('info-overlay');

const elements = { canvas, ctx, paletteCanvas, paletteCtx, infoOverlay };

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

  // Настраиваем палитру
  paletteCanvas.width = img.width;
  paletteCanvas.height = img.height;
  drawPalette(img, tilesPerRow, state.selectedTileId);

  // Настраиваем canvas
  resizeCanvas();
  state.camera.x = -canvas.width / 2;
  state.camera.y = -canvas.height / 2;

  // Инициализация ввода после готовности тайлсета
  initInput(canvas, paletteCanvas, state, actions);

  // Обновляем UI стартовых значений
  updateBrushSizeUI(state.brushSize);
  updateToolUI(state.toolMode);

  // Запуск цикла анимации
  animate();
});

// --- Подписка на resize ---
window.addEventListener('resize', resizeCanvas);

// --- Анимационный цикл ---
function animate() {
  render(state, tilesetImg, tilesPerRow);
  updateOverlay(state);
  requestAnimationFrame(animate);
}