import { CHUNK_SIZE, TILE_SIZE } from './constants.js';
import { clearHistory } from './history.js';
import { sanitizeObjects } from './objects.js';
import { objectCat, CAT_ROAD, CAT_ENVIRONMENT } from './objectcats.js';

let infoOverlay;

// Подписи категорий объектов (подразделы вкладки «Объекты»)
const CAT_LABELS = {
  [CAT_ROAD]: 'Дороги (плоские, всегда проходимы)',
  [CAT_ENVIRONMENT]: 'Окружение (низ — блок, верх — перекрытие)',
};
// Порядок категорий в палитре
const CAT_ORDER = [CAT_ROAD, CAT_ENVIRONMENT];

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
    Слой: <b>${LAYER_LABELS[state.currentLayer] || state.currentLayer.toUpperCase()}</b> | Режим: <b>${modeLabel}</b> | Инструмент: <b>${toolLabel}</b> | Кисть: <b>${state.brushSize}×${state.brushSize}</b> | Сетка: <b>${state.showGrid ? 'ВКЛ' : 'ВЫКЛ'}</b>${state.heroMode ? ' | Симуляция: <b style="color:#ffb000">ГЕРОЙ [H]</b>' + (state.seeThrough ? ' | <b style="color:#00ccff">Сквозь перекрытия [T]</b>' : '') : ''}${extra}
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
 * Формат v3 (этап 5): { version: 3, tilesets: [{file,start,count}], chunks, objects }.
 * Глобальные id тайлов = start + локальный id внутри тайлсета; start/count
 * фиксируются при сохранении, поэтому изменения картинок тайлсетов (добавление
 * рядов) не «съезжают» на старых картах. Файлы v2 (этап 4) и v1–3 читаются.
 */
export function saveMap(state) {
  const tilesets = (state._mapTilesets || []).map((ts) => ({
    file: ts.file,
    start: ts.start,
    count: ts.count && !ts.img ? ts.count : ts.total,
  }));
  const data = {
    version: 3,
    tilesets,
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
 * Список тайлсетов из РЕЕСТРА (state._tilesets — загруженные картинки) со
 * стартовыми id: start[i+1] = start[i] + total[i] (диапазоны без дырок).
 */
export function freshMapTilesets(defs) {
  let start = 0;
  return (defs || []).map((d) => {
    const ts = { file: d.file, label: d.label, img: d.img, tpr: d.tpr, total: d.total, start };
    start += d.total;
    return ts;
  });
}

/**
 * Восстанавливает state._mapTilesets по данным карты v3:
 *  - записи файла (сохранённые start/count) кладутся в сохранённом порядке;
 *    файл, отсутствующий в реестре, остаётся «зарезервированным» (img: null,
 *    count из файла) — его id не «переползают» на другие тайлсеты;
 *  - тайлсеты РЕЕСТРА, которых нет в карте, ДОБАВЛЯЮТСЯ в конец (начиная после
 *    последнего сохранённого диапазона) — новыми тайлсетами можно рисовать
 *    сразу после загрузки старой карты.
 */
function mapTilesetsFromSaved(state, savedList) {
  const defs = state._tilesets || [];
  const byFile = {};
  for (const d of defs) byFile[d.file] = d;

  const out = [];
  let next = 0;
  const usedFiles = new Set();
  const list = Array.isArray(savedList) ? savedList : [];
  for (const s of list) {
    if (typeof s.file !== 'string' || !Number.isFinite(Number(s.start))) continue;
    const start = Math.floor(Number(s.start));
    const count = Math.max(0, Math.floor(Number(s.count)) || 0);
    const d = byFile[s.file];
    if (d) {
      out.push({ file: d.file, label: d.label, img: d.img, tpr: d.tpr, total: d.total, count, start });
    } else {
      out.push({ file: s.file, label: s.file, img: null, tpr: 1, total: 0, count, start });
    }
    usedFiles.add(s.file);
    next = Math.max(next, start + (d ? d.total : count));
  }

  // Новые тайлсеты реестра — в конец (start после сохранённых диапазонов)
  for (const d of defs) {
    if (usedFiles.has(d.file)) continue;
    out.push({ file: d.file, label: d.label, img: d.img, tpr: d.tpr, total: d.total, count: 0, start: next });
    next += d.total;
  }

  // Валидность: если реестр пуст — остаётся только то, что было в файле
  if (out.length === 0 && list.length === 0 && defs.length > 0) return freshMapTilesets(defs);
  return out;
}

/**
 * Применяет распарсенный JSON к состоянию редактора.
 * Форматы: v3 (тайлсеты+чанки+объекты), v2 (чанки+объекты) и v1–3
 * (файл был самим объектом чанков). После загрузки перестраивает палитру
 * тайлов по восстановленному списку тайлсетов карты.
 */
function applyLoadedMap(stateRef, parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Пустой файл');

  if (parsed.version === 3 || parsed.version === 2) {
    if (!parsed.chunks || typeof parsed.chunks !== 'object') {
      throw new Error('Нет данных чанков (формат v' + parsed.version + ')');
    }
    const sanitized = sanitizeObjects(parsed.objects);
    stateRef.chunks = parsed.chunks;
    stateRef.objects = sanitized.objects;
    stateRef._nextObjectId = sanitized.maxId;
    stateRef._mapTilesets = parsed.version === 3
      ? mapTilesetsFromSaved(stateRef, parsed.tilesets)
      : freshMapTilesets(stateRef._tilesets);
  } else {
    // Старый формат: файл содержал сам объект чанков (без объектов)
    stateRef.chunks = parsed;
    stateRef.objects = [];
    stateRef._nextObjectId = 0;
    stateRef._mapTilesets = freshMapTilesets(stateRef._tilesets);
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
  // Палитра тайлов перестраивается по тайлсетам ЗАГРУЖЕННОЙ карты
  buildTerrainPalette(stateRef._mapTilesets || []);
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

/**
 * Подсветка кнопки режима героя + показ/скрытие элементов верхней панели,
 * которые имеют смысл только во время симуляции (.hero-only).
 */
export function updateHeroUI(active) {
  document.querySelectorAll('.hero-btn').forEach((btn) => btn.classList.toggle('active', active));
  document.querySelectorAll('.hero-only').forEach((el) => el.classList.toggle('visible', active));
}

export function initHeroButton(onHeroChange) {
  document.querySelectorAll('.hero-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onHeroChange(!btn.classList.contains('active'));
    });
  });
}

// ========== SEE-THROUGH (герой сквозь перекрытия) ==========

export function updateSeeThroughUI(on) {
  document.querySelectorAll('.see-through-btn').forEach((btn) => btn.classList.toggle('active', on));
}

export function initSeeThroughButton(onSeeThroughChange) {
  document.querySelectorAll('.see-through-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onSeeThroughChange(!btn.classList.contains('active'));
    });
  });
}

// ========== ПАЛИТРА ОБЪЕКТОВ (вкладка «Объекты») ==========

let objectsPalette = null; // контейнер с подразделами
let objectDefs = [];

/**
 * Строит палитру объектов по КАТЕГОРИЯМ: каждая категория — сворачиваемый
 * подраздел (заголовок + сетка превью). Порожние категории показывают
 * подсказку, куда класть PNG (например public/objects/road/).
 * @param {Array} defs - определения из objects.js ({file,label,img,w,h,cat})
 */
export function buildObjectsPalette(defs) {
  objectsPalette = objectsPalette || document.getElementById('objects-palette');
  if (!objectsPalette) return;
  objectDefs = defs;

  const byCat = {};
  for (const d of defs) {
    const cat = d.cat || objectCat(d.file);
    (byCat[cat] = byCat[cat] || []).push(d);
  }

  let html = '';
  for (const cat of CAT_ORDER) {
    const items = byCat[cat];
    if (items && items.length > 0) {
      html += `<div class="osub" data-cat="${cat}">
  <button type="button" class="osub-header open" title="Свернуть / развернуть">
    <span class="ptab-caret">▶</span>
    <span class="lbl">${CAT_LABELS[cat] || cat}</span>
  </button>
  <div class="osub-body open">
    <div class="objects-grid">${items
      .map(
        (d) => `
      <button type="button" class="obj-item" data-file="${d.file}" title="${d.label}: ${d.w}×${d.h} тайла, низ у курсора">
        <img class="obj-thumb" src="/objects/${d.file}" alt="${d.label}" />
        <span class="lbl">${d.label}</span>
        <span class="obj-size">${d.w}×${d.h}</span>
      </button>`
      )
      .join('')}
    </div>
  </div>
</div>`;
    }
  }
  // Подсказка для пустой категории дорог (её нет среди defs)
  if (!byCat[CAT_ROAD] || byCat[CAT_ROAD].length === 0) {
    html += `<div class="objects-hint">Дороги: пока пусто. Положите PNG в <code>public/objects/road/</code> и добавьте строку в реестр <code>src/objects.js</code> (файл <code>road/…</code> = категория road: без маски, всегда проходим).</div>`;
  }
  if (!byCat[CAT_ENVIRONMENT] || byCat[CAT_ENVIRONMENT].length === 0) {
    html += `<div class="objects-hint">Окружение: пока пусто. Положите PNG в <code>public/objects/environment/</code> и добавьте строку в <code>src/objects.js</code>.</div>`;
  }
  objectsPalette.innerHTML = html;
}

/**
 * Навешивает обработчики вкладки «Объекты»:
 * клик по заголовку подраздела — свернуть/развернуть;
 * клик по превью — включить режим расстановки (onObjectChosen).
 */
export function initObjectsPalette(onObjectChosen) {
  const container = document.getElementById('objects-palette');
  if (!container) return;
  container.addEventListener('click', (e) => {
    const header = e.target.closest('.osub-header');
    if (header) {
      const sub = header.closest('.osub');
      const body = sub ? sub.querySelector('.osub-body') : null;
      const isOpen = header.classList.toggle('open');
      if (body) body.classList.toggle('open', isOpen);
      return;
    }
    const item = e.target.closest('.obj-item');
    if (!item) return;
    const def = objectDefs.find((d) => d.file === item.dataset.file);
    if (def) onObjectChosen(def);
  });
}

/**
 * Подсветка активного превью во всех подразделах (режим расстановки).
 * placingFile = null — снять подсветку.
 */
export function updateObjectsPaletteUI(placingFile) {
  if (!objectsPalette) return;
  const activeFile = placingFile ? placingFile.file : null;
  for (const el of objectsPalette.querySelectorAll('.obj-item')) {
    el.classList.toggle('selected', el.dataset.file === activeFile);
  }
}

// ========== ПАЛИТРА ТАЙЛОВ (вкладка «Тайлы», подразделы по тайлсетам) ==========

let terrainGrid = null;
let terrainPickCb = null;
let terrainPickBound = false;

/**
 * Один тайл палитры — «окошко» в картинку тайлсета через background-image
 * + background-position (без лишних canvas-ов). data-tile-id = ГЛОБАЛЬНЫЙ id.
 */
function terrainItemHtml(ts, i) {
  const url = ts.img.src;
  const cols = Math.max(1, ts.tpr);
  const rows = Math.max(1, Math.floor(ts.img.height / TILE_SIZE));
  const px = cols > 1 ? (i % cols) * (100 / (cols - 1)) : 0;
  const py = rows > 1 ? Math.floor(i / cols) * (100 / (rows - 1)) : 0;
  const bgSize = `${cols * 100}% ${rows * 100}%`;
  return `<div class="palette-item" data-tile-id="${ts.start + i}" title="Тайлсет ${ts.label}: ${ts.start + i}" style="background-image:url(${url});background-size:${bgSize};background-position:${px}% ${py}%"></div>`;
}

/**
 * Строит DOM-палитру тайлов: сворачиваемый подраздел на каждый тайлсет карты
 * (state._mapTilesets) с собственным номером диапазона id. Вызывается при
 * старте и после загрузки карты (список тайлсетов карты может отличаться).
 * @param {Array} list - [{file,label,img,tpr,total,start}] тайлсеты КАРТЫ
 * @param {Function} [onTilePick] - колбэк клика по тайлу (глобальный id)
 */
export function buildTerrainPalette(list, onTilePick) {
  terrainGrid = terrainGrid || document.getElementById('palette-grid');
  if (!terrainGrid) return;
  if (onTilePick) terrainPickCb = onTilePick;

  if (!terrainPickBound) {
    terrainPickBound = true;
    terrainGrid.addEventListener('click', (e) => {
      const header = e.target.closest('.osub-header');
      if (header) {
        const sub = header.closest('.osub');
        const body = sub ? sub.querySelector('.osub-body') : null;
        const isOpen = header.classList.toggle('open');
        if (body) body.classList.toggle('open', isOpen);
        return;
      }
      const item = e.target.closest('.palette-item');
      if (!item || !terrainPickCb) return;
      const tileId = parseInt(item.dataset.tileId, 10);
      if (!Number.isNaN(tileId)) terrainPickCb(tileId);
    });
  }

  const withImg = (list || []).filter((ts) => ts.img);
  if (withImg.length === 0) {
    terrainGrid.innerHTML = '<div class="objects-hint">Нет тайлсетов: положите PNG в <code>public/tilesets/</code> и добавьте строку в реестр <code>src/tileset.js</code>.</div>';
    return;
  }

  terrainGrid.innerHTML = withImg
    .map(
      (ts) => `
  <div class="osub" data-file="${ts.file}">
    <button type="button" class="osub-header open" title="Свернуть / развернуть">
      <span class="ptab-caret">▶</span>
      <span class="lbl">${ts.label}</span>
      <span class="ptab-hint">id ${ts.start}–${ts.start + ts.total - 1}</span>
    </button>
    <div class="osub-body open">
      ${Array.from({ length: ts.total }, (_, i) => terrainItemHtml(ts, i)).join('')}
    </div>
  </div>`
    )
    .join('');
}

/**
 * Подсветка выбранного тайла по ВСЕМ подразделам (data-tile-id — глобальный).
 */
export function updateTilePaletteUI(selectedTileId) {
  if (!terrainGrid) return;
  const want = selectedTileId == null ? null : String(selectedTileId);
  for (const el of terrainGrid.querySelectorAll('.palette-item')) {
    el.classList.toggle('selected', el.dataset.tileId === want);
  }
}