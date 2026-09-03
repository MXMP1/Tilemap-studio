/**
 * Undo/Redo история для редактора.
 * Каждая операция (движение мыши, заливка) записывается как один batch изменений.
 */

const MAX_HISTORY = 100;
let undoStack = [];
let redoStack = [];
let recording = null;

/**
 * Начать запись batch-операции.
 * Вызывается при mousedown / начале заливки.
 */
export function startRecording() {
  recording = { changes: [] };
}

/**
 * Записать одно изменение тайла.
 * @param {number} gx - мировая X-координата сетки
 * @param {number} gy - мировая Y-координата сетки
 * @param {string} layer - имя слоя
 * @param {number} oldTileId - ID тайла ДО изменения
 */
export function recordChange(gx, gy, layer, oldTileId) {
  if (recording) {
    recording.changes.push({ gx, gy, layer, oldTileId });
  }
}

/**
 * Завершить запись batch-операции и поместить в undo-стек.
 */
export function stopRecording() {
  if (recording && recording.changes.length > 0) {
    undoStack.push(recording);
    redoStack = []; // новое действие сбрасывает redo
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }
  recording = null;
}

/**
 * Вернуть последнюю операцию (Ctrl+Z).
 * @param {object} state - глобальное состояние
 */
export function undo(state) {
  const action = undoStack.pop();
  if (!action) return;

  // Собираем действие для redo
  const redoAction = { changes: [] };
  for (let i = action.changes.length - 1; i >= 0; i--) {
    const { gx, gy, layer } = action.changes[i];
    const chunkKey = `${Math.floor(gx / 16)},${Math.floor(gy / 16)}`;
    const chunk = state.chunks[chunkKey];
    if (!chunk) continue;

    let lx = gx % 16;
    let ly = gy % 16;
    if (lx < 0) lx += 16;
    if (ly < 0) ly += 16;

    const currentTileId = chunk[layer][ly * 16 + lx];
    redoAction.changes.push({ gx, gy, layer, oldTileId: currentTileId });

    chunk[layer][ly * 16 + lx] = action.changes[i].oldTileId;
  }
  redoStack.push(redoAction);
}

/**
 * Повторить отменённую операцию (Ctrl+Y).
 * @param {object} state - глобальное состояние
 */
export function redo(state) {
  const action = redoStack.pop();
  if (!action) return;

  const undoAction = { changes: [] };
  for (let i = action.changes.length - 1; i >= 0; i--) {
    const { gx, gy, layer } = action.changes[i];
    const chunkKey = `${Math.floor(gx / 16)},${Math.floor(gy / 16)}`;
    const chunk = state.chunks[chunkKey];
    if (!chunk) continue;

    let lx = gx % 16;
    let ly = gy % 16;
    if (lx < 0) lx += 16;
    if (ly < 0) ly += 16;

    const currentTileId = chunk[layer][ly * 16 + lx];
    undoAction.changes.push({ gx, gy, layer, oldTileId: currentTileId });

    chunk[layer][ly * 16 + lx] = action.changes[i].oldTileId;
  }
  undoStack.push(undoAction);
}

/**
 * Сбросить историю (например при загрузке новой карты).
 */
export function clearHistory() {
  undoStack = [];
  redoStack = [];
  recording = null;
}