/**
 * ОБЪЕКТЫ — отдельные картинки (декор/здания) на сетке (кратно 32px).
 *
 * Модель поведения:
 *  - footprint объекта = прямоугольник w×h тайлов (gx, gy — ВЕРХНИЙ-ЛЕВЫЙ тайл);
 *  - типовая маска при расстановке: НИЖНИЙ ряд = флаг walls (не пройти),
 *    остальные клетки = флаг overhead (герой проходит «за» объектом и прячется);
 *  - поведение живёт в чанках (walls/overhead — невидимые флаги), поэтому
 *    коллизии героя и рендер-сортировка работают автоматически;
 *  - инстанс = { id, file, w, h, gx, gy }; перенос/удаление переносят/снимают
 *    флаги footprint (редактирование маски — обычная краска слоёв 2/3).
 *
 * Операции объектов пишутся в ту же историю undo/redo, что и тайлы:
 * каждая операция = снимок списка объектов (recordObjectOp) + изменения флагов.
 */

import { EMPTY_TILE, FLAG_TILE_ID, TILE_SIZE } from './constants.js';
import { getTileAtWorld, setTileWithHistory } from './chunks.js';
import { recordObjectOp } from './history.js';

// Файлы объектов: новые PNG положи в public/objects/ и добавь строку сюда.
const OBJECT_FILES = [
  { file: 'barrel.png', label: 'Бочка' },
  { file: 'clock.png', label: 'Часовая башня' },
  { file: 'ligther.png', label: 'Фонарь' },
  { file: 'tree.png', label: 'Дерево' },
];

/**
 * Предзагружает картинки объектов и собирает определения (w×h в тайлах).
 * @returns {Promise<{defs: Array, images: Object}>}
 */
export function loadObjects() {
  return Promise.all(
    OBJECT_FILES.map(
      (entry) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const w = Math.max(1, Math.round(img.naturalWidth / TILE_SIZE));
            const h = Math.max(1, Math.round(img.naturalHeight / TILE_SIZE));
            resolve({ ...entry, img, w, h });
          };
          img.onerror = () => resolve({ ...entry, img: null, w: 1, h: 1 });
          img.src = `/objects/${entry.file}`;
        })
    )
  ).then((defs) => {
    const ok = defs.filter((d) => d.img);
    const images = {};
    for (const d of ok) images[d.file] = d.img;
    return { defs: ok, images };
  });
}

/** Следующий уникальный id инстанса (монотонный счётчик в state). */
function nextId(state) {
  state._nextObjectId = (state._nextObjectId || 0) + 1;
  return state._nextObjectId;
}

/**
 * Проверка и нормализация списка объектов (загрузка JSON).
 * Кривые записи отбрасываются; инстансам без id присваиваются новые (после
 * максимального в файле).
 * @returns {{objects: Array, maxId: number}}
 */
export function sanitizeObjects(list) {
  const src = Array.isArray(list) ? list : [];
  const out = [];
  let maxId = 0;

  for (const o of src) {
    if (!o || typeof o !== 'object') continue;
    const w = Math.floor(Number(o.w));
    const h = Math.floor(Number(o.h));
    const gx = Math.floor(Number(o.gx));
    const gy = Math.floor(Number(o.gy));
    const id = Math.floor(Number(o.id));
    if (
      typeof o.file !== 'string' || !o.file ||
      !Number.isFinite(w) || w < 1 ||
      !Number.isFinite(h) || h < 1 ||
      !Number.isFinite(gx) || !Number.isFinite(gy)
    ) continue;
    const inst = { id: Number.isFinite(id) && id > 0 ? id : 0, file: o.file, w, h, gx, gy };
    if (inst.id > maxId) maxId = inst.id;
    out.push(inst);
  }

  let counter = maxId;
  for (const inst of out) {
    if (inst.id === 0) inst.id = ++counter;
  }
  return { objects: out, maxId: counter };
}

/**
 * Прямоугольник footprint по ячейке КУРСОРА: объект «стоит» так, что его
 * нижний ряд (центр низа для нечётной ширины) оказывается у курсора.
 * @returns {{gx:number, gy:number, w:number, h:number}} — gx/gy верхний-левый тайл
 */
export function footprintAt(def, cursorGx, cursorGy) {
  return {
    gx: cursorGx - Math.floor((def.w - 1) / 2),
    gy: cursorGy - def.h + 1,
    w: def.w,
    h: def.h,
  };
}

/** Пересекается ли прямоугольник с каким-либо инстансом (кроме ignoreId). */
export function overlapsObjects(state, gx, gy, w, h, ignoreId) {
  for (const o of state.objects) {
    if (o.id === ignoreId) continue;
    if (gx < o.gx + o.w && gx + w > o.gx && gy < o.gy + o.h && gy + h > o.gy) {
      return true;
    }
  }
  return false;
}

/**
 * Инстанс под клеткой (возвращает ВЕРХНИЙ из пересекающих — последний в списке,
 * он же рисуется последним). null — если клетка свободна от объектов.
 */
export function objectAt(state, gx, gy) {
  let found = null;
  for (const o of state.objects) {
    if (gx >= o.gx && gx < o.gx + o.w && gy >= o.gy && gy < o.gy + o.h) {
      found = o;
    }
  }
  return found;
}

/** Текущее поведение клетки: 'walls' | 'overhead' | null (floor). */
function behaviorOfCell(state, gx, gy) {
  if (getTileAtWorld(state, gx, gy, 'walls') !== EMPTY_TILE) return 'walls';
  if (getTileAtWorld(state, gx, gy, 'overhead') !== EMPTY_TILE) return 'overhead';
  return null;
}

/** Снять флаги поведения с клетки (текстуру floor НЕ трогаем). */
function clearCellBehavior(state, gx, gy) {
  if (behaviorOfCell(state, gx, gy) !== null) {
    setTileWithHistory(state, gx, gy, 'walls', EMPTY_TILE);
    setTileWithHistory(state, gx, gy, 'overhead', EMPTY_TILE);
  }
}

/** Поставить флаг поведения ('walls' | 'overhead') на клетку. */
function setCellBehavior(state, gx, gy, behavior) {
  setTileWithHistory(state, gx, gy, behavior, FLAG_TILE_ID);
}

/** Типовая маска: низ = walls, остальное = overhead. */
function paintDefaultMask(state, gx, gy, w, h) {
  for (let dy = 0; dy < h; dy++) {
    const behavior = dy === h - 1 ? 'walls' : 'overhead';
    for (let dx = 0; dx < w; dx++) {
      setCellBehavior(state, gx + dx, gy + dy, behavior);
    }
  }
}

/**
 * Расставить объект: курсор = нижний ряд объекта.
 * Маска флагов пишется в чанки + инстанс добавляется в список (история общая).
 * @returns {boolean} true — объект поставлен (false — пересечение с другим объектом)
 */
export function placeObject(state, def, cursorGx, cursorGy) {
  const { gx, gy, w, h } = footprintAt(def, cursorGx, cursorGy);
  if (overlapsObjects(state, gx, gy, w, h, null)) return false;

  const before = state.objects;
  paintDefaultMask(state, gx, gy, w, h);
  state.objects = [...before, { id: nextId(state), file: def.file, w, h, gx, gy }];
  recordObjectOp(before, state.objects);
  return true;
}

/**
 * Перенести инстанс: текущие флаги поведения его footprint (в т.ч. ручные
 * правки маски) снимаются со старого места и переносятся на новое.
 * @returns {boolean} true — перенесено (false — пересечение или та же клетка)
 */
export function moveObject(state, inst, newGx, newGy) {
  if (newGx === inst.gx && newGy === inst.gy) return true;
  if (overlapsObjects(state, newGx, newGy, inst.w, inst.h, inst.id)) return false;

  // 1. Запоминаем текущее поведение каждой клетки footprint.
  const cells = [];
  for (let dy = 0; dy < inst.h; dy++) {
    for (let dx = 0; dx < inst.w; dx++) {
      const b = behaviorOfCell(state, inst.gx + dx, inst.gy + dy);
      if (b) cells.push({ dx, dy, b });
    }
  }

  const before = state.objects;

  // 2. Снимаем флаги со старого места.
  for (let dy = 0; dy < inst.h; dy++) {
    for (let dx = 0; dx < inst.w; dx++) {
      clearCellBehavior(state, inst.gx + dx, inst.gy + dy);
    }
  }

  // 3. Пишем те же флаги на новое место и двигаем инстанс.
  for (const { dx, dy, b } of cells) {
    setCellBehavior(state, newGx + dx, newGy + dy, b);
  }
  const moved = { ...inst, gx: newGx, gy: newGy };
  state.objects = before.map((o) => (o.id === inst.id ? moved : o));
  recordObjectOp(before, state.objects);
  return true;
}

/**
 * Удалить объект вместе с флагами поведения его footprint (текстуры остаются).
 */
export function deleteObject(state, inst) {
  const before = state.objects;
  for (let dy = 0; dy < inst.h; dy++) {
    for (let dx = 0; dx < inst.w; dx++) {
      clearCellBehavior(state, inst.gx + dx, inst.gy + dy);
    }
  }
  state.objects = before.filter((o) => o.id !== inst.id);
  recordObjectOp(before, state.objects);
}
