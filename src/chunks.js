import { CHUNK_SIZE, EMPTY_TILE } from './constants.js';
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
 * Устанавливает тайл с записью в историю.
 */
export function setTileWithHistory(state, gx, gy, layer, tileId) {
  const oldTileId = getTileAtWorld(state, gx, gy, layer);
  if (oldTileId === tileId) return;
  recordChange(gx, gy, layer, oldTileId);
  setTileAtWorld(state, gx, gy, layer, tileId);
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
 * Применяет кисть (brush) в заданной точке.
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
      setTileWithHistory(state, gx + dx, gy + dy, layer, tileId);
    }
  }
}

/**
 * Рисует прямоугольник от (gx1,gy1) до (gx2,gy2).
 */
export function applyRect(state, gx1, gy1, gx2, gy2, layer, tileId) {
  const minX = Math.min(gx1, gx2);
  const maxX = Math.max(gx1, gx2);
  const minY = Math.min(gy1, gy2);
  const maxY = Math.max(gy1, gy2);
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      setTileWithHistory(state, gx, gy, layer, tileId);
    }
  }
}

/**
 * Рисует линию от (gx1,gy1) до (gx2,gy2) по алгоритму Брезенхема.
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
    setTileWithHistory(state, cx, cy, layer, tileId);
    if (cx === gx2 && cy === gy2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

/**
 * Заливка (flood fill) — BFS от указанной точки.
 * Заменяет все смежные тайлы с таким же ID.
 */
export function floodFill(state, startGx, startGy, layer, newTileId) {
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

    setTileWithHistory(state, gx, gy, layer, newTileId);

    for (const { dx, dy } of directions) {
      queue.push({ gx: gx + dx, gy: gy + dy });
    }
  }
}