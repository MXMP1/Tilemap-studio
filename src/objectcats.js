/**
 * КАТЕГОРИИ ОБЪЕКТОВ — общая модель для chunks.js и objects.js (без циклов импорта).
 *
 *  - road        («дороги») — плоские «продолжение terrain»: рисуются ПОД всеми
 *                сущностями (герой всегда поверх), НИКОГДА не получают флагов
 *                walls/overhead (всегда проходимы). Размещение: env МОЖЕТ быть
 *                поверх road; road поверх road/env — нельзя.
 *  - environment («окружение») — декор/здания: рендер painter'ом (сортировка по
 *                низу), типовая маска при расстановке: низ = walls, верх = overhead.
 *
 * Категория берётся из ПАПКИ файла в реестре (public/objects/<кат>/<файл>),
 * поэтому инстансы в JSON не хранят категорию (формат v2 не меняется).
 */

export const CAT_ROAD = 'road';
export const CAT_ENVIRONMENT = 'environment';
export const CAT_DEFAULT = CAT_ENVIRONMENT;

/** Категория по пути файла объекта (registry-файл вида 'road/x.png'). */
export function objectCat(file) {
  if (typeof file !== 'string' || !file) return CAT_DEFAULT;
  const slash = file.indexOf('/');
  const folder = slash === -1 ? file : file.slice(0, slash);
  return folder === CAT_ROAD ? CAT_ROAD : CAT_DEFAULT;
}

export function isRoadFile(file) {
  return objectCat(file) === CAT_ROAD;
}

/**
 * ВЕРХНИЙ объект над клеткой. environment всегда «над» road (независимо от
 * порядка в списке): если клетку накрывает env — env поверх, иначе верхний road.
 * @returns {object|null} инстанс или null
 */
export function topmostObject(objects, gx, gy) {
  let env = null;
  let road = null;
  const list = objects || [];
  for (const o of list) {
    if (gx >= o.gx && gx < o.gx + o.w && gy >= o.gy && gy < o.gy + o.h) {
      if (objectCat(o.file) === CAT_ROAD) road = o;
      else env = o;
    }
  }
  return env || road;
}
