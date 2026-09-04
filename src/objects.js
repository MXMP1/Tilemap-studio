/**
 * ОБЪЕКТЫ — отдельные картинки на сетке (кратно 32px), двух категорий:
 *
 *  - road (папка public/objects/road/) — плоское «продолжение terrain»:
 *    НИКАКОЙ маски (всегда проходимо, никогда walls/overhead), рисуется под
 *    всеми сущностями; участок ставится целиком (например 6×3) как объект;
 *    поверх road разрешено ставить environment (знаки, деревья у дороги).
 *  - environment (папка public/objects/environment/) — декор/здания:
 *    типовая маска при расстановке — низ = walls, остальное = overhead;
 *    рендер painter'ом (сортировка по низу, глубина вокруг героя).
 *
 * Общее:
 *  - footprint = прямоугольник w×h тайлов (gx, gy — ВЕРХНИЙ-ЛЕВЫЙ тайл);
 *  - поведение живёт в чанках (walls/overhead — невидимые флаги);
 *  - инстанс = { id, file, w, h, gx, gy } — категория НЕ хранится в инстансе,
 *    она выводится из папки файла (см. objectcats.js), формат JSON не меняется;
 *  - перенос/удаление трогают флаги ТОЛЬКО клеток, где объект — верхний
 *    владелец (env поверх road не пострадает при переносе/удалении дороги).
 *
 * Операции объектов пишутся в ту же историю undo/redo, что и тайлы.
 */

import { EMPTY_TILE, FLAG_TILE_ID, TILE_SIZE } from './constants.js';
import { getTileAtWorld, setTileWithHistory } from './chunks.js';
import { recordObjectOp } from './history.js';
import { CAT_ENVIRONMENT, CAT_ROAD, objectCat, topmostObject } from './objectcats.js';

// Файлы объектов: новые PNG положи в public/objects/<категория>/ и добавь строку.
// Категория определяется папкой файла: 'road/…' или 'environment/…'.
// Размер (w×h в тайлах) вычисляется из PNG автоматически (кратно 32px).
const OBJECT_FILES = [
  // Окружение (декор/здания): типовая маска (низ = walls, верх = overhead)
  { file: 'environment/barrel.png', label: 'Бочка' },
  { file: 'environment/clock.png', label: 'Часовая башня' },
  { file: 'environment/ligther.png', label: 'Фонарь' },
  { file: 'environment/tree.png', label: 'Дерево' },
  // Дороги (всегда floor, без маски): ставятся целиком, стыкуются по рёбрам
  { file: 'road/road_horizont.png', label: 'Дорога — прямая (гориз.)' },
  { file: 'road/road_vertical.png', label: 'Дорога — прямая (верт.)' },
  { file: 'road/road_turn_left.png', label: 'Дорога — поворот влево' },
  { file: 'road/road_turn_right.png', label: 'Дорога — поворот вправо' },
  { file: 'road/road_turn_up.png', label: 'Дорога — поворот вверх' },
  { file: 'road/road_turn_down.png', label: 'Дорога — поворот вниз' },
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
            resolve({ ...entry, img, w, h, cat: objectCat(entry.file) });
          };
          img.onerror = () => resolve({ ...entry, img: null, w: 1, h: 1, cat: objectCat(entry.file) });
          img.src = `/objects/${entry.file}`;
        })
    )
  ).then((defs) => {
    const ok = defs.filter((d) => d.img);
    const images = {};
    for (const d of ok) {
      images[d.file] = d.img;
      // Алиас для старых карт: объекты могли сохраняться как 'barrel.png'
      // (без папки категории) — такие файлы по-прежнему показываем.
      const bare = d.file.slice(d.file.lastIndexOf('/') + 1);
      if (bare && bare !== d.file && !images[bare]) images[bare] = d.img;
    }
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

/**
 * Можно ли поставить прямоугольник (категория cat) в позицию (gx,gy,w,h):
 *  - environment: НЕ пересекается с другими environment (но МОЖЕТ стоять на road);
 *  - road:        НЕ пересекается ни с чем (ни с env, ни с другой дорогой) —
 *                 дороги стыкуются по рёбрам, участки не перекрывают друг друга.
 * @returns {boolean} true — размещение допустимо
 */
export function canPlaceRect(state, gx, gy, w, h, cat, ignoreId) {
  const allowOverRoad = cat === CAT_ENVIRONMENT;
  for (const o of state.objects) {
    if (o.id === ignoreId) continue;
    if (gx < o.gx + o.w && gx + w > o.gx && gy < o.gy + o.h && gy + h > o.gy) {
      const otherCat = objectCat(o.file);
      if (otherCat === CAT_ROAD) {
        if (!allowOverRoad) return false; // road поверх road/env нельзя
      } else if (cat !== CAT_ENVIRONMENT || otherCat === CAT_ENVIRONMENT) {
        return false; // env поверх env нельзя; road поверх env нельзя
      }
    }
  }
  return true;
}

/** Верхний объект над клеткой: environment всегда над road (см. objectcats.js). */
export function objectAt(state, gx, gy) {
  return topmostObject(state.objects, gx, gy);
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

/** Типовая маска environment: низ = walls, остальное = overhead. */
function paintDefaultMask(state, gx, gy, w, h) {
  for (let dy = 0; dy < h; dy++) {
    const behavior = dy === h - 1 ? 'walls' : 'overhead';
    for (let dx = 0; dx < w; dx++) {
      setCellBehavior(state, gx + dx, gy + dy, behavior);
    }
  }
}

/**
 * Маска категории при расстановке: road — никакой (всегда floor);
 * environment — типовая (низ walls, верх overhead).
 */
function paintCategoryMask(state, def, gx, gy, w, h) {
  if (objectCat(def.file) === CAT_ENVIRONMENT) {
    paintDefaultMask(state, gx, gy, w, h);
  }
  // road — флагов не пишем вовсе
}

/**
 * Расставить объект: курсор = нижний ряд объекта.
 * Маска флагов пишется в чанки + инстанс добавляется в список (история общая).
 * @returns {boolean} true — объект поставлен (false — недопустимое пересечение)
 */
export function placeObject(state, def, cursorGx, cursorGy) {
  const { gx, gy, w, h } = footprintAt(def, cursorGx, cursorGy);
  const cat = def.cat || objectCat(def.file);
  if (!canPlaceRect(state, gx, gy, w, h, cat, null)) return false;

  const before = state.objects;
  paintCategoryMask(state, def, gx, gy, w, h);
  state.objects = [...before, { id: nextId(state), file: def.file, w, h, gx, gy }];
  recordObjectOp(before, state.objects);
  return true;
}

/**
 * Владеет ли инстанс поведением клетки (gx,gy): клетка в footprint И верхний
 * объект над ней — сам инстанс. Дорога под environment НЕ владеет своими
 * клетками, пока их накрывает env (перенос/удаление дороги не тронет его маску).
 */
function ownsCell(state, inst, gx, gy) {
  if (gx < inst.gx || gx >= inst.gx + inst.w || gy < inst.gy || gy >= inst.gy + inst.h) {
    return false;
  }
  return topmostObject(state.objects, gx, gy) === inst;
}

/**
 * Перенести инстанс: флаги поведения клеток, КОТОРЫМИ ВЛАДЕЕТ инстанс
 * (в т.ч. ручные правки маски env), снимаются со старого места и переносятся
 * на новое. Клетки, где над объектом стоит другой (env над road), не трогаем.
 * @returns {boolean} true — перенесено (false — недопустимое пересечение)
 */
export function moveObject(state, inst, newGx, newGy) {
  if (newGx === inst.gx && newGy === inst.gy) return true;
  const cat = objectCat(inst.file);
  if (!canPlaceRect(state, newGx, newGy, inst.w, inst.h, cat, inst.id)) return false;

  // 1. Запоминаем текущее поведение владеемых клеток footprint.
  const cells = [];
  for (let dy = 0; dy < inst.h; dy++) {
    for (let dx = 0; dx < inst.w; dx++) {
      const gx = inst.gx + dx;
      const gy = inst.gy + dy;
      if (!ownsCell(state, inst, gx, gy)) continue;
      const b = behaviorOfCell(state, gx, gy);
      if (b) cells.push({ dx, dy, b });
    }
  }

  const before = state.objects;

  // 2. Снимаем флаги со старого места (только владеемые клетки).
  for (let dy = 0; dy < inst.h; dy++) {
    for (let dx = 0; dx < inst.w; dx++) {
      const gx = inst.gx + dx;
      const gy = inst.gy + dy;
      if (ownsCell(state, inst, gx, gy)) {
        clearCellBehavior(state, gx, gy);
      }
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
 * Клетки, которыми владеет ВЫШЕСТОЯЩИЙ объект (env над road), не трогаем.
 */
export function deleteObject(state, inst) {
  const before = state.objects;
  for (let dy = 0; dy < inst.h; dy++) {
    for (let dx = 0; dx < inst.w; dx++) {
      const gx = inst.gx + dx;
      const gy = inst.gy + dy;
      if (ownsCell(state, inst, gx, gy)) {
        clearCellBehavior(state, gx, gy);
      }
    }
  }
  state.objects = before.filter((o) => o.id !== inst.id);
  recordObjectOp(before, state.objects);
}
