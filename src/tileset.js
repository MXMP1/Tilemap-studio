import { TILE_SIZE } from './constants.js';

/**
 * Загружает тайлсет из изображения.
 * Изображение кешируется браузером.
 */
export function loadTileset() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить тайлсет'));
    img.src = '/tilesets/tileset_1.png';
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