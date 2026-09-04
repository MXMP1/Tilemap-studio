import { TILE_SIZE } from './constants.js';

/**
 * РЕЕСТР ТАЙЛСЕТОВ (этап 5, мульти-тайлсет):
 * новый PNG → public/tilesets/ + строка сюда (порядок = порядок id).
 *
 * ⚠️ Правило эволюции реестра: тайлсеты только ДОБАВЛЯЮТСЯ В КОНЕЦ списка.
 * Стартовые id диапазонов фиксируются в карте при сохранении (формат v3:
 * {file, start, count}), поэтому: добавлять ряды тайлов в середину/начало
 * картинки нельзя; удалять/переставлять файлы нельзя — старые карты «съедут».
 * Безопасно: менять рисунки тайлов 1:1 и добавлять новые ряды В КОНЕЦ
 * картинки или новый тайлсет в конец списка.
 */
const TILESET_FILES = [
  { file: 'tileset_1.png', label: 'Тайлсет 1' },
];

/**
 * Предзагружает ВСЕ тайлсеты реестра.
 * @returns {Promise<{defs: Array, images: Object}>}
 * defs = [{file,label,img,tpr,total}] в порядке реестра.
 */
export function loadTilesets() {
  return Promise.all(
    TILESET_FILES.map(
      (entry) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const info = getTilesetInfo(img);
            resolve({ ...entry, img, tpr: info.tilesPerRow, total: info.totalTiles });
          };
          img.onerror = () => resolve({ ...entry, img: null, tpr: 1, total: 0 });
          img.src = `/tilesets/${entry.file}`;
        })
    )
  ).then((defs) => {
    const ok = defs.filter((d) => d.img);
    const images = {};
    for (const d of ok) images[d.file] = d.img;
    return { defs: ok, images };
  });
}

/**
 * Вычисляет количество тайлов в строке и общее количество.
 */
export function getTilesetInfo(img) {
  return {
    tilesPerRow: Math.floor(img.width / TILE_SIZE),
    totalTiles: Math.floor((img.width / TILE_SIZE) * (img.height / TILE_SIZE)),
  };
}

export { TILESET_FILES };
