/**
 * Undo/Redo история для редактора.
 *
 * Единый стек batch-операций. Каждый batch (один жест мыши, заливка,
 * расстановка/перенос/удаление объекта) содержит список ОПЕРАЦИЙ:
 *   { kind: 'tile', gx, gy, layer, oldTileId }        — изменение клетки
 *   { kind: 'objects', before, after }                — снимок списка объектов
 * Это позволяет откатывать рисование и объектные действия одним Ctrl+Z
 * в том порядке, в котором они происходили.
 */

const MAX_HISTORY = 100;
let undoStack = [];
let redoStack = [];
let recording = null;

/** Клонирует список инстансов объектов (лёгкие объекты — без вложений). */
function cloneObjects(objects) {
  return objects.map((o) => ({ ...o }));
}

/**
 * Начать запись batch-операции.
 * Вызывается при mousedown / начале заливки / начале объектного действия.
 */
export function startRecording() {
  recording = { ops: [] };
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
    recording.ops.push({ kind: 'tile', gx, gy, layer, oldTileId });
  }
}

/**
 * Записать смену СПИСКА ОБЪЕКТОВ (расстановка / перенос / удаление).
 * Вызывается внутри startRecording/stopRecording — там же, где пишутся флаги
 * маски, чтобы откатывать объект и его поведение одним шагом.
 * @param {Array} before - список объектов ДО операции (клонируется здесь)
 * @param {Array} after  - список объектов ПОСЛЕ операции
 */
export function recordObjectOp(before, after) {
  if (recording) {
    recording.ops.push({
      kind: 'objects',
      before: cloneObjects(before),
      after: cloneObjects(after),
    });
  }
}

/** Завершить запись и поместить batch в undo-стек (пустые отбрасываются). */
export function stopRecording() {
  if (recording && recording.ops.length > 0) {
    undoStack.push(recording);
    redoStack = []; // новое действие сбрасывает redo
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }
  recording = null;
}

/** Применяет objects-операцию: заменяет state.objects содержимым списка. */
function applyObjects(state, list) {
  state.objects = cloneObjects(list);
}

/** Отменить batch (Ctrl+Z). */
export function undo(state) {
  const action = undoStack.pop();
  if (!action) return;

  // Собираем обратное действие для redo, проходя операции задом наперёд.
  const redoOps = [];
  for (let i = action.ops.length - 1; i >= 0; i--) {
    const op = action.ops[i];

    if (op.kind === 'tile') {
      const { gx, gy, layer } = op;
      const chunkKey = `${Math.floor(gx / 16)},${Math.floor(gy / 16)}`;
      const chunk = state.chunks[chunkKey];
      if (!chunk) continue;

      let lx = gx % 16;
      let ly = gy % 16;
      if (lx < 0) lx += 16;
      if (ly < 0) ly += 16;

      const currentTileId = chunk[layer][ly * 16 + lx];
      redoOps.push({ kind: 'tile', gx, gy, layer, oldTileId: currentTileId });
      chunk[layer][ly * 16 + lx] = op.oldTileId;
    } else {
      // objects: возвращаем список к состоянию «до»; для redo запоминаем
      // { before: состояние после undo, after: текущее (= «после» операции) }.
      const current = cloneObjects(state.objects);
      applyObjects(state, op.before);
      redoOps.push({ kind: 'objects', before: cloneObjects(op.before), after: current });
    }
  }
  if (redoOps.length > 0) redoStack.push({ ops: redoOps });
}

/** Повторить отменённый batch (Ctrl+Y). */
export function redo(state) {
  const action = redoStack.pop();
  if (!action) return;

  const undoOps = [];
  for (let i = action.ops.length - 1; i >= 0; i--) {
    const op = action.ops[i];

    if (op.kind === 'tile') {
      const { gx, gy, layer } = op;
      const chunkKey = `${Math.floor(gx / 16)},${Math.floor(gy / 16)}`;
      const chunk = state.chunks[chunkKey];
      if (!chunk) continue;

      let lx = gx % 16;
      let ly = gy % 16;
      if (lx < 0) lx += 16;
      if (ly < 0) ly += 16;

      const currentTileId = chunk[layer][ly * 16 + lx];
      undoOps.push({ kind: 'tile', gx, gy, layer, oldTileId: currentTileId });
      chunk[layer][ly * 16 + lx] = op.oldTileId;
    } else {
      const current = cloneObjects(state.objects);
      applyObjects(state, op.after);
      undoOps.push({ kind: 'objects', before: current, after: cloneObjects(op.after) });
    }
  }
  if (undoOps.length > 0) undoStack.push({ ops: undoOps });
}

/** Сбросить историю (например при загрузке новой карты). */
export function clearHistory() {
  undoStack = [];
  redoStack = [];
  recording = null;
}
