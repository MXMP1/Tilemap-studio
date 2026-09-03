import { CHUNK_SIZE } from './constants.js';

let infoOverlay;

/**
 * Инициализация UI ссылками на DOM.
 */
export function initUI(elements) {
  infoOverlay = elements.infoOverlay;
}

/**
 * Обновление текста оверлея с информацией.
 */
export function updateOverlay(state) {
  const cx = Math.floor(state.mouse.gridX / CHUNK_SIZE);
  const cy = Math.floor(state.mouse.gridY / CHUNK_SIZE);
  let lx = state.mouse.gridX % CHUNK_SIZE;
  let ly = state.mouse.gridY % CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (ly < 0) ly += CHUNK_SIZE;

  infoOverlay.innerHTML = `
    Камера: X: ${Math.round(state.camera.x)}, Y: ${Math.round(state.camera.y)} | Зум: ${Math.round(state.camera.zoom * 100)}%<br>
    Курсор в мире: X: ${state.mouse.gridX}, Y: ${state.mouse.gridY}<br>
    Чанк: [${cx}, ${cy}] | Тайл в чанке: (${lx}, ${ly})<br>
    Выбран слой: <b>${state.currentLayer.toUpperCase()}</b>
  `;
}

/**
 * Подсветка активной кнопки слоя.
 */
export function highlightLayer(layerName) {
  document.querySelectorAll('.layer-btn').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.layer-btn[data-layer="${layerName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Навешивает обработчики на кнопки слоёв.
 */
export function initLayerButtons(onLayerChange) {
  document.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      onLayerChange(layer);
    });
  });
}