import { CHUNK_SIZE } from './constants.js';
import { clearHistory } from './history.js';
import { sanitizeObjects } from './objects.js';

let infoOverlay;

const TOOL_LABELS = {
  select: 'ВЫБОР [V]',
  brush: 'КИСТЬ [B]',
  fill: 'ЗАЛИВКА [F]',
  rect: 'ПРЯМОУГОЛЬНИК [R]',
  line: 'ЛИНИЯ [L]',
  pick: 'ПИПЕТКА [I]',
};

// Подписи слоёв: walls/overhead — невидимые флаги поведения
const LAYER_LABELS = {
  floor: 'ТАЙЛЫ (1)',
  walls: 'БЛОК-ФЛАГ (2)',
  overhead: 'OVERHEAD-ФЛАГ (3)',
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
  const modeLabel = state.isEraser
    ? 'ЛАСТИК [E]'
    : state.toolMode === 'select'
      ? 'ВЫБОР [V]'
      : 'РИСОВАНИЕ';

  // Дополнительная строка состояния объектов (расстановка / перенос / выделение)
  let extra = '';
  if (state.placingFile) {
    const pl = state.placingFile;
    extra += `<br>Расстановка: <b style="color:#ffd54a">${pl.label || pl.file}</b> — ЛКМ ставит, ПКМ/Esc — отмена`;
  } else if (state.objDrag) {
    extra += '<br>Перенос объекта — отпустите ЛКМ (Esc — отмена)';
  } else if (state.toolMode === 'select' && state.selectedObjectId != null) {
    const inst = (state.objects || []).find((o) => o.id === state.selectedObjectId);
    if (inst) {
      const labels = state._objectLabels || {};
      const name = labels[inst.file] || inst.file;
      extra += `<br>Выбран: <b style="color:#00ccff">${name}</b> (${inst.gx}, ${inst.gy}) — Delete удалить, drag перенести`;
    }
  }

  infoOverlay.innerHTML = `
    Камера: X: ${Math.round(state.camera.x)}, Y: ${Math.round(state.camera.y)} | Зум: ${Math.round(state.camera.zoom * 100)}%<br>
    Курсор в мире: X: ${state.mouse.gridX}, Y: ${state.mouse.gridY}<br>
    Чанк: [${cx}, ${cy}] | Тайл в чанке: (${lx}, ${ly})<br>
    Слой: <b>${LAYER_LABELS[state.currentLayer] || state.currentLayer.toUpperCase()}</b> | Режим: <b>${modeLabel}</b> | Инструмент: <b>${toolLabel}</b> | Кисть: <b>${state.brushSize}×${state.brushSize}</b> | Сетка: <b>${state.showGrid ? 'ВКЛ' : 'ВЫКЛ'}</b>${state.heroMode ? ' | Симуляция: <b style="color:#ffb000">ГЕРОЙ [H]</b>' : ''}${extra}
  `;
}

/**
 * Инициализация сворачиваемых вкладок палитры (Тайлы / Объекты).
 * Клик по заголовку вкладки открывает/закрывает её содержимое.
 */
export function initPaletteTabs() {
  document.querySelectorAll('.ptab-header').forEach((header) => {
    header.addEventListener('click', () => {
      const tab = header.closest('.ptab');
      const body = tab ? tab.querySelector('.ptab-body') : null;
      const isOpen = header.classList.toggle('open');
      if (body) body.classList.toggle('open', isOpen);
    });
  });
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
 * Формат v2 (этап 4): { version: 2, chunks, objects } — объекты вместе с картой.
 * Старые файлы этапов 1–3 (просто объект чанков) читаются при загрузке.
 */
export function saveMap(state) {
  const data = {
    version: 2,
    chunks: state.chunks,
    objects: state.objects || [],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
    saveMap(stateRef);
  });

  document.getElementById('load-btn')?.addEventListener('click', async () => {
    try {
      const parsed = await loadMap();
      applyLoadedMap(stateRef, parsed);
    } catch (err) {
      alert('Ошибка загрузки карты: ' + err.message);
    }
  });
}

/**
 * Применяет распарсенный JSON к состоянию редактора.
 * Поддерживает формат v2 ({version:2, chunks, objects}) и старый формат
 * этапов 1–3 (файл был самим объектом чанков).
 */
function applyLoadedMap(stateRef, parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Пустой файл');

  if (parsed.version === 2) {
    if (!parsed.chunks || typeof parsed.chunks !== 'object') {
      throw new Error('Нет данных чанков (формат v2)');
    }
    const sanitized = sanitizeObjects(parsed.objects);
    stateRef.chunks = parsed.chunks;
    stateRef.objects = sanitized.objects;
    stateRef._nextObjectId = sanitized.maxId;
  } else {
    // Старый формат: файл содержал сам объект чанков (без объектов)
    stateRef.chunks = parsed;
    stateRef.objects = [];
    stateRef._nextObjectId = 0;
  }

  // Сбрасываем временные состояния редактора
  stateRef.placingFile = null;
  stateRef.selectedObjectId = null;
  stateRef.objDrag = null;
  stateRef.isDrawing = false;
  stateRef.previewStart = null;
  stateRef.previewEnd = null;
  clearHistory();
  updateObjectsPaletteUI(null);
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

// ========== ПАЛИТРА ОБЪЕКТОВ (вкладка «Объекты») ==========

let objectsGrid = null;
let objectDefs = [];

/**
 * Строит список превью объектов во вкладке «Объекты».
 * @param {Array} defs - определения объектов из objects.js ({file,label,img,w,h})
 */
export function buildObjectsPalette(defs) {
  objectsGrid = objectsGrid || document.getElementById('objects-grid');
  if (!objectsGrid) return;
  objectDefs = defs;

  objectsGrid.innerHTML = defs
    .map(
      (d) => `
    <button type="button" class="obj-item" data-file="${d.file}" title="${d.label}: ${d.w}×${d.h} тайла, низ у курсора">
      <img class="obj-thumb" src="/objects/${d.file}" alt="${d.label}" />
      <span class="lbl">${d.label}</span>
      <span class="obj-size">${d.w}×${d.h}</span>
    </button>`
    )
    .join('');
}

/**
 * Навешивает обработчик кликов на список объектов: клик по превью включает
 * режим расстановки (onObjectChosen).
 */
export function initObjectsPalette(onObjectChosen) {
  const grid = document.getElementById('objects-grid');
  if (!grid) return;
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.obj-item');
    if (!item) return;
    const def = objectDefs.find((d) => d.file === item.dataset.file);
    if (def) onObjectChosen(def);
  });
}

/**
 * Подсветка активного превью в списке объектов (режим расстановки).
 * placingFile = null — снять подсветку.
 */
export function updateObjectsPaletteUI(placingFile) {
  if (!objectsGrid) return;
  const activeFile = placingFile ? placingFile.file : null;
  for (const el of objectsGrid.children) {
    el.classList.toggle('selected', el.dataset.file === activeFile);
  }
}