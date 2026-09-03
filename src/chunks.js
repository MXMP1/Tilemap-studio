import { CHUNK_SIZE, EMPTY_TILE } from './constants.js';

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
 * Устанавливает тайл в мировых координатах сетки.
 */
export function setTileAtWorld(state, gx, gy, layer, tileId) {
  const cx = Math.floor(gx / CHUNK_SIZE);
  const cy = Math.floor(gy / CHUNK_SIZE);

  let lx = gx % CHUNK_SIZE;
  let ly = gy % CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (ly < 0) ly += CHUNK_SIZE;

  const chunk = getOrCreateChunk(state, cx, cy);
  chunk[layer][ly * CHUNK_SIZE + lx] = tileId;
}

/**
 * Возвращает ID тайла в мировых координатах (для пипетки).
 */
export function getTileAtWorld(state, gx, gy, layer) {
  const cx = Math.floor(gx / CHUNK_SIZE);
  const cy = Math.floor(gy / CHUNK_SIZE);
  const key = `${cx},${cy}`;
  const chunk = state.chunks[key];
  if (!chunk) return EMPTY_TILE;

  let lx = gx % CHUNK_SIZE;
  let ly = gy % CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (ly < 0) ly += CHUNK_SIZE;

  return chunk[layer][ly * CHUNK_SIZE + lx];
}