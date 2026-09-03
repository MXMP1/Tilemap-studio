// Размер одного тайла в пикселях
export const TILE_SIZE = 32;

// Размер чанка в тайлах (16×16 = 256 тайлов в чанке)
export const CHUNK_SIZE = 16;

// Размер чанка в пикселях
export const WORLD_PIXEL_CHUNK = CHUNK_SIZE * TILE_SIZE;

// Имена слоёв (порядок = порядок отрисовки)
export const LAYERS = ['floor', 'walls', 'overhead'];

// Значение "пусто" в массиве чанка
export const EMPTY_TILE = -1;

// Настройки камеры
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4.0;
export const ZOOM_FACTOR = 1.1;