import {makeTimer} from './core.js';

// Los relojes persisten sus marcas de tiempo; los intervalos solo actualizan la vista.
export function initialClock() {
  return {tab: 'countdown', minutes: '1', seconds: '30', countdown: null,
    stopwatch: {elapsedMs: 0, startedAt: null}};
}

export function parseClockDuration(minutes, seconds) {
  const fields = [minutes, seconds].map(value => String(value).trim());
  if (fields.some(value => value !== '' && !/^\d+$/.test(value))) return null;
  const [m, s] = fields.map(Number);
  const total = m * 60 + s;
  return Number.isSafeInteger(m) && Number.isSafeInteger(s) && s < 60 && total > 0 && total <= 86400 ? total : null;
}

export function makeCountdown(seconds, timestamp = Date.now()) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('Elegí una duración entre 1 segundo y 24 horas.');
  const timer = makeTimer({id: null, restSeconds: seconds}, null, timestamp);
  return {...timer, kind: 'general'};
}

export function stopwatchMs(stopwatch, timestamp = Date.now()) {
  return stopwatch.elapsedMs + (stopwatch.startedAt === null ? 0 : Math.max(0, timestamp - Date.parse(stopwatch.startedAt)));
}

export function startStopwatch(stopwatch, timestamp = Date.now()) {
  return stopwatch.startedAt === null ? {...stopwatch, startedAt: new Date(timestamp).toISOString()} : {...stopwatch};
}

export function pauseStopwatch(stopwatch, timestamp = Date.now()) {
  return {elapsedMs: stopwatchMs(stopwatch, timestamp), startedAt: null};
}

export function sessionDurationMs(session, timestamp = Date.now()) {
  const end = session.status === 'finished' ? Date.parse(session.endedAt) : timestamp;
  return Math.max(0, end - Date.parse(session.startedAt));
}

export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function sessionTotals(data, sessionId) {
  const ids = new Set(data.sessionExercises.filter(entry => entry.sessionId === sessionId).map(entry => entry.id));
  let volumeKg = 0;
  let completedVolumeKg = 0;
  let totalSets = 0;
  let completedSets = 0;
  for (const set of data.sets) {
    if (!ids.has(set.sessionExerciseId)) continue;
    totalSets++;
    if (set.completedAt) completedSets++;
    if (data.sessionExercises.find(entry=>entry.id===set.sessionExerciseId)?.loadBasisSnapshot === 'resistencia') continue;
    if (Number.isFinite(set.loadKg) && set.loadKg >= 0 && Number.isSafeInteger(set.reps) && set.reps > 0) {
      const volume = set.loadKg * set.reps;
      volumeKg += volume;
      if (set.completedAt) completedVolumeKg += volume;
    }
  }
  return {volumeKg, completedVolumeKg, totalSets, completedSets};
}
