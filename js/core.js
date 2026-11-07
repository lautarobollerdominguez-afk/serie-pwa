// Reglas puras: no dependen del DOM, IndexedDB ni la red.
export const APP_ID = 'serie.training';
export const APP_VERSION = '1.2.0';
export const SCHEMA_VERSION = 2;
export const TYPES = Object.freeze({calentamiento: 'Calentamiento', aproximacion: 'Aproximación', efectiva: 'Efectiva'});
export const LOAD_BASES = Object.freeze({total: 'Carga total', por_mancuerna: 'Por mancuerna', lastre: 'Lastre añadido', asistencia: 'Peso de asistencia', peso_corporal: 'Peso corporal (0 kg)', resistencia: 'Resistencia'});
export const DATA_STORES = ['routines', 'exercises', 'sessions', 'sessionExercises', 'sets', 'draftInputs'];
export const DEFAULT_SETTINGS = Object.freeze({soundEnabled: true, vibrationEnabled: true, keepScreenAwake: false, notificationsEnabled: false});
export const clone = value => structuredClone(value);
export const nowISO = () => new Date().toISOString();
export function uid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

export function initialData() {
  const routine = {id: uid(), name: 'Mi rutina', archived: false, days: [
    {id: uid(), name: 'Día 1: Torso', order: 1, exercises: []},
    {id: uid(), name: 'Día 2: Pierna', order: 2, exercises: []}
  ]};
  return {routines: [routine], exercises: [], sessions: [], sessionExercises: [], sets: [], draftInputs: [],
    meta: [{id: 'settings', value: {...DEFAULT_SETTINGS}}, {id: 'timer', value: null}, {id: 'selectedDayId', value: routine.days[0].id}, {id: 'lastExportAt', value: null}]};
}
export const metaValue = (data, id, fallback = null) => data.meta.find(item => item.id === id)?.value ?? fallback;
export const sorted = records => [...records].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export const entrySets = (data, entryId) => sorted(data.sets.filter(set => set.sessionExerciseId === entryId));
export const sessionEntries = (data, sessionId) => sorted(data.sessionExercises.filter(entry => entry.sessionId === sessionId));
export const activeSession = data => data.sessions.find(session => session.status === 'in_progress');
export function findDay(data, dayId) {
  for (const routine of data.routines) {
    const day = routine.days.find(item => item.id === dayId);
    if (day) return {routine, day};
  }
  return null;
}
export function previousEntry(data, currentEntry) {
  const sessions = new Map(data.sessions.map(session => [session.id, session]));
  const completedEntryIds = new Set(data.sets.filter(set => set.completedAt).map(set => set.sessionExerciseId));
  return data.sessionExercises.filter(entry => {
    const session = sessions.get(entry.sessionId);
    return entry.exerciseId === currentEntry.exerciseId && entry.sessionId !== currentEntry.sessionId &&
      session?.status === 'finished' && Date.parse(session.startedAt) < Date.parse(currentEntry.sessionStartedAt) &&
      completedEntryIds.has(entry.id);
  }).sort((a,b) => Date.parse(b.sessionStartedAt) - Date.parse(a.sessionStartedAt) || b.id.localeCompare(a.id))[0] || null;
}
export function parseField(raw, field) {
  const value = String(raw).trim();
  if (field === 'durationSeconds') {
    if (!value) return {valid:true,value:null};
    const parts = value.split(':');
    const seconds = /^\d+$/.test(value) ? Number(value) : /^\d{1,4}:[0-5]\d$/.test(value) ? Number(parts[0])*60+Number(parts[1]) : NaN;
    return {valid:Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400,value:Number.isFinite(seconds)?seconds:null};
  }
  if (!value) return {valid: true, value: null};
  const pattern = field === 'loadKg' ? /^\d+(?:[.,]\d+)?$/ : /^\d+$/;
  if (!pattern.test(value)) return {valid: false, value: null};
  const number = Number(value.replace(',', '.'));
  const minimum = field === 'reps' ? 1 : 0;
  return {valid: Number.isFinite(number) && Number.isSafeInteger(Math.trunc(number)) && number >= minimum, value: number};
}
export function validCompletedSet(set, basis = 'total') {
  if (basis === 'resistencia') return Number.isSafeInteger(set.durationSeconds) && set.durationSeconds > 0 && set.durationSeconds <= 86400;
  return Number.isFinite(set.loadKg) && set.loadKg >= 0 && Number.isSafeInteger(set.reps) && set.reps > 0 &&
    (set.rir === null || (Number.isSafeInteger(set.rir) && set.rir >= 0));
}
export function makeTimer(entry, setId, timestamp = Date.now()) {
  if (!entry.restSeconds) return null;
  return {id: uid(), sessionExerciseId: entry.id, triggerSetId: setId, durationSeconds: entry.restSeconds,
    startedAt: new Date(timestamp).toISOString(), endsAt: new Date(timestamp + entry.restSeconds * 1000).toISOString(),
    remainingMs: null, status: 'running', alertHandledAt: null};
}
export function remainingMs(timer, timestamp = Date.now()) {
  if (!timer) return 0;
  return Math.max(0, timer.status === 'paused' ? timer.remainingMs : Date.parse(timer.endsAt) - timestamp);
}
export function pauseTimer(timer, timestamp = Date.now()) {
  return {...timer, status: 'paused', remainingMs: remainingMs(timer, timestamp)};
}
export function resumeTimer(timer, timestamp = Date.now()) {
  return {...timer, status: 'running', endsAt: new Date(timestamp + remainingMs(timer, timestamp)).toISOString(), remainingMs: null, alertHandledAt: null};
}
export function adjustTimer(timer, seconds, timestamp = Date.now()) {
  const remaining = Math.max(0, remainingMs(timer, timestamp) + seconds * 1000);
  return {...timer, durationSeconds: Math.max(1, timer.durationSeconds + seconds),
    endsAt: new Date(timestamp + remaining).toISOString(), remainingMs: timer.status === 'paused' ? remaining : null,
    status: timer.status === 'paused' ? 'paused' : 'running', alertHandledAt: null};
}
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export const formatNumber = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('es-AR', {maximumFractionDigits: 6}).format(value);

export function buildBackup(data, timestamp = nowISO()) {
  const payload = Object.fromEntries(DATA_STORES.map(store => [store, clone(data[store])]));
  payload.settings = clone(metaValue(data, 'settings', DEFAULT_SETTINGS));
  return {appId: APP_ID, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: timestamp, data: payload};
}

// El importador reconstruye cada registro con campos permitidos. No mezcla objetos externos con el estado.
export function validateBackup(input) {
  const fail = message => { throw new Error(`Respaldo no válido: ${message}`); };
  const obj = (value, name) => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(name); return value; };
  const str = (value, name, max = 160, empty = false) => {
    if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(name);
    return value;
  };
  const id = value => { const result = str(value, 'identificador', 128); if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail('identificador'); return result; };
  const num = (value, name, min = 0, integer = false) => {
    if (!Number.isFinite(value) || value < min || !Number.isSafeInteger(Math.trunc(value)) || (integer && !Number.isSafeInteger(value))) fail(name);
    return value;
  };
  const bool = value => { if (typeof value !== 'boolean') fail('valor booleano'); return value; };
  const rest = value => { num(value, 'descanso', 0, true); if (value > 86400) fail('descanso superior a 24 horas'); return value; };
  const date = (value, nullable = false) => {
    if (nullable && value === null) return null;
    str(value, 'fecha', 40);
    if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('fecha');
    return new Date(value).toISOString();
  };
  const en = (value, allowed) => { if (!allowed.includes(value)) fail('opción desconocida'); return value; };
  const list = (value, name, map) => {
    if (!Array.isArray(value)) fail(name);
    const result = value.map((item, index) => map(obj(item, `${name}[${index}]`)));
    const ids = result.filter(item => item.id).map(item => item.id);
    if (new Set(ids).size !== ids.length) fail(`identificadores duplicados en ${name}`);
    return result;
  };
  obj(input, 'estructura principal');
  if (input.appId !== APP_ID) fail('el archivo no pertenece a Serie');
  if (![1, SCHEMA_VERSION].includes(input.schemaVersion)) fail(input.schemaVersion > SCHEMA_VERSION ? 'actualizá la app antes de importar esta versión' : 'versión no compatible');
  date(input.exportedAt);
  const source = obj(input.data, 'datos');
  const exercises = list(source.exercises, 'ejercicios', x => ({id: id(x.id), name: str(x.name, 'nombre de ejercicio'), loadBasis: en(x.loadBasis, Object.keys(LOAD_BASES)), archived: bool(x.archived)}));
  const routines = list(source.routines, 'rutinas', x => ({id: id(x.id), name: str(x.name, 'nombre de rutina'), archived: bool(x.archived), days: list(x.days, 'días', d => ({
    id: id(d.id), name: str(d.name, 'nombre de día'), order: num(d.order, 'orden', 0, true), exercises: list(d.exercises, 'ejercicios del día', p => ({
      id: id(p.id), exerciseId: id(p.exerciseId), order: num(p.order, 'orden', 0, true), restSeconds: rest(p.restSeconds),
      defaultNote: str(p.defaultNote, 'nota', 8000, true), setPlan: list(p.setPlan, 'plan de series', s => ({type: en(s.type, Object.keys(TYPES))}))
    }))
  }))}));
  const sessions = list(source.sessions, 'sesiones', x => ({id: id(x.id), routineId: id(x.routineId), dayId: id(x.dayId),
    dayNameSnapshot: str(x.dayNameSnapshot, 'nombre de sesión'), startedAt: date(x.startedAt), endedAt: date(x.endedAt, true), status: en(x.status, ['in_progress', 'finished'])}));
  const sessionExercises = list(source.sessionExercises, 'ejercicios realizados', x => ({id: id(x.id), sessionId: id(x.sessionId), exerciseId: id(x.exerciseId), placementId: x.placementId === null ? null : id(x.placementId),
    sessionStartedAt: date(x.sessionStartedAt), order: num(x.order, 'orden', 0, true), nameSnapshot: str(x.nameSnapshot, 'nombre de ejercicio'),
    loadBasisSnapshot: en(x.loadBasisSnapshot, Object.keys(LOAD_BASES)), restSeconds: rest(x.restSeconds), note: str(x.note, 'nota', 8000, true)}));
  const sets = list(source.sets, 'series', x => ({id: id(x.id), sessionExerciseId: id(x.sessionExerciseId), order: num(x.order, 'orden', 0, true), type: en(x.type, Object.keys(TYPES)),
    loadKg: x.loadKg === null ? null : num(x.loadKg, 'carga'), reps: x.reps === null ? null : num(x.reps, 'repeticiones', 1, true),
    ...(x.durationSeconds !== undefined ? {durationSeconds:x.durationSeconds === null ? null : num(x.durationSeconds, 'duración', 1, true)} : {}),
    rir: x.rir === null ? null : num(x.rir, 'RIR', 0, true), completedAt: date(x.completedAt, true)}));
  const draftInputs = list(source.draftInputs, 'borradores', x => ({id: str(x.id, 'identificador de borrador', 160), setId: id(x.setId), field: en(x.field, ['loadKg','reps','rir','durationSeconds']), raw: str(x.raw, 'borrador', 100, true)}));
  const settingSource = obj(source.settings, 'ajustes');
  const settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, bool(settingSource[key])]));
  // Los permisos y temporizadores son del dispositivo receptor.
  settings.notificationsEnabled = false;
  settings.keepScreenAwake = false;
  const exerciseIds = new Set(exercises.map(x => x.id));
  const sessionMap = new Map(sessions.map(x => [x.id, x]));
  const entryIds = new Set(sessionExercises.map(x => x.id));
  const setMap = new Map(sets.map(x => [x.id, x]));
  const days = routines.flatMap(x => x.days);
  const placements = days.flatMap(x => x.exercises);
  if (new Set(days.map(x => x.id)).size !== days.length || new Set(placements.map(x => x.id)).size !== placements.length) fail('días o ubicaciones duplicados');
  if (sessions.filter(x => x.status === 'in_progress').length > 1) fail('más de una sesión activa');
  for (const s of sessions) if ((s.status === 'finished') !== (s.endedAt !== null)) fail('estado de sesión inconsistente');
  for (const p of placements) if (!exerciseIds.has(p.exerciseId)) fail('ejercicio inexistente en una rutina');
  for (const e of sessionExercises) {
    const session = sessionMap.get(e.sessionId);
    if (!session || !exerciseIds.has(e.exerciseId)) fail('referencia de historial inexistente');
    e.sessionStartedAt = session.startedAt;
  }
  for (const s of sets) {
    if (!entryIds.has(s.sessionExerciseId)) fail('serie sin ejercicio');
    const basis = sessionExercises.find(e=>e.id===s.sessionExerciseId).loadBasisSnapshot;
    if (s.durationSeconds > 86400) fail('duración superior a 24 horas');
    if (basis === 'resistencia' && (s.loadKg !== null || s.reps !== null || s.rir !== null)) fail('resistencia con campos de carga');
    if (s.completedAt && !validCompletedSet(s, basis)) fail('serie realizada con valores incompletos');
  }
  for (const d of draftInputs) {
    if (!setMap.has(d.setId) || d.id !== `${d.setId}:${d.field}`) fail('borrador sin serie o clave inválida');
    const parsed = parseField(d.raw, d.field);
    const expected = parsed.valid ? parsed.value : null;
    if (setMap.get(d.setId)[d.field] !== expected) fail('borrador inconsistente');
    if (setMap.get(d.setId).completedAt && !parsed.valid) fail('serie realizada con un borrador inválido');
  }
  return {routines, exercises, sessions, sessionExercises, sets, draftInputs, meta: [
    {id: 'settings', value: settings}, {id: 'timer', value: null},
    {id: 'selectedDayId', value: days[0]?.id || null}, {id: 'lastExportAt', value: null}
  ]};
}
