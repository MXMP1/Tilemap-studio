import { TILE_SIZE } from './constants.js';
import { getTileAtWorld } from './chunks.js';

/**
 * Скорость героя в пикселях в секунду (плавное движение).
 */
const HERO_SPEED = 160;

const DIR_VECTORS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const DIR_KEYS = {
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
};

/**
 * Правила коллизий:
 *  - Герой занимает 2 клетки по вертикали: НИЖНИЙ квадрат (ноги) и ВЕРХНИЙ (голова).
 *  - Ноги: коллизия только со слоем walls.
 *  - Голова: коллизия со слоями walls и overhead.
 *  - Слой floor всегда проходим — это «дорога».
 * Благодаря этому можно зайти «за» высокий объект (крыша/overhead над головой
 * не мешает, если ты не упираешься в него торцом).
 */

/**
 * Можно ли стоять герою на клетке (gx, gy) = клетка ног?
 */
export function canStand(state, gx, gy) {
  // Ноги: walls
  if (getTileAtWorld(state, gx, gy, 'walls') !== -1) return false;
  // Голова (клетка выше): walls ИЛИ overhead
  const headGx = gx;
  const headGy = gy - 1;
  if (getTileAtWorld(state, headGx, headGy, 'walls') !== -1) return false;
  if (getTileAtWorld(state, headGx, headGy, 'overhead') !== -1) return false;
  return true;
}

/**
 * Пытается шагнуть из клетки (fromGx, fromGy) в направлении dir.
 * Если клетка проходима — ставит цель движения героя.
 */
function tryStep(state, fromGx, fromGy, dir) {
  const v = DIR_VECTORS[dir];
  if (!v) return false;
  const nx = fromGx + v.dx;
  const ny = fromGy + v.dy;
  if (!canStand(state, nx, ny)) return false;

  const hero = state.hero;
  hero.tx = nx * TILE_SIZE;
  hero.ty = ny * TILE_SIZE;
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
  hero.tx = hero.px;
  hero.ty = hero.py;
  hero.dir = null;
}

/**
 * Обновляет плавное движение героя. Вызывается каждый кадр.
 * @param {number} dt - время кадра в секундах
 */
export function updateHero(state, dt) {
  const hero = state.hero;
  if (!hero || !state.heroMode) return;

  // Если герой стоит на клетке и направление зажато — делаем шаг
  if (hero.px === hero.tx && hero.py === hero.ty) {
    const restGx = Math.round(hero.px / TILE_SIZE);
    const restGy = Math.round(hero.py / TILE_SIZE);
    if (hero.dir) {
      tryStep(state, restGx, restGy, hero.dir);
    }
  }

  // Плавное движение к цели
  const dx = hero.tx - hero.px;
  const dy = hero.ty - hero.py;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return;

  const step = HERO_SPEED * dt;
  if (dist <= step) {
    hero.px = hero.tx;
    hero.py = hero.ty;
  } else {
    hero.px += (dx / dist) * step;
    hero.py += (dy / dist) * step;
  }
}

export { DIR_KEYS };
