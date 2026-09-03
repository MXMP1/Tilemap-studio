import { TILE_SIZE } from './constants.js';
import { getTileAtWorld } from './chunks.js';

/**
 * Скорость героя в пикселях в секунду.
 */
const HERO_SPEED = 160;

export const DIR_KEYS = {
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
};

/**
 * Проверяет, перекрывается ли прямоугольник ног героя хотя бы с одной
 * клеткой walls. Коллизия считается только по ногам — голова проходит
 * сквозь всё.
 */
function feetOverlapsWall(state, px, py) {
  const gx1 = Math.floor(px / TILE_SIZE);
  const gx2 = Math.floor((px + TILE_SIZE - 1) / TILE_SIZE);
  const gy1 = Math.floor(py / TILE_SIZE);
  const gy2 = Math.floor((py + TILE_SIZE - 1) / TILE_SIZE);

  for (let gy = gy1; gy <= gy2; gy++) {
    for (let gx = gx1; gx <= gx2; gx++) {
      if (getTileAtWorld(state, gx, gy, 'walls') !== -1) return true;
    }
  }
  return false;
}

/**
 * Можно ли стоять герою на клетке (gx, gy) = клетка ног?
 * Используется только для спавна (поиск ближайшей свободной клетки).
 */
export function canStand(state, gx, gy) {
  if (getTileAtWorld(state, gx, gy, 'walls') !== -1) return false;
  return true;
}

/**
 * Спавнит героя в клетке (gx, gy) или ближайшей проходимой.
 * Клетка — это клетка НОГ героя.
 */
export function spawnHero(state, gx, gy) {
  const searchRadius = 8;
  let found = null;

  for (let r = 0; r <= searchRadius && !found; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (canStand(state, gx + dx, gy + dy)) {
          found = [gx + dx, gy + dy];
          break;
        }
      }
      if (found) break;
    }
  }

  const [fx, fy] = found || [gx, gy];
  const hero = state.hero;
  hero.px = fx * TILE_SIZE;
  hero.py = fy * TILE_SIZE;
  // Сбрасываем зажатые клавиши при спавне
  hero.keys = { up: false, down: false, left: false, right: false };
}

/**
 * Обновляет свободное движение героя без привязки к сетке.
 * Поддерживает диагональ (WASD комбинации).
 * Коллизия проверяется по ногам с притиркой вдоль стен (slide).
 */
export function updateHero(state, dt) {
  const hero = state.hero;
  if (!hero || !state.heroMode) return;

  // Направление из зажатых клавиш
  let dx = 0;
  let dy = 0;
  if (hero.keys.left) dx -= 1;
  if (hero.keys.right) dx += 1;
  if (hero.keys.up) dy -= 1;
  if (hero.keys.down) dy += 1;

  const len = Math.hypot(dx, dy);
  if (len === 0) return;

  // Нормализуем для одинаковой скорости во всех направлениях
  const nx = dx / len;
  const ny = dy / len;

  const speed = HERO_SPEED * dt;

  // Делим перемещение на микрошаги для плавной коллизии со стенами
  const numSteps = Math.max(1, Math.ceil(speed));
  const stepX = nx * speed / numSteps;
  const stepY = ny * speed / numSteps;

  for (let i = 0; i < numSteps; i++) {
    // Пробуем сдвинуться по X; если упёрлись — не двигаем (slide по Y останется)
    const testPx = hero.px + stepX;
    if (!feetOverlapsWall(state, testPx, hero.py)) {
      hero.px = testPx;
    }

    // Пробуем сдвинуться по Y (уже с финальным X этого шага)
    const testPy = hero.py + stepY;
    if (!feetOverlapsWall(state, hero.px, testPy)) {
      hero.py = testPy;
    }
  }
}