import { CHUNK_SIZE } from './constants.js';
import { clearHistory } from './history.js';

let infoOverlay;

const TOOL_LABELS = {
  brush: 'КИСТЬ [B]',
  fill: 'ЗАЛИВКА [F]',
  rect: 'ПРЯМОУГОЛЬНИК [R]',
  line: 'ЛИНИЯ [L]',
  pick: 'ПИПЕТКА [I]',
};

/**
 * Инициализация UI ссылками на DOM.
 */
export function initUI(elements) {
  infoOverlay = elements.infoOverlay;
}

/**
 * Обновление текста оверлея с информацией.
 */
export function updateOverlay(state) {
  const cx = Math.floor(state.mouse.gridX / CHUNK_SIZE);
  const cy = Math.floor(state.mouse.gridY / CHUNK_SIZE);
  let lx = state.mouse.gridX % CHUNK_SIZE;
  let ly = state.mouse.gridY % CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (ly < 0) ly += CHUNK_SIZE;

  const toolLabel = TOOL_LABELS[state.toolMode] || state.toolMode.toUpperCase();
  const modeLabel = state.isEraser ? 'ЛАСТИК [E]' : `РИСОВАНИЕ`;

  infoOverlay.innerHTML = `
    Камера: X: ${Math.round(state.camera.x)}, Y: ${Math.round(state.camera.y)} | Зум: ${Math.round(state.camera.zoom * 100)}%<br>
    Курсор в мире: X: ${state.mouse.gridX}, Y: ${state.mouse.gridY}<br>
    Чанк: [${cx}, ${cy}] | Тайл в чанке: (${lx}, ${ly})<br>
    Слой: <b>${state.currentLayer.toUpperCase()}</b> | Режим: <b>${modeLabel}</b> | Инструмент: <b>${toolLabel}</b> | Кисть: <b>${state.brushSize}×${state.brushSize}</b> | Сетка: <b>${state.showGrid ? 'ВКЛ' : 'ВЫКЛ'}</b>${state.heroMode ? ' | Симуляция: <b style="color:#ffb000">ГЕРОЙ [H]</b>' : ''}
  `;
}

/**
 * Подсветка активной кнопки слоя.
 */
export function highlightLayer(layerName) {
  document.querySelectorAll('.layer-btn').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.layer-btn[data-layer="${layerName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Навешивает обработчики на кнопки слоёв.
 */
export function initLayerButtons(onLayerChange) {
  document.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      onLayerChange(layer);
    });
  });
}

/**
 * Обновить отображение размера кисти.
 */
export function updateBrushSizeUI(size) {
  const el = document.getElementById('brush-size-label');
  if (el) el.textContent = `${size}×${size}`;
}

/**
 * Обновить отображение активного инструмента.
 */
export function updateToolUI(tool) {
  document.querySelectorAll('.tool-btn').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Навешивает обработчики на кнопки инструментов.
 */
export function initToolButtons(onToolChange) {
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onToolChange(btn.dataset.tool);
    });
  });
}

/**
 * Навешивает обработчики на кнопки Brush Size (+/-).
 */
export function initBrushSizeButtons(onBrushSizeChange) {
  document.getElementById('brush-dec')?.addEventListener('click', () => {
    const newSize = Math.max(1, parseInt(document.getElementById('brush-size-label')?.textContent || '1') - 2);
    onBrushSizeChange(newSize);
  });
  document.getElementById('brush-inc')?.addEventListener('click', () => {
    const newSize = Math.min(15, parseInt(document.getElementById('brush-size-label')?.textContent || '1') + 2);
    onBrushSizeChange(newSize);
  });
}

// ========== SAVE / LOAD ==========

/**
 * Экспортирует карту в JSON-файл.
 */
export function saveMap(chunks) {
  const data = JSON.stringify(chunks, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tilemap.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Импортирует карту из JSON-файла.
 * Возвращает Promise с распарсенными чанками.
 */
export function loadMap() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const chunks = JSON.parse(ev.target.result);
          resolve(chunks);
        } catch (err) {
          reject(new Error('Ошибка парсинга JSON'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

/**
 * Навешивает обработчики на кнопки Save / Load.
 */
export function initSaveLoadButtons(stateRef) {
  document.getElementById('save-btn')?.addEventListener('click', () => {
    saveMap(stateRef.chunks);
  });

  document.getElementById('load-btn')?.addEventListener('click', async () => {
    try {
      const chunks = await loadMap();
      stateRef.chunks = chunks;
      clearHistory();
    } catch (err) {
      alert('Ошибка загрузки карты: ' + err.message);
    }
  });
}

/**
 * Навешивает обработчик на кнопку экспорта PNG.
 */
export function initExportPngButton(stateRef) {
  document.getElementById('export-png-btn')?.addEventListener('click', () => {
    // Импортируем динамически, чтобы избежать циклических зависимостей
    import('./renderer.js').then(({ exportToPng }) => {
      exportToPng(stateRef);
    });
  });
}

// ========== ERASER ==========

export function updateEraserUI(isEraser) {
  document.querySelectorAll('.eraser-btn').forEach((btn) => btn.classList.toggle('active', isEraser));
}

export function initEraserButton(onEraserChange) {
  document.querySelectorAll('.eraser-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onEraserChange(!btn.classList.contains('active'));
    });
  });
}

// ========== GRID TOGGLE ==========

export function updateGridUI(showGrid) {
  document.querySelectorAll('.grid-btn').forEach((btn) => btn.classList.toggle('active', showGrid));
}

export function initGridButton(onGridChange) {
  document.querySelectorAll('.grid-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onGridChange(!btn.classList.contains('active'));
    });
  });
}

// ========== HERO MODE ==========

export function updateHeroUI(active) {
  document.querySelectorAll('.hero-btn').forEach((btn) => btn.classList.toggle('active', active));
}

export function initHeroButton(onHeroChange) {
  document.querySelectorAll('.hero-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onHeroChange(!btn.classList.contains('active'));
    });
  });
}
