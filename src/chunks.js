import { CHUNK_SIZE, EMPTY_TILE, FLAG_TILE_ID, LAYERS } from './constants.js';
import { recordChange } from './history.js';

/**
 * Создаёт новый пустой чанк.
 * @returns {{ floor: number[], walls: number[], overhead: number[] }}
 */
function createEmptyChunk() {
  const size = CHUNK_SIZE * CHUNK_SIZE;
  return {
    floor: new Array(size).fill(EMPTY_TILE),
    walls: new Array(size).fill(EMPTY_TILE),
    overhead: new Array(size).fill(EMPTY_TILE),
  };
}

/**
 * Возвращает существующий чанк или создаёт новый.
 * Если чанк [0,0] создаётся впервые — заполняем его полом (тайл 3).
 */
export function getOrCreateChunk(state, cx, cy) {
  const key = `${cx},${cy}`;
  if (!state.chunks[key]) {
    state.chunks[key] = createEmptyChunk();
    // Для демонстрации — центральный чанк с полом
    if (cx === 0 && cy === 0) {
      state.chunks[key].floor.fill(3);
    }
  }
  return state.chunks[key];
}

/**
 * Преобразует мировые координаты в локальные внутри чанка.
 */
function worldToLocal(gx, gy) {
  const cx = Math.floor(gx / CHUNK_SIZE);
  const cy = Math.floor(gy / CHUNK_SIZE);
  let lx = gx % CHUNK_SIZE;
  let ly = gy % CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (ly < 0) ly += CHUNK_SIZE;
  return { cx, cy, lx, ly };
}

/**
 * Устанавливает тайл в мировых координатах сетки.
 */
export function setTileAtWorld(state, gx, gy, layer, tileId) {
  const { cx, cy, lx, ly } = worldToLocal(gx, gy);
  const chunk = getOrCreateChunk(state, cx, cy);
  chunk[layer][ly * CHUNK_SIZE + lx] = tileId;
}

/**
 * Изменяет клетку с записью в историю.
 *
 * Смысл слоёв (этап 2):
 *  - floor    — ВИЗУАЛЬНЫЙ тайл terrain. Рисование тайла сбрасывает флаги
 *               поведения на клетке → поведение floor по умолчанию.
 *  - walls    — НЕВИДИМЫЙ флаг «блок» (герой не пройдёт). Текстуру не имеет.
 *  - overhead — НЕВИДИМЫЙ флаг «проходимо, герой под объектом».
 * Рисование флага НЕ трогает текстуру floor.
 */
export function setTileWithHistory(state, gx, gy, layer, tileId) {
  // Стирание (ластик / ПКМ).
  if (tileId === EMPTY_TILE) {
    if (layer === 'floor') {
      // КАСКАД на слое 1: если на клетке есть флаги поведения (walls/overhead) —
      // снимаем их, а текстуру ОСТАВЛЯЕМ (клетка снова проходимая, вид тот же).
      // Если флагов не было — стираем саму текстуру.
      let clearedFlags = false;
      for (const l of LAYERS) {
        if (l === layer) continue;
        const flagOld = getTileAtWorld(state, gx, gy, l);
        if (flagOld !== EMPTY_TILE) {
          recordChange(gx, gy, l, flagOld);
          setTileAtWorld(state, gx, gy, l, EMPTY_TILE);
          clearedFlags = true;
        }
      }
      if (clearedFlags) return; // 1-й клик: только флаги, тайл не трогаем
      const oldTileId = getTileAtWorld(state, gx, gy, layer);
      if (oldTileId === EMPTY_TILE) return;
      recordChange(gx, gy, layer, oldTileId);
      setTileAtWorld(state, gx, gy, layer, EMPTY_TILE);
      return;
    }
    // Слои 2/3: снимаем только свой флаг, текстуру не трогаем.
    const oldTileId = getTileAtWorld(state, gx, gy, layer);
    if (oldTileId === tileId) return;
    recordChange(gx, gy, layer, oldTileId);
    setTileAtWorld(state, gx, gy, layer, tileId);
    return;
  }

  // ---- floor: рисуем текстуру terrain. ----
  // Новая текстура = поведение «floor» по умолчанию:
  // снимаем невидимые флаги walls/overhead с этой клетки.
  if (layer === 'floor') {
    for (const l of LAYERS) {
      if (l === layer) continue;
      const otherOldId = getTileAtWorld(state, gx, gy, l);
      if (otherOldId !== EMPTY_TILE) {
        recordChange(gx, gy, l, otherOldId);
        setTileAtWorld(state, gx, gy, l, EMPTY_TILE);
      }
    }
    const oldTileId = getTileAtWorld(state, gx, gy, layer);
    if (oldTileId === tileId) return;
    recordChange(gx, gy, layer, oldTileId);
    setTileAtWorld(state, gx, gy, layer, tileId);
    return;
  }

  // ---- walls / overhead: рисуем НЕВИДИМЫЙ флаг поведения. ----
  // Текстуру floor не трогаем. Поведение на клетке одно — снимаем флаг
  // второго типа (walls ↔ overhead), чтобы не было двойного флага.
  const otherLayer = layer === 'walls' ? 'overhead' : 'walls';
  const otherOldId = getTileAtWorld(state, gx, gy, otherLayer);
  if (otherOldId !== EMPTY_TILE) {
    recordChange(gx, gy, otherLayer, otherOldId);
    setTileAtWorld(state, gx, gy, otherLayer, EMPTY_TILE);
  }
  const oldTileId = getTileAtWorld(state, gx, gy, layer);
  if (oldTileId !== EMPTY_TILE) return; // флаг уже стоит — не дублируем запись
  recordChange(gx, gy, layer, EMPTY_TILE);
  setTileAtWorld(state, gx, gy, layer, FLAG_TILE_ID);
}

/**
 * Возвращает ID тайла в мировых координатах.
 */
export function getTileAtWorld(state, gx, gy, layer) {
  const { cx, cy, lx, ly } = worldToLocal(gx, gy);
  const key = `${cx},${cy}`;
  const chunk = state.chunks[key];
  if (!chunk) return EMPTY_TILE;
  return chunk[layer][ly * CHUNK_SIZE + lx];
}

/**
 * Клетка занята footprint ОБЪЕКТА (state.objects).
 * Слой 1 (текстуры) такие клетки не трогает: под объектом не рисуем и не
 * стираем тайлы — иначе случайно снимем флаги его маски поведения.
 * Флаги (слои 2/3) рисовать/снимать на клетках объекта можно (это правка маски).
 */
function isObjectCell(state, gx, gy) {
  const objs = state.objects;
  if (!objs || objs.length === 0) return false;
  for (const o of objs) {
    if (gx >= o.gx && gx < o.gx + o.w && gy >= o.gy && gy < o.gy + o.h) return true;
  }
  return false;
}

/**
 * Применяет кисть (brush) в заданной точке.
 * Если tileId === EMPTY_TILE (-1) — ластик: стирает тайл
 * ТОЛЬКО на активном слое (переданном в layer).
 * @param {object} state
 * @param {number} gx - центр кисти по X
 * @param {number} gy - центр кисти по Y
 * @param {string} layer
 * @param {number} tileId
 * @param {number} brushSize - размер кисти (1, 3, 5...)
 */
export function applyBrush(state, gx, gy, layer, tileId, brushSize) {
  const half = Math.floor(brushSize / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      // Тайлы не рисуем на клетках объектов (см. isObjectCell)
      if (layer === 'floor' && isObjectCell(state, gx + dx, gy + dy)) continue;
      setTileWithHistory(state, gx + dx, gy + dy, layer, tileId);
    }
  }
}

/**
 * Рисует прямоугольник от (gx1,gy1) до (gx2,gy2).
 * Если tileId === EMPTY_TILE — ластик: стирает ТОЛЬКО на активном слое.
 */
export function applyRect(state, gx1, gy1, gx2, gy2, layer, tileId) {
  const minX = Math.min(gx1, gx2);
  const maxX = Math.max(gx1, gx2);
  const minY = Math.min(gy1, gy2);
  const maxY = Math.max(gy1, gy2);
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      if (layer === 'floor' && isObjectCell(state, gx, gy)) continue;
      setTileWithHistory(state, gx, gy, layer, tileId);
    }
  }
}

/**
 * Рисует линию от (gx1,gy1) до (gx2,gy2) по алгоритму Брезенхема.
 * Если tileId === EMPTY_TILE — ластик: стирает ТОЛЬКО на активном слое.
 */
export function applyLine(state, gx1, gy1, gx2, gy2, layer, tileId) {
  let dx = Math.abs(gx2 - gx1);
  let dy = Math.abs(gy2 - gy1);
  const sx = gx1 < gx2 ? 1 : -1;
  const sy = gy1 < gy2 ? 1 : -1;
  let err = dx - dy;
  let cx = gx1;
  let cy = gy1;

  while (true) {
    if (!(layer === 'floor' && isObjectCell(state, cx, cy))) {
      setTileWithHistory(state, cx, cy, layer, tileId);
    }
    if (cx === gx2 && cy === gy2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

/**
 * Заливка (flood fill) — BFS от указанной точки.
 *  - layer 'floor'  — заменяет связную область ТАЙЛОВ с тем же ID;
 *                     флаги на залитых клетках снимаются (поведение floor).
 *  - layer walls/overhead — заменяет поведение связной области клеток
 *                     с тем же поведением; текстуру floor не трогает.
 * Если newTileId === EMPTY_TILE (-1) — стирание: на слое 1 область чистится
 * целиком (тайл + флаги), на слоях 2/3 снимаются флаги области.
 */
export function floodFill(state, startGx, startGy, layer, newTileId) {
  if (layer === 'floor') {
    floodFillLayer(state, startGx, startGy, layer, newTileId);
    return;
  }
  floodFillBehavior(state, startGx, startGy, layer, newTileId);
}

/**
 * Заливка одного слоя (общая логика BFS).
 */
function floodFillLayer(state, startGx, startGy, layer, newTileId) {
  const targetTileId = getTileAtWorld(state, startGx, startGy, layer);
  // Не заливаем, если то же самое или пустота
  if (targetTileId === newTileId || targetTileId === EMPTY_TILE) return;

  const visited = new Set();
  const queue = [{ gx: startGx, gy: startGy }];
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const { gx, gy } = queue.shift();
    const key = `${gx},${gy}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const currentId = getTileAtWorld(state, gx, gy, layer);
    if (currentId !== targetTileId) continue;

    // Клетки объектов в заливку тайлов не входят (и область не расширяют)
    if (isObjectCell(state, gx, gy)) continue;

    if (newTileId === EMPTY_TILE) {
      // Заливка-стирание области: клетки чистятся ЦЕЛИКОМ (тайл + флаги),
      // чтобы одним действием очистить целый участок.
      clearCellWithHistory(state, gx, gy);
    } else {
      setTileWithHistory(state, gx, gy, layer, newTileId);
    }

    for (const { dx, dy } of directions) {
      queue.push({ gx: gx + dx, gy: gy + dy });
    }
  }
}

/**
 * Полностью очищает клетку (текстуру floor и все флаги поведения) с историей.
 */
function clearCellWithHistory(state, gx, gy) {
  for (const l of LAYERS) {
    const oldTileId = getTileAtWorld(state, gx, gy, l);
    if (oldTileId === EMPTY_TILE) continue;
    recordChange(gx, gy, l, oldTileId);
    setTileAtWorld(state, gx, gy, l, EMPTY_TILE);
  }
}

/**
 * Поведение клетки: walls-флаг → 'walls', overhead-флаг → 'overhead', иначе 'floor'.
 */
function behaviorOf(state, gx, gy) {
  if (getTileAtWorld(state, gx, gy, 'walls') !== EMPTY_TILE) return 'walls';
  if (getTileAtWorld(state, gx, gy, 'overhead') !== EMPTY_TILE) return 'overhead';
  return 'floor';
}

/**
 * Заливка поведения (слои walls/overhead): BFS по связной области клеток
 * с ТЕМ ЖЕ поведением, что и стартовая клетка. Красит/снимает флаг
 * указанного слоя, текстуру floor не трогает.
 */
function floodFillBehavior(state, startGx, startGy, layer, newTileId) {
  const targetBehavior = behaviorOf(state, startGx, startGy);
  const newValue = newTileId === EMPTY_TILE ? EMPTY_TILE : FLAG_TILE_ID;

  const visited = new Set();
  const queue = [{ gx: startGx, gy: startGy }];
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const { gx, gy } = queue.shift();
    const key = `${gx},${gy}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (behaviorOf(state, gx, gy) !== targetBehavior) continue;

    setTileWithHistory(state, gx, gy, layer, newValue);

    for (const { dx, dy } of directions) {
      queue.push({ gx: gx + dx, gy: gy + dy });
    }
  }
}