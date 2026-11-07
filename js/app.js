import {APP_VERSION, DEFAULT_SETTINGS, TYPES, LOAD_BASES, clone, uid, nowISO, escapeHTML as esc, metaValue, sorted, entrySets, sessionEntries, activeSession, findDay, previousEntry, parseField, validCompletedSet, makeTimer, remainingMs, pauseTimer, resumeTimer, adjustTimer, formatDuration, formatNumber as number, buildBackup, validateBackup} from './core.js';
import {Repository, DB_NAME, put, remove, putMeta, applyMemory} from './db.js';
import {icon} from './icons.js';
import {Alerts} from './alerts.js';
import {PWA} from './pwa.js';
import {initialClock, parseClockDuration, makeCountdown, stopwatchMs, startStopwatch, pauseStopwatch, sessionDurationMs, formatElapsed, sessionTotals} from './clocks.js';

const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const toastElement = document.getElementById('toast');
const ui = {view: 'train', routineId: null, editSessionId: null, historyExerciseId: '', historyMonth: '', historyLimit: 30, saveStatus: 'saved', saveError: '', busy: false};
let data;
let toastTimeout;
let toastAction;
let dialogSubmit;
let dialogCancel;
let timerHandling = false;
const alerts = new Alerts(updateCapabilities);
const pwa = new PWA(updateCapabilities);
const repo = new Repository(DB_NAME, (status, error) => {
  ui.saveStatus = status;
  ui.saveError = error?.message || '';
  updateSaveStatus();
});

const settings = () => metaValue(data, 'settings', DEFAULT_SETTINGS);
const timer = () => metaValue(data, 'timer');
const clock = () => metaValue(data, 'clock', initialClock());
const byId = (store, id) => data[store].find(record => record.id === id);
const currentSession = () => (ui.editSessionId && byId('sessions', ui.editSessionId)) || activeSession(data);
const shortDate = value => new Intl.DateTimeFormat('es-AR', {day:'numeric', month:'short'}).format(new Date(value));
const fullDate = value => new Intl.DateTimeFormat('es-AR', {day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
const button = (action, text, symbol = '', cls = '', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${symbol ? icon(symbol) : ''}${text}</button>`;
const iconButton = (action, label, symbol, attrs = '') => button(action, '', symbol, 'icon-button ghost', `aria-label="${esc(label)}" title="${esc(label)}" ${attrs}`);
const options = (items, selected) => Object.entries(items).map(([value,label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');

function commit(operations, redraw = true) {
  if (!operations.length) return;
  applyMemory(data, operations);
  repo.enqueue(operations);
  if (redraw) render();
}
function toast(message, actionLabel = '', action = null) {
  clearTimeout(toastTimeout);
  toastAction = action;
  toastElement.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button type="button" id="toast-action">${esc(actionLabel)}</button>` : ''}`;
  toastElement.hidden = false;
  toastTimeout = setTimeout(() => {toastElement.hidden = true; toastAction = null;}, action ? 10000 : 5000);
}
toastElement.addEventListener('click', async event => {
  if (event.target.closest('#toast-action') && toastAction) {
    const action = toastAction; toastAction = null; toastElement.hidden = true;
    try {await action();} catch (error) {toast(error.message);}
  }
});
function showDialog(title, body, {submit = null, submitLabel = 'Guardar', destructive = false, cancel = null, footer = ''} = {}) {
  if (dialog.open) closeDialog();
  dialogSubmit = submit;
  dialogCancel = cancel;
  dialog.innerHTML = `<form id="dialog-form"><div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>${iconButton('close-dialog','Cerrar','close')}</div><div class="dialog-body">${body}<p id="form-error" class="form-error" role="alert"></p></div><div class="dialog-actions ${submit ? '' : 'sticky'}">${footer || button('close-dialog', submit ? 'Cancelar' : 'Cerrar', '', 'secondary')}${submit ? `<button type="submit" class="${destructive ? 'danger' : 'primary'}">${esc(submitLabel)}</button>` : ''}</div></form>`;
  dialog.showModal();
}
function closeDialog(result = false) {
  const cancel = dialogCancel;
  dialogCancel = null; dialogSubmit = null;
  dialog.close();
  dialog.classList.remove('clock-sheet');
  if (cancel && !result) cancel();
}
function confirmAction(title, message, label = 'Confirmar', destructive = false) {
  return new Promise(resolve => showDialog(title, `<p class="muted">${esc(message)}</p>`, {
    submitLabel: label, destructive,
    cancel: () => resolve(false),
    submit: async () => {closeDialog(true); resolve(true);}
  }));
}
dialog.addEventListener('cancel', event => {event.preventDefault(); closeDialog();});
dialog.addEventListener('submit', async event => {
  event.preventDefault();
  if (!dialogSubmit) return;
  const submit = dialogSubmit;
  const form = event.target;
  const submitButton = form.querySelector('[type=submit]');
  submitButton.disabled = true;
  try {await submit(new FormData(form), form);}
  catch (error) {const field = dialog.querySelector('#form-error'); if (field) field.textContent = error.message;}
  finally {if (submitButton.isConnected) submitButton.disabled = false;}
});

function setView(view) {
  ui.view = ['train','routines','history','settings'].includes(view) ? view : 'train';
  ui.editSessionId = null;
  history.pushState(null, '', `#${ui.view}`);
  render(); window.scrollTo({top: 0});
}
function logo() {return '<div class="logo"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-word">SERIE<span>.</span></span></div>';}
function navigation(mobile = false) {
  return [['train','Entrenar','train'],['routines','Rutinas','grid'],['history','Historial','history'],['settings','Ajustes','settings']].map(([view,label,symbol]) =>
    button('view', `<span>${label}</span>`, symbol, `${mobile ? '' : 'nav-button'} ${ui.view === view ? 'active' : ''}`, `data-view="${view}" ${ui.view === view ? 'aria-current="page"' : ''}`)).join('');
}
function render() {
  if (!data) return;
  const focusId = document.activeElement?.id;
  let body = ui.view === 'train' ? renderTrain() : ui.view === 'routines' ? renderRoutines() : ui.view === 'history' ? renderHistory() : renderSettings();
  if(ui.view === 'routines' && data.routines.some(r=>r.archived)) body += button('restore-routine', 'Restaurar rutina archivada', 'history', 'ghost wide', 'style="margin-top:16px"');
  app.className = `app-shell ${timer() ? 'has-timer' : ''}`;
  app.innerHTML = `<aside class="sidebar">${logo()}<p class="side-caption">TU ESPACIO DE ENTRENAMIENTO</p><nav aria-label="Navegación principal">${navigation()}</nav><div class="sidebar-bottom">${button('install','Instalar app','download','secondary wide')}<div class="privacy-caption"><strong>${icon('shield')} Solo en tu dispositivo</strong>Sin cuentas. Sin distracciones.<div id="offline-sidebar" style="margin-top:10px"></div></div></div></aside>
    <main id="main" class="main-area" tabindex="-1"><header class="topbar"><div class="mobile-logo">${logo()}</div><p class="date">${new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</p><div class="row topbar-actions"><span id="offline-state" class="status-chip"></span><span id="save-state" class="status-chip" role="status" aria-live="polite"></span></div></header>
    <div id="save-error-banner" class="banner error" hidden><span>No se pudo guardar. Tus cambios siguen abiertos.</span><div class="row">${button('retry-save','Reintentar','','secondary')}${button('export','Respaldar','','secondary')}</div></div>
    <div id="update-banner" class="banner" hidden><span>Hay una nueva versión de Serie.</span>${button('update-app','Actualizar','refresh','secondary')}</div><section id="page">${body}</section></main>
    <nav class="bottom-nav" aria-label="Navegación móvil">${navigation(true)}</nav>${ui.view !== 'train' && timer() ? `<aside class="offpage-timer" aria-label="Descanso activo">${renderTimer()}</aside>` : ''}`;
  updateSaveStatus(); updateCapabilities(); tickTimer();
  alerts.setWake(!!activeSession(data) && settings().keepScreenAwake);
  if (focusId) document.getElementById(focusId)?.focus({preventScroll:true});
}
function updateSaveStatus() {
  const element = document.getElementById('save-state');
  if (element) {
    element.className = `status-chip ${ui.saveStatus}`;
    element.innerHTML = `<span class="status-dot"></span>${ui.saveStatus === 'saving' ? 'Guardando…' : ui.saveStatus === 'error' ? 'Sin guardar' : 'Guardado'}`;
    element.title = ui.saveError;
  }
  const banner = document.getElementById('save-error-banner');
  if (banner) banner.hidden = ui.saveStatus !== 'error';
}
function updateCapabilities() {
  const state = pwa.offlineReady ? (navigator.onLine ? 'Offline listo' : 'Sin conexión') : 'Preparando offline';
  for (const id of ['offline-state','offline-sidebar']) {
    const element = document.getElementById(id);
    if (element) element.textContent = pwa.error ? 'Offline sin preparar' : state;
  }
  const update = document.getElementById('update-banner');
  if (update) update.hidden = !pwa.registration?.waiting;
  const status = document.getElementById('pwa-status');
  if (status) status.textContent = pwa.error || (pwa.installed ? 'Instalada en este dispositivo.' : pwa.offlineReady ? 'Lista para funcionar sin conexión.' : 'Preparando archivos para el modo offline…');
  const wake = document.getElementById('wake-status');
  if (wake) wake.textContent = alerts.wakeLock ? 'Pantalla encendida durante la sesión.' : !('wakeLock' in navigator) ? 'No disponible en este navegador.' : settings()?.keepScreenAwake ? 'Se activa con una sesión abierta y la app visible.' : 'Permite que la pantalla se apague normalmente.';
  const sound = document.getElementById('audio-status');
  if (sound) sound.textContent = alerts.audioReady ? 'Sonido activado en esta apertura.' : 'Tocá “Probar alerta” para activar y comprobar el sonido.';
}
function stats() {
  const finished = data.sessions.filter(session => session.status === 'finished');
  const since = Date.now() - 7 * 86400000;
  const week = finished.filter(session => Date.parse(session.startedAt) >= since);
  return `<div class="stat-grid"><div class="stat"><b>${week.length.toString().padStart(2,'0')}</b><span>Sesiones · últimos 7 días</span></div><div class="stat"><b>${finished.length.toString().padStart(2,'0')}</b><span>Sesiones registradas</span></div><div class="stat"><b>${data.exercises.filter(e=>!e.archived).length.toString().padStart(2,'0')}</b><span>Ejercicios en tu catálogo</span></div></div>`;
}
function clockShortcut() {
  return button('open-clock', `${icon('clock')}<span>Reloj</span><small data-clock-preview hidden></small>`, '', 'secondary clock-shortcut', 'aria-label="Abrir reloj general"');
}
function sessionMetrics(session, live = false) {
  const totals = sessionTotals(data, session.id);
  return `<div class="session-metrics" aria-label="Resumen del entrenamiento">
    <div><span>Duración</span><strong ${live ? 'id="session-duration"' : ''}>${formatElapsed(sessionDurationMs(session))}</strong><small>${session.status === 'finished' ? 'Entrenamiento finalizado' : 'Desde el inicio'}</small></div>
    <div><span>Volumen total</span><strong ${live ? 'id="session-volume"' : ''}>${number(totals.volumeKg)} <em>kg</em></strong><small ${live ? 'id="session-volume-done"' : ''}>${number(totals.completedVolumeKg)} kg realizados</small></div>
    <div><span>Series totales</span><strong ${live ? 'id="session-sets"' : ''}>${totals.totalSets}</strong><small ${live ? 'id="session-sets-done"' : ''}>${totals.completedSets} ${totals.completedSets === 1 ? 'realizada' : 'realizadas'}</small></div>
  </div><p class="metrics-note">Volumen: suma de kg × repeticiones de todas las series con datos completos. Se usa la carga tal como la registraste.</p>`;
}
function renderTrain() {
  const session = currentSession();
  let main;
  if (session) {
    const entries = sessionEntries(data, session.id);
    const ids = new Set(entries.map(entry=>entry.id));
    const sets = data.sets.filter(set=>ids.has(set.sessionExerciseId));
    const done = sets.filter(set=>set.completedAt).length;
    main = `<div class="workout-title"><div class="row between wrap"><div><div class="eyebrow">${ui.editSessionId ? 'Corregir registro' : 'Entrenamiento en curso'}</div><h2 style="margin-top:8px">${esc(session.dayNameSnapshot)}</h2></div><span class="badge green" id="session-progress">${done} / ${sets.length} series</span></div><div class="progress-track"><div class="progress-fill" style="width:${sets.length ? done / sets.length * 100 : 0}%"></div></div></div>
    ${sessionMetrics(session, true)}
    ${ui.editSessionId ? '<p class="hint" style="margin-bottom:18px">Estás corrigiendo una sesión finalizada. Los cambios se guardan automáticamente; no se inicia el descanso.</p>' : ''}
    ${entries.map((entry,index)=>renderEntry(entry,index)).join('') || '<div class="card empty"><h2>Sumá tu primer ejercicio</h2><p>Esta sesión ya está guardada. Podés añadir ejercicios cuando quieras.</p></div>'}
    ${button('session-add-exercise','Añadir ejercicio','plus','secondary wide')}
    <div class="session-footer">${ui.editSessionId ? button('end-edit','Terminar corrección','check','primary') : button('discard-session','Descartar sesión','','ghost') + button('finish-session','Finalizar entrenamiento','check','primary')}</div>`;
  } else {
    const routines = data.routines.filter(r=>!r.archived);
    const selected = findDay(data, metaValue(data,'selectedDayId'));
    const routine = selected && !selected.routine.archived ? selected.routine : routines.find(r=>r.id===ui.routineId) || routines[0];
    const day = selected?.routine.id === routine?.id ? selected.day : sorted(routine?.days || [])[0];
    main = `<div class="card ready-hero"><div class="hero-line"></div><span class="badge green">TU PRÓXIMA SESIÓN</span><h2>Un registro. Un paso más.</h2><p>Elegí tu día, registrá tus series y seguí tu progreso.</p>${day ? button('start-session','Empezar entrenamiento','play','primary',`data-day="${day.id}"`) : button('view','Crear mi rutina','plus','primary','data-view="routines"')}</div>
      ${stats()}${routine ? `<label class="routine-select-label" for="train-routine">RUTINA</label><select id="train-routine" class="wide" data-select="train-routine">${routines.map(r=>`<option value="${r.id}" ${r.id===routine.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><div class="day-tabs" aria-label="Días de entrenamiento">${sorted(routine.days).map(d=>button('select-day',esc(d.name),'',`day-tab ${d.id===day?.id?'active':''}`,`data-day="${d.id}" aria-pressed="${d.id===day?.id}"`)).join('')}</div>` : ''}
      <div class="section-label"><h2>${day ? esc(day.name) : 'Tu rutina'}</h2>${button('view','Editar','edit','ghost','data-view="routines"')}</div>
      ${day?.exercises.length ? `<div class="card day-editor-list">${sorted(day.exercises).map((p,i)=>{const exercise=byId('exercises',p.exerciseId);return `<div class="placement"><span class="exercise-number">${String(i+1).padStart(2,'0')}</span><div class="placement-info"><h3>${esc(exercise?.name)}</h3><p>${p.setPlan.length} series · Descanso ${formatDuration(p.restSeconds*1000)} · ${esc(LOAD_BASES[exercise?.loadBasis])}</p></div>${icon('arrow')}</div>`;}).join('')}</div>` : `<div class="card empty"><div class="empty-symbol">${icon('train')}</div><h2>Tu rutina empieza acá</h2><p>Añadí tus ejercicios y definí las series y el descanso de cada uno.</p>${button('view','Configurar rutina','plus','secondary','data-view="routines"')}</div>`}`;
  }
  return `<div class="page-heading"><div><p class="eyebrow">CONSTRUÍ TU PROGRESO</p><h1>Vamos con la próxima.</h1></div><div class="heading-tools">${clockShortcut()}${button('view','<span class="button-text">Ver historial</span>','history','secondary','data-view="history" aria-label="Ver historial"')}</div></div><div class="training-layout"><div class="train-main">${main}</div><aside class="workout-side" aria-label="Descanso y ayuda">${renderTimer()}<div class="card side-tip"><h3>${icon('info')} Tu referencia, a mano</h3><p>Debajo de cada ejercicio vas a ver tu última sesión. Compará carga, repeticiones y RIR antes de la siguiente serie.</p></div><div class="card side-tip"><h3>${icon('shield')} Tu registro es tuyo</h3><p>Todo queda en este navegador. Exportá un respaldo para llevarlo al celular o a la PC.</p></div></aside></div>`;
}
function renderEntry(entry,index) {
  const previous = previousEntry(data,entry);
  const previousSets = previous ? entrySets(data,previous.id).filter(set=>set.completedAt) : [];
  const summary = previousSets.map(set=>entry.loadBasisSnapshot==='resistencia'?`${TYPES[set.type].slice(0,1)} ${formatDuration(set.durationSeconds*1000)}`:`${TYPES[set.type].slice(0,1)} ${number(set.loadKg)} × ${set.reps}${set.rir!==null ? ` · RIR ${set.rir}` : ''}`).join(' · ');
  return `<article class="card exercise-card" data-entry="${entry.id}"><div class="exercise-header"><div class="exercise-heading"><span class="exercise-number">${String(index+1).padStart(2,'0')}</span><div class="exercise-name"><h3>${esc(entry.nameSnapshot)}</h3><p class="load-caption">${esc(LOAD_BASES[entry.loadBasisSnapshot])}${entry.loadBasisSnapshot==='resistencia'?' · duración':' · kg'}</p></div><div class="exercise-tools">${iconButton('entry-menu',`Opciones de ${entry.nameSnapshot}`,'more',`data-id="${entry.id}"`)}</div></div>
    <div class="previous">${previous ? `${button('copy-previous','Copiar','','ghost',`data-id="${entry.id}"`)}<span>ÚLTIMA VEZ · ${shortDate(previous.sessionStartedAt)}</span><br><strong>${esc(summary)}</strong>${previous.note ? `<br><span>${esc(previous.note)}</span>` : ''}` : '<span>Primera sesión de este ejercicio. Acá aparecerá tu referencia.</span>'}</div></div>
    <div class="set-list">${entrySets(data,entry.id).map((set,i)=>renderSet(set,i)).join('')}</div>${button('add-set','Añadir serie','plus','add-set',`data-id="${entry.id}"`)}
    <div class="exercise-footer"><span class="field-label">NOTA RÁPIDA</span>${button('rest-config',formatDuration(entry.restSeconds*1000),'clock','rest-shortcut',`data-id="${entry.id}" aria-label="Configurar descanso de ${esc(entry.nameSnapshot)}"`)}</div><div class="exercise-note"><textarea class="note-input" rows="1" maxlength="8000" data-entry-note="${entry.id}" aria-label="Nota de ${esc(entry.nameSnapshot)}" placeholder="¿Algo para la próxima serie?">${esc(entry.note)}</textarea></div></article>`;
}
function rawField(set,field) {return data.draftInputs.find(d=>d.setId===set.id&&d.field===field)?.raw ?? (set[field]==null ? '' : field==='durationSeconds' ? formatDuration(set[field]*1000) : String(set[field]).replace('.',','));}
function renderSet(set,index) {
  const input = (field,label,mode) => {
    const raw = rawField(set,field);
    return `<input id="set-${set.id}-${field}" class="field-input" type="text" inputmode="${mode}" autocomplete="off" maxlength="100" data-set="${set.id}" data-field="${field}" value="${esc(raw)}" aria-label="${label}, serie ${index+1}" aria-invalid="${!parseField(raw,field).valid}" placeholder="—">`;
  };
  if (byId('sessionExercises',set.sessionExerciseId).loadBasisSnapshot === 'resistencia') {
    return `<div class="set-row endurance-row ${set.completedAt?'done':''}"><span class="set-number">${String(index+1).padStart(2,'0')}</span><select class="set-type ${set.type}" data-set="${set.id}" data-field="type" aria-label="Tipo de serie ${index+1}">${options(TYPES,set.type)}</select><label class="input-cell endurance-duration"><span class="field-label">DURACIÓN · MIN:SEG</span>${input('durationSeconds','Duración, minutos:segundos','text')}<small>Ej.: 20:00 = 20 min; 30 = 30 s</small></label><input class="done-check" type="checkbox" data-complete="${set.id}" aria-label="Marcar serie ${index+1} como realizada" ${set.completedAt?'checked':''}>${button('set-menu','','more','icon-button ghost set-menu',`data-set="${set.id}" aria-label="Opciones de serie ${index+1}"`)}</div>`;
  }
  return `<div class="set-row ${set.completedAt?'done':''}"><span class="set-number">${String(index+1).padStart(2,'0')}</span><select class="set-type ${set.type}" data-set="${set.id}" data-field="type" aria-label="Tipo de serie ${index+1}">${options(TYPES,set.type)}</select>
    <label class="input-cell load"><span class="field-label">KG</span>${input('loadKg','Carga en kg','decimal')}</label><label class="input-cell reps"><span class="field-label">REPS</span>${input('reps','Repeticiones','numeric')}</label>
    <div class="input-cell rir"><span class="field-label">RIR</span><div class="rir-control">${button('rir-step','','minus','',`id="rir-minus-${set.id}" data-set="${set.id}" data-step="-1" aria-label="Reducir RIR de serie ${index+1}"`)}${input('rir','RIR','numeric')}${button('rir-step','','plus','',`id="rir-plus-${set.id}" data-set="${set.id}" data-step="1" aria-label="Aumentar RIR de serie ${index+1}"`)}</div></div>
    <input class="done-check" type="checkbox" data-complete="${set.id}" aria-label="Marcar serie ${index+1} como realizada" ${set.completedAt?'checked':''}>
    ${button('set-menu','','more','icon-button ghost set-menu',`data-set="${set.id}" aria-label="Opciones de serie ${index+1}"`)}</div>`;
}
function renderTimer() {
  const t = timer();
  const entry = t && byId('sessionExercises', t.sessionExerciseId);
  return `<div class="card timer-card ${!t?'timer-empty':t.status==='elapsed'?'timer-expired':''}" id="timer-card"><p class="eyebrow">${icon('clock')} ${t?'DESCANSO':'ENTRE SERIES'}</p><div class="timer-dial"><span class="timer-time" id="timer-time">${t?formatDuration(remainingMs(t)):'00:00'}</span><span class="timer-state" id="timer-state">${!t?'LISTO CUANDO VOS':t.status==='paused'?'EN PAUSA':t.status==='elapsed'?'TERMINADO':'RECUPERÁ EL AIRE'}</span></div><p class="timer-exercise">${entry?esc(entry.nameSnapshot):'Marcá una serie para iniciar el descanso automáticamente.'}</p>
    ${t?`<div class="timer-controls">${button('timer-adjust','−15','','', 'data-seconds="-15" aria-label="Restar 15 segundos"')}${button('timer-pause','',t.status==='paused'?'play':'pause','',`aria-label="${t.status==='paused'?'Reanudar':'Pausar'} descanso" ${t.status==='elapsed'?'disabled':''}`)}${button('timer-adjust','+15','','','data-seconds="15" aria-label="Añadir 15 segundos"')}${iconButton('timer-cancel','Cancelar descanso','close')}</div>`:''}
    <p class="timer-note">El tiempo se recupera al volver.<br>Con la pantalla bloqueada, la alerta puede no sonar.</p>${button('test-alert','Probar alerta','sound','ghost wide timer-cancel')}</div>`;
}
function renderRoutines() {
  const routines = data.routines.filter(r=>!r.archived);
  const routine = routines.find(r=>r.id===ui.routineId) || routines[0];
  if (routine) ui.routineId = routine.id;
  return `<div class="page-heading"><div><p class="eyebrow">A TU MEDIDA</p><h1>Tus rutinas.</h1><p>Organizá los días. El historial se conserva.</p></div><div class="heading-tools">${clockShortcut()}${button('new-routine','<span class="button-text">Nueva rutina</span>','plus','primary','aria-label="Crear rutina"')}</div></div>
    ${routine ? `<div class="routine-picker"><select aria-label="Rutina a editar" data-select="edit-routine">${routines.map(r=>`<option value="${r.id}" ${r.id===routine.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>${iconButton('rename-routine','Renombrar rutina','edit',`data-id="${routine.id}"`)}${iconButton('duplicate-routine','Duplicar rutina','copy',`data-id="${routine.id}"`)}${iconButton('delete-routine','Archivar rutina','trash',`data-id="${routine.id}"`)}</div>
    ${sorted(routine.days).map((day,index)=>`<article class="card day-editor"><div class="day-editor-header"><span class="exercise-number">${String(index+1).padStart(2,'0')}</span><h3>${esc(day.name)}</h3><span class="badge">${day.exercises.length} ejercicios</span>${iconButton('day-menu',`Opciones de ${day.name}`,'more',`data-id="${day.id}"`)}</div><div class="day-editor-list">${sorted(day.exercises).map((placement,i)=>{const exercise=byId('exercises',placement.exerciseId);return `<div class="placement"><span class="placement-order">${String(i+1).padStart(2,'0')}</span><div class="placement-info"><h3>${esc(exercise?.name)}</h3><p>${placement.setPlan.length} series · ${formatDuration(placement.restSeconds*1000)} de descanso</p></div><div class="placement-actions">${iconButton('move-placement','Subir ejercicio','up',`data-id="${placement.id}" data-day="${day.id}" data-step="-1" ${i===0?'disabled':''}`)}${iconButton('edit-placement','Editar ejercicio','edit',`data-id="${placement.id}" data-day="${day.id}"`)}</div></div>`;}).join('') || '<p class="subtext" style="padding:24px 14px">Todavía no hay ejercicios en este día.</p>'}</div><div class="day-editor-add">${button('add-placement','Añadir ejercicio','plus','ghost',`data-day="${day.id}"`)}</div></article>`).join('')}${button('new-day','Añadir día','plus','secondary wide',`data-id="${routine.id}"`)}` : `<div class="card empty"><div class="empty-symbol">${icon('grid')}</div><h2>Un lugar para cada día</h2><p>Creá tu primera rutina y añadí los días que necesites.</p>${button('new-routine','Crear rutina','plus','primary')}</div>`}`;
}
function renderHistory() {
  let sessions = data.sessions.filter(s=>s.status==='finished').sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
  const months = [...new Set(sessions.map(s=>localMonth(s.startedAt)))];
  if (ui.historyExerciseId) {
    const ids = new Set(data.sessionExercises.filter(e=>e.exerciseId===ui.historyExerciseId).map(e=>e.sessionId));
    sessions = sessions.filter(s=>ids.has(s.id));
  }
  if (ui.historyMonth) sessions = sessions.filter(s=>localMonth(s.startedAt)===ui.historyMonth);
  const loadMore = sessions.length > ui.historyLimit ? button('history-more', 'Cargar 30 sesiones más', 'plus', 'secondary wide') : '';
  return `<div class="page-heading"><div><p class="eyebrow">CADA SESIÓN CUENTA</p><h1>Tu recorrido.</h1><p>Volvé a tus registros y compará a tu ritmo.</p></div>${button('export','<span class="button-text">Respaldar</span>','download','secondary')}</div><div class="history-filters"><select aria-label="Filtrar por ejercicio" data-select="history-exercise"><option value="">Todos los ejercicios</option>${data.exercises.map(e=>`<option value="${e.id}" ${ui.historyExerciseId===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select><select aria-label="Filtrar por mes" data-select="history-month"><option value="">Todos los meses</option>${months.map(m=>`<option value="${m}" ${ui.historyMonth===m?'selected':''}>${new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(new Date(`${m}-15T12:00:00`))}</option>`).join('')}</select></div>
    ${sessions.slice(0,ui.historyLimit).map(s=>{const entries=sessionEntries(data,s.id);const ids=new Set(entries.map(e=>e.id));const done=data.sets.filter(set=>ids.has(set.sessionExerciseId)&&set.completedAt);const date=new Date(s.startedAt);return `<article class="card history-item"><div class="history-date"><b>${date.getDate()}</b><span>${new Intl.DateTimeFormat('es-AR',{month:'short'}).format(date)}</span></div><div class="history-info"><h3>${esc(s.dayNameSnapshot)}</h3><p>${entries.length} ejercicios · ${done.length} series realizadas · ${date.getFullYear()}</p></div>${iconButton('history-detail',`Ver sesión ${s.dayNameSnapshot} del ${shortDate(s.startedAt)}`,'arrow',`data-id="${s.id}"`)}</article>`;}).join('') || `<div class="card empty"><div class="empty-symbol">${icon('history')}</div><h2>${data.sessions.some(s=>s.status==='finished')?'Sin resultados para este filtro':'Tu historia empieza con una serie'}</h2><p>Los entrenamientos finalizados aparecerán acá, con sus cargas, repeticiones, RIR y notas.</p>${button('view','Ir a entrenar','arrow','primary','data-view="train"')}</div>`}${loadMore}`;
}
function localMonth(date) {const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function renderSettings() {
  const setting=settings();
  const toggle=(key,title,description)=>`<div class="setting-row"><div><strong>${title}</strong><small>${description}</small></div><label class="toggle-target"><input class="toggle" type="checkbox" data-setting="${key}" aria-label="${title}" ${setting[key]?'checked':''}></label></div>`;
  const lastExport=metaValue(data,'lastExportAt');
  return `<div class="page-heading"><div><p class="eyebrow">SIMPLE. PERSONAL. TUYO.</p><h1>Tu espacio.</h1><p>Ajustá las alertas y llevate tus registros.</p></div></div><div class="settings-grid">
    <section class="card settings-card"><h2>${icon('download')} Tus respaldos</h2><p class="subtext">Exportá un JSON e importalo en el otro dispositivo.</p><div class="backup-buttons">${button('export','Exportar respaldo','download','primary')}${button('import','Importar respaldo','upload','secondary')}</div><p class="subtext" style="margin:15px 0">${lastExport?`Último respaldo generado: ${fullDate(lastExport)}`:'Todavía no generaste un respaldo en este dispositivo.'}</p><div class="hint">Importar reemplaza los datos de este navegador. Se conserva una copia recuperable del estado anterior. Exportá desde el dispositivo con los registros más recientes.</div>${button('recover-import','Recuperar copia anterior','history','ghost wide')}<p class="subtext">El archivo HTML no contiene tus entrenamientos. El respaldo JSON sí.</p></section>
    <section class="card settings-card"><h2>${icon('bell')} Descanso y alertas</h2>${toggle('soundEnabled','Sonido','Al terminar el descanso con la app activa.')}${toggle('vibrationEnabled','Vibración', 'Se usa si el navegador y el dispositivo la admiten.')}${toggle('keepScreenAwake','Mantener pantalla encendida','Durante una sesión, mientras la app esté visible.')}<p id="wake-status" class="subtext" style="margin-top:12px"></p>${button('test-alert','Probar alerta','sound','secondary wide','style="margin-top:18px"')}<p id="audio-status" class="subtext" style="margin-top:10px"></p></section>
    <section class="card settings-card"><h2>${icon('phone')} Instalación y offline</h2><p id="pwa-status" class="subtext"></p>${button('install','Instalar / ver instrucciones','download','secondary wide')}<div class="hint" style="margin-top:17px">Abrí la app una vez con conexión y esperá “Offline listo”. Después podés entrenar sin Internet.</div><div class="setting-row"><div><strong>Notificación de descanso</strong><small id="notification-status">${setting.notificationsEnabled?'Activada para este dispositivo.':'Opcional. Requiere permiso del navegador.'}</small></div>${button('notifications',setting.notificationsEnabled?'Desactivar':'Activar','','secondary')}</div><p class="subtext" style="margin-top:15px">Con la pantalla bloqueada o la app suspendida, el sistema puede retrasar o impedir la alerta. El contador se corrige al volver.</p></section>
    <section class="card settings-card"><h2>${icon('shield')} Cuidá tu registro</h2><p class="subtext">Guardado automático en este navegador. Sin cuenta ni sincronización en la nube.</p>${button('persist-storage','Proteger almacenamiento','shield','secondary wide')}<p id="storage-status" class="subtext" style="margin:14px 0"></p><div class="hint">Evitá el modo incógnito y exportá respaldos periódicos. Borrar los datos del sitio, cambiar de navegador o de dirección web puede dejar tus registros fuera de alcance.</div><p class="subtext" style="margin-top:18px">Serie ${APP_VERSION} · HTML, CSS y JavaScript nativos.<br>Sin librerías, anuncios ni suscripciones.</p></section></div>`;
}

function clockPanel() {
  const state = clock();
  const countdown = state.tab === 'countdown';
  const t = state.countdown;
  const running = countdown ? t?.status === 'running' : state.stopwatch.startedAt !== null;
  const paused = countdown ? t?.status === 'paused' : state.stopwatch.elapsedMs > 0;
  const finished = countdown && t?.status === 'elapsed';
  const editable = !t || finished;
  return `<div class="clock-tabs" role="tablist" aria-label="Tipo de reloj">${['countdown','stopwatch'].map(tab => button('clock-tab', tab === 'countdown' ? 'Temporizador' : 'Cronómetro', '', tab === state.tab ? 'selected' : '', `id="clock-tab-${tab}" data-tab="${tab}" role="tab" aria-selected="${tab === state.tab}" aria-controls="clock-panel" tabindex="${tab === state.tab ? 0 : -1}"`)).join('')}</div>
    <section id="clock-panel" role="tabpanel" aria-labelledby="clock-tab-${state.tab}">
      <div class="clock-display ${countdown ? 'countdown-dial' : 'stopwatch-dial'}"><strong id="general-clock-time" role="timer" aria-live="off"></strong><span id="general-clock-state">${running ? 'EN MARCHA' : finished ? 'TIEMPO CUMPLIDO' : paused ? 'EN PAUSA' : 'LISTO PARA EMPEZAR'}</span></div>
      ${countdown ? `<div class="clock-adjustments">${button('clock-adjust','−15 s','','ghost','data-seconds="-15" aria-label="Restar 15 segundos al temporizador"')}${button('clock-adjust','+15 s','','ghost','data-seconds="15" aria-label="Añadir 15 segundos al temporizador"')}</div><div class="clock-duration-fields"><label class="form-field">Minutos<input id="clock-minutes" type="text" inputmode="numeric" maxlength="4" data-clock-field="minutes" value="${esc(state.minutes)}" ${editable ? '' : 'disabled'}></label><label class="form-field">Segundos<input id="clock-seconds" type="text" inputmode="numeric" maxlength="2" data-clock-field="seconds" value="${esc(state.seconds)}" ${editable ? '' : 'disabled'}></label></div>` : ''}
      <p id="clock-error" class="form-error" role="alert"></p><div class="clock-actions">${button('clock-toggle', running ? 'Pausar' : finished ? 'Empezar de nuevo' : paused ? 'Reanudar' : 'Empezar', running ? 'pause' : 'play', 'primary wide','id="clock-toggle"')}${button('clock-reset','Reiniciar','refresh','secondary wide','id="clock-reset"')}</div>
      <p class="clock-note">${countdown ? 'Usa el sonido y la vibración de Ajustes. La alerta puede retrasarse si el teléfono suspende la app.' : 'Continúa aunque cierres este panel o recargues la app. Pausalo para detener la medición.'}</p>
    </section>`;
}
function openClock() {
  if (settings().soundEnabled) void alerts.unlockAudio();
  showDialog('Reloj', clockPanel());
  dialog.classList.add('clock-sheet');
  tickClocks();
}
function refreshClockPanel() {
  if (!dialog.open || !dialog.classList.contains('clock-sheet')) return;
  const focusId = document.activeElement?.id;
  dialog.querySelector('.dialog-body').innerHTML = clockPanel();
  if (focusId) document.getElementById(focusId)?.focus({preventScroll:true});
  updateClockReadouts();
}
function saveClock(state, refresh = true) {
  commit([putMeta('clock', state)], false);
  if (refresh) refreshClockPanel();
  updateClockReadouts();
}
function updateClockReadouts(timestamp = Date.now()) {
  const session = currentSession();
  const duration = document.getElementById('session-duration');
  if (session && duration) duration.textContent = formatElapsed(sessionDurationMs(session, timestamp));
  const state = clock();
  const t = state.countdown;
  const readout = dialog.open && dialog.classList.contains('clock-sheet') && document.getElementById('general-clock-time');
  if (readout) {
    readout.textContent = state.tab === 'stopwatch' ? formatElapsed(stopwatchMs(state.stopwatch, timestamp)) : t ? formatDuration(remainingMs(t, timestamp)) : formatDuration((parseClockDuration(state.minutes, state.seconds) || 0) * 1000);
    const dial = readout.closest('.countdown-dial');
    if (dial) dial.style.setProperty('--clock-progress', `${t ? Math.min(100, remainingMs(t, timestamp) / (t.durationSeconds * 1000) * 100) : 100}%`);
  }
  for (const preview of document.querySelectorAll('[data-clock-preview]')) {
    const label = t ? (t.status === 'elapsed' ? 'Terminado' : formatDuration(remainingMs(t, timestamp))) : state.stopwatch.startedAt !== null ? formatElapsed(stopwatchMs(state.stopwatch, timestamp)) : '';
    preview.textContent = label;
    preview.hidden = !label;
  }
}
function tickClocks() {
  const state = clock();
  const t = state.countdown;
  if (t?.status === 'running' && remainingMs(t) === 0 && !ui.busy) {
    const elapsed = {...t, status:'elapsed', alertHandledAt:nowISO()};
    saveClock({...state, countdown:elapsed});
    void alerts.notify(elapsed, '', settings(), pwa.registration);
    toast('Temporizador general terminado.');
  }
  updateClockReadouts();
}
function toggleClock() {
  const state = clock();
  if (state.tab === 'stopwatch') {
    saveClock({...state, stopwatch:state.stopwatch.startedAt === null ? startStopwatch(state.stopwatch) : pauseStopwatch(state.stopwatch)});
    return;
  }
  const t = state.countdown;
  if (settings().soundEnabled) void alerts.unlockAudio();
  if (t?.status === 'running') saveClock({...state, countdown:pauseTimer(t)});
  else if (t?.status === 'paused') saveClock({...state, countdown:resumeTimer(t)});
  else {
    const seconds = parseClockDuration(state.minutes, state.seconds);
    if (seconds === null) {
      document.getElementById('clock-error').textContent = 'Ingresá de 1 segundo a 24 horas. Los segundos deben estar entre 0 y 59.';
      return;
    }
    saveClock({...state, countdown:makeCountdown(seconds)});
  }
  tickClocks();
}
function adjustClock(seconds) {
  const state = clock();
  const t = state.countdown;
  if (t && t.status !== 'elapsed') {
    const delta = Math.min(seconds, Math.max(0, 86400 - remainingMs(t) / 1000));
    saveClock({...state, countdown:adjustTimer(t, delta)});
    tickClocks();
  } else {
    const duration = Math.max(1, Math.min(86400, (parseClockDuration(state.minutes,state.seconds) || 0) + seconds));
    saveClock({...state, countdown:null, minutes:String(Math.floor(duration/60)), seconds:String(duration%60)});
  }
}

function tickTimer() {
  if (!data) return;
  tickClocks();
  const t=timer();
  if (!t) return;
  const remaining=remainingMs(t);
  const element=document.getElementById('timer-time');
  if (element) element.textContent=t.status==='elapsed'?`+${formatDuration(Date.now()-Date.parse(t.endsAt))}`:formatDuration(remaining);
  if (t.status==='running' && remaining===0 && !timerHandling && !ui.busy) {
    timerHandling=true;
    const elapsed={...t,status:'elapsed',alertHandledAt:nowISO()};
    commit([putMeta('timer',elapsed)]);
    void alerts.notify(elapsed,byId('sessionExercises',t.sessionExerciseId)?.nameSnapshot || 'Tu ejercicio',settings(),pwa.registration);
    timerHandling=false;
  }
}

function editName(title, initial, onSave) {
  showDialog(title, `<label class="form-field">Nombre<input name="name" value="${esc(initial)}" maxlength="160" required autofocus></label>`, {
    submit: async form => {const name=String(form.get('name')).trim();if(!name) throw new Error('Escribí un nombre.');await onSave(name);closeDialog(true);}
  });
}
function newSet(entryId,order,type='efectiva',basis=byId('sessionExercises',entryId)?.loadBasisSnapshot) {
  return {...(basis==='resistencia'?{durationSeconds:null}:{}),id:uid(),sessionExerciseId:entryId,order,type,loadKg:null,reps:null,rir:null,completedAt:null};
}
function setRemovalOps(sets) {
  const ids=new Set(sets.map(set=>set.id));
  return [...data.draftInputs.filter(d=>ids.has(d.setId)).map(d=>remove('draftInputs',d.id)),...sets.map(set=>remove('sets',set.id))];
}
function restoreOps(storesAndRecords) {return storesAndRecords.flatMap(([store,records])=>records.map(record=>put(store,record)));}
function sessionRecords(sessionId) {
  const entries=sessionEntries(data,sessionId);
  const entryIds=new Set(entries.map(entry=>entry.id));
  const sets=data.sets.filter(set=>entryIds.has(set.sessionExerciseId));
  const setIds=new Set(sets.map(set=>set.id));
  return [['sessions',[byId('sessions',sessionId)]],['sessionExercises',entries],['sets',sets],['draftInputs',data.draftInputs.filter(d=>setIds.has(d.setId))]];
}
async function startSession(dayId) {
  if (activeSession(data)) {setView('train');return;}
  const found=findDay(data,dayId);
  if (!found) return toast('Creá un día antes de empezar.');
  if (!found.day.exercises.length) {toast('Añadí al menos un ejercicio a este día.');ui.routineId=found.routine.id;setView('routines');return;}
  if (settings().soundEnabled) void alerts.unlockAudio();
  const startedAt=nowISO();
  const session={id:uid(),routineId:found.routine.id,dayId:found.day.id,dayNameSnapshot:found.day.name,startedAt,endedAt:null,status:'in_progress'};
  const operations=[put('sessions',session),putMeta('timer',null),putMeta('selectedDayId',dayId)];
  for(const placement of sorted(found.day.exercises)) {
    const exercise=byId('exercises',placement.exerciseId);
    const entry={id:uid(),sessionId:session.id,exerciseId:exercise.id,placementId:placement.id,sessionStartedAt:startedAt,order:placement.order,nameSnapshot:exercise.name,loadBasisSnapshot:exercise.loadBasis,restSeconds:placement.restSeconds,note:placement.defaultNote};
    operations.push(put('sessionExercises',entry));
    placement.setPlan.forEach((plan,index)=>operations.push(put('sets',newSet(entry.id,index+1,plan.type,entry.loadBasisSnapshot))));
  }
  ui.view='train';ui.editSessionId=null;commit(operations);toast('Sesión iniciada. Cada cambio se guarda automáticamente.');
}
async function finishSession() {
  const session=activeSession(data);
  if (!session) return;
  const entries=sessionEntries(data,session.id);
  const sets=entries.flatMap(entry=>entrySets(data,entry.id));
  const done=sets.filter(set=>set.completedAt).length;
  if (!done) return toast('Marcá al menos una serie realizada o descartá la sesión.');
  const pending=sets.length-done;
  if (pending && !await confirmAction('Finalizar entrenamiento', `${done} series realizadas. ${pending === 1 ? 'La serie pendiente se conservará' : `Las ${pending} series pendientes se conservarán`} sin marcar.`, 'Finalizar')) return;
  commit([put('sessions',{...session,status:'finished',endedAt:nowISO()}),putMeta('timer',null)]);
  await repo.flush();
  alerts.setWake(false);
  toast(`Entrenamiento guardado: ${done} series realizadas.`);
}
async function deleteSession(sessionId) {
  const session=byId('sessions',sessionId);
  if (!session) return;
  if (!await confirmAction('Eliminar sesión', `Se eliminará “${session.dayNameSnapshot}” del ${shortDate(session.startedAt)}, incluidas sus series y notas.`, 'Eliminar', true)) return;
  const records=clone(sessionRecords(sessionId));
  const operations=records.flatMap(([store,items])=>items.map(item=>remove(store,item.id)));
  const ids=new Set(records.find(([store])=>store==='sessionExercises')[1].map(entry=>entry.id));
  if (ids.has(timer()?.sessionExerciseId)) operations.push(putMeta('timer',null));
  ui.editSessionId=null;commit(operations);
  toast('Sesión eliminada.','Deshacer',()=>commit(restoreOps(records)));
}
function editExercise({dayId=null,placementId=null,sessionOnly=false}={}) {
  const found=dayId?findDay(data,dayId):null;
  const placement=placementId?found?.day.exercises.find(p=>p.id===placementId):null;
  const existing=placement&&byId('exercises',placement.exerciseId);
  const counts=Object.fromEntries(Object.keys(TYPES).map(type=>[type,placement?placement.setPlan.filter(s=>s.type===type).length:type==='efectiva'?3:0]));
  showDialog(placement?'Editar ejercicio':'Añadir ejercicio', `<div class="form-grid">
    ${!placement?`<label class="form-field">Usar un ejercicio del catálogo<select name="catalogId" id="exercise-catalog"><option value="">Crear un ejercicio nuevo</option>${data.exercises.filter(e=>!e.archived).map(e=>`<option value="${e.id}">${esc(e.name)} · ${esc(LOAD_BASES[e.loadBasis])}</option>`).join('')}</select></label>`:''}
    <label class="form-field">Nombre del ejercicio<input name="name" id="exercise-name" value="${esc(existing?.name||'')}" maxlength="160" required placeholder="Ej.: Press inclinado con mancuernas" ${placement?'':'autofocus'}></label>
    <div class="form-columns"><label class="form-field">Registro del ejercicio<select name="loadBasis" id="exercise-load-basis">${options(LOAD_BASES,existing?.loadBasis||'total')}</select></label><label class="form-field">Descanso (segundos)<input type="number" name="restSeconds" min="0" max="86400" step="1" value="${placement?.restSeconds??120}" required><small>0 = no iniciar descanso.</small></label></div>
    <div><p class="field-label" style="margin-bottom:10px">SERIES INICIALES</p><div class="plan-counts">${Object.entries(TYPES).map(([type,label])=>`<label class="form-field">${label}<input type="number" name="count-${type}" min="0" max="99" step="1" value="${counts[type]}" required></label>`).join('')}</div><p class="subtext" style="margin-top:9px">Durante el entrenamiento podés añadir más series.</p></div>
    <label class="form-field">Nota ${sessionOnly?'de esta sesión':'habitual'}<textarea name="note" rows="2" maxlength="8000" placeholder="Una indicación para recordar…">${esc(placement?.defaultNote||'')}</textarea></label>
    <p class="hint">${sessionOnly?'Este ejercicio se añade solo a la sesión abierta. Para incluirlo siempre, agregalo desde Rutinas.':'Los cambios se aplican a las próximas sesiones. El historial y la sesión ya iniciada mantienen sus datos.'} Cambiar la forma de registrar la carga crea una variante independiente.</p></div>`, {
    submitLabel:placement?'Guardar cambios':'Añadir ejercicio',
    submit:async form=>{
      const name=String(form.get('name')).trim();if(!name)throw new Error('Escribí el nombre del ejercicio.');
      const loadBasis=String(form.get('loadBasis'));
      const restSeconds=Number(form.get('restSeconds'));
      const note=String(form.get('note'));
      const chosen=existing || byId('exercises',String(form.get('catalogId')||''));
      const exercise=chosen&&chosen.loadBasis===loadBasis?{...chosen,name}:{id:uid(),name,loadBasis,archived:false};
      const newCounts=Object.fromEntries(Object.keys(TYPES).map(type=>[type,Number(form.get(`count-${type}`))]));
      const plan=placement&&Object.keys(TYPES).every(type=>counts[type]===newCounts[type])?clone(placement.setPlan):Object.keys(TYPES).flatMap(type=>Array.from({length:newCounts[type]},()=>({type})));
      if (!plan.length) throw new Error('Definí al menos una serie inicial.');
      const operations=[put('exercises',exercise)];
      if(sessionOnly){
        const session=currentSession();if(!session)throw new Error('No hay una sesión abierta.');
        const entries=sessionEntries(data,session.id);
        const entry={id:uid(),sessionId:session.id,exerciseId:exercise.id,placementId:null,sessionStartedAt:session.startedAt,order:Math.max(0,...entries.map(e=>e.order))+1,nameSnapshot:name,loadBasisSnapshot:loadBasis,restSeconds,note};
        operations.push(put('sessionExercises',entry));plan.forEach((s,index)=>operations.push(put('sets',newSet(entry.id,index+1,s.type,entry.loadBasisSnapshot))));
      }else{
        const updated=clone(found.routine);const day=updated.days.find(d=>d.id===dayId);
        const next={id:placement?.id||uid(),exerciseId:exercise.id,order:placement?.order||Math.max(0,...day.exercises.map(p=>p.order))+1,restSeconds,defaultNote:note,setPlan:plan};
        if(placement) day.exercises=day.exercises.map(p=>p.id===placement.id?next:p);else day.exercises.push(next);
        operations.push(put('routines',updated));
      }
      commit(operations);closeDialog(true);toast(placement?'Ejercicio actualizado.':'Ejercicio añadido.');
    },
    footer:placement?button('remove-placement','Quitar del día','trash','danger',`data-id="${placement.id}" data-day="${dayId}"`):''
  });
}
function editRest(entryId) {
  const entry=byId('sessionExercises',entryId);
  showDialog('Descanso del ejercicio', `<div class="form-grid"><p class="muted">${esc(entry.nameSnapshot)}</p><label class="form-field">Segundos<input type="number" name="seconds" min="0" max="86400" step="1" value="${entry.restSeconds}" required autofocus></label><p class="subtext">0 desactiva el inicio automático. El cambio afecta a los próximos descansos.</p>${entry.placementId&&findDay(data,byId('sessions',entry.sessionId).dayId)?.day.exercises.some(p=>p.id===entry.placementId)?'<label class="row"><input type="checkbox" name="template"> Usar también en la rutina</label>':''}</div>`, {
    submit:async form=>{
      const seconds=Number(form.get('seconds'));
      const operations=[put('sessionExercises',{...entry,restSeconds:seconds})];
      if(form.get('template')){
        const found=findDay(data,byId('sessions',entry.sessionId).dayId);const routine=clone(found.routine);
        routine.days.find(d=>d.id===found.day.id).exercises.find(p=>p.id===entry.placementId).restSeconds=seconds;
        operations.push(put('routines',routine));
      }
      commit(operations);closeDialog(true);
    }
  });
}
function updateSetField(setId,field,raw) {
  const set=byId('sets',setId);if(!set)return;
  if(field==='type') {commit([put('sets',{...set,type:raw})],false);return;}
  const parsed=parseField(raw,field);
  const next={...set,[field]:parsed.valid?parsed.value:null};
  const operations=[put('draftInputs',{id:`${setId}:${field}`,setId,field,raw}),put('sets',next)];
  let cancelledTimer=false;
  if(next.completedAt && (!validCompletedSet(next,byId('sessionExercises',set.sessionExerciseId).loadBasisSnapshot)||!parsed.valid)){
    next.completedAt=null;operations[1]=put('sets',next);
    if(timer()?.triggerSetId===setId){operations.push(putMeta('timer',null));cancelledTimer=true;}
    const checkbox=app.querySelector(`[data-complete="${setId}"]`);if(checkbox)checkbox.checked=false;
    checkbox?.closest('.set-row')?.classList.remove('done');
    toast('La serie quedó pendiente: completá sus valores para volver a marcarla.');
  }
  commit(operations,false);
  if(cancelledTimer){const timerElement=document.getElementById('timer-card');if(timerElement)timerElement.outerHTML=renderTimer();app.classList.remove('has-timer');}
  const input=document.getElementById(`set-${setId}-${field}`);if(input)input.setAttribute('aria-invalid',String(!parsed.valid));
  updateProgress();
}
function updateProgress() {
  const session=currentSession();if(!session)return;
  const sets=sessionEntries(data,session.id).flatMap(entry=>entrySets(data,entry.id));
  const done=sets.filter(s=>s.completedAt).length;
  const label=document.getElementById('session-progress');if(label)label.textContent=`${done} / ${sets.length} series`;
  const fill=app.querySelector('.progress-fill');if(fill)fill.style.width=`${sets.length?done/sets.length*100:0}%`;
  const totals=sessionTotals(data,session.id);
  const volume=document.getElementById('session-volume');if(volume)volume.innerHTML=`${number(totals.volumeKg)} <em>kg</em>`;
  const volumeDone=document.getElementById('session-volume-done');if(volumeDone)volumeDone.textContent=`${number(totals.completedVolumeKg)} kg realizados`;
  const count=document.getElementById('session-sets');if(count)count.textContent=totals.totalSets;
  const countDone=document.getElementById('session-sets-done');if(countDone)countDone.textContent=`${totals.completedSets} ${totals.completedSets===1?'realizada':'realizadas'}`;
}
async function completeSet(setId,checked) {
  const set=byId('sets',setId);if(!set)return;
  const invalidDraft=data.draftInputs.some(d=>d.setId===setId&&!parseField(d.raw,d.field).valid);
  if(checked&&(!validCompletedSet(set,byId('sessionExercises',set.sessionExerciseId).loadBasisSnapshot)||invalidDraft)) {render();toast(byId('sessionExercises',set.sessionExerciseId).loadBasisSnapshot==='resistencia'?'Ingresá una duración válida (ej.: 20:00).':'Completá kg y repeticiones válidas. El RIR puede quedar vacío.');return;}
  if(checked===!!set.completedAt)return;
  const entry=byId('sessionExercises',set.sessionExerciseId);
  const session=byId('sessions',entry.sessionId);
  const next={...set,completedAt:checked?(session.status==='finished'?session.endedAt:nowISO()):null};
  const operations=[put('sets',next)];
  if(session.status==='in_progress'){
    if(checked){if(settings().soundEnabled)void alerts.unlockAudio();operations.push(putMeta('timer',makeTimer(entry,setId)));}
    else if(timer()?.triggerSetId===setId)operations.push(putMeta('timer',null));
  }
  commit(operations);
}
async function copyPrevious(entryId) {
  const entry=byId('sessionExercises',entryId);const previous=previousEntry(data,entry);
  if(!previous)return;
  const current=entrySets(data,entryId);
  if(current.some(s=>s.completedAt||s.loadKg!==null||s.reps!==null||s.rir!==null||s.durationSeconds!=null)&&!await confirmAction('Copiar sesión anterior','Las series actuales de este ejercicio serán reemplazadas por las realizadas la última vez, sin marcar. La nota actual se conserva.','Copiar series'))return;
  const copied=entrySets(data,previous.id).filter(s=>s.completedAt).map((s,i)=>({...s,id:uid(),sessionExerciseId:entryId,order:i+1,completedAt:null}));
  const operations=[...setRemovalOps(current),...copied.map(s=>put('sets',s))];
  if(timer()?.sessionExerciseId===entryId)operations.push(putMeta('timer',null));
  commit(operations);toast('Valores anteriores copiados. Las series quedan pendientes.');
}
async function removeEntry(entryId) {
  const entry=byId('sessionExercises',entryId);
  if(!await confirmAction('Quitar ejercicio de la sesión',`Se quitarán “${entry.nameSnapshot}” y sus series de esta sesión. La rutina no cambia.`,'Quitar',true))return;
  const sets=clone(entrySets(data,entryId));const ids=new Set(sets.map(s=>s.id));const drafts=clone(data.draftInputs.filter(d=>ids.has(d.setId)));
  const operations=[remove('sessionExercises',entryId),...setRemovalOps(sets)];
  if(timer()?.sessionExerciseId===entryId)operations.push(putMeta('timer',null));
  commit(operations);toast('Ejercicio quitado.','Deshacer',()=>commit(restoreOps([['sessionExercises',[entry]],['sets',sets],['draftInputs',drafts]])));
}
function historyDetail(sessionId) {
  const session=byId('sessions',sessionId);if(!session)return;
  const entries=sessionEntries(data,sessionId);
  showDialog(session.dayNameSnapshot, `<p class="subtext" style="margin-bottom:23px">${fullDate(session.startedAt)}</p>${sessionMetrics(session)}${entries.map(entry=>`<section class="history-detail-entry"><h3>${esc(entry.nameSnapshot)}</h3><p>${esc(LOAD_BASES[entry.loadBasisSnapshot])} · Descanso ${formatDuration(entry.restSeconds*1000)}</p><table class="history-table"><thead><tr><th>Serie</th><th>Tipo</th>${entry.loadBasisSnapshot==='resistencia'?'<th>Duración</th>':'<th>kg × reps</th><th>RIR</th>'}<th>Hecha</th></tr></thead><tbody>${entrySets(data,entry.id).map((set,i)=>`<tr><td>${i+1}</td><td>${esc(TYPES[set.type])}</td>${entry.loadBasisSnapshot==='resistencia'?`<td>${set.durationSeconds?formatDuration(set.durationSeconds*1000):'—'}</td>`:`<td>${number(set.loadKg)} × ${set.reps??'—'}</td><td>${set.rir??'—'}</td>`}<td>${set.completedAt?'Sí':'No'}</td></tr>`).join('')}</tbody></table>${entry.note?`<p>${esc(entry.note)}</p>`:''}</section>`).join('')}`,{
    footer:button('delete-history','Eliminar','trash','ghost',`data-id="${sessionId}"`)+button('edit-history','Corregir','edit','secondary',`data-id="${sessionId}"`)+button('close-dialog','Cerrar','','primary')
  });
}
function downloadJSON(backup,filename) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportBackup() {
  let emergency=false;
  try{await repo.flush();}catch{
    if(!await confirmAction('Respaldar cambios pendientes','El navegador no pudo guardar todo. Se exportará el estado que todavía está abierto en esta pestaña, incluidos los cambios pendientes.','Exportar'))return;
    emergency=true;
  }
  const timestamp=nowISO();
  downloadJSON(buildBackup(data,timestamp),`serie-respaldo-${timestamp.slice(0,19).replaceAll(':','-')}.json`);
  if(!emergency)commit([putMeta('lastExportAt',timestamp)]);
  toast('Respaldo generado. Conservá el archivo JSON fuera del navegador.');
}
async function importBackup(backup,fromRecovery=false) {
  const normalized=validateBackup(backup);
  const completed=normalized.sessions.filter(s=>s.status==='finished').length;
  if(!await confirmAction(fromRecovery?'Recuperar copia anterior':'Importar respaldo',`${normalized.routines.filter(r=>!r.archived).length} rutinas, ${completed} sesiones finalizadas y ${normalized.sets.length} series. Se reemplazarán los datos actuales de este navegador y se conservará una copia recuperable. El descanso y los relojes generales se reiniciarán.`,fromRecovery?'Recuperar':'Importar y reemplazar',true))return;
  ui.busy=true;app.inert=true;
  try{
    await repo.flush();
    await repo.replace(normalized,buildBackup(data));
    data=normalized;ui.editSessionId=null;ui.routineId=null;ui.historyExerciseId='';ui.historyMonth='';ui.view='train';
    history.replaceState(null,'','#train');render();
    toast(fromRecovery?'Copia anterior recuperada.':'Respaldo importado. Ya podés continuar en este dispositivo.');
  }finally{ui.busy=false;app.inert=false;}
}
function showInstallHelp() {
  showDialog(pwa.installed?'Serie ya está instalada':'Instalá Serie',`<p class="muted">${pwa.installed?'Ya la estás usando como aplicación.':'Abrí la dirección HTTPS de tu GitHub Pages y seguí estos pasos.'}</p><ol class="install-steps"><li><strong>Android · Chrome:</strong> menú ⋮ → Añadir a pantalla principal → Instalar, si aparece.</li><li><strong>iPhone / iPad · Safari:</strong> Compartir → Añadir a pantalla de inicio. Activá “Abrir como app web” si se ofrece.</li><li><strong>PC · Chrome o Edge:</strong> usá el icono de instalación en la barra de direcciones o la opción de instalar en el menú.</li></ol><p class="hint">Antes de desconectarte, esperá “Offline listo”. Los datos quedan en el navegador donde los registraste; usá Exportar / Importar para transferirlos.</p>${pwa.error?`<p class="form-error">${esc(pwa.error)}</p>`:''}`);
}
async function toggleNotifications() {
  if(settings().notificationsEnabled){commit([putMeta('settings',{...settings(),notificationsEnabled:false})]);return;}
  if(!('Notification' in window)||!pwa.registration){toast('Las notificaciones no están disponibles aquí. Probá con la PWA instalada.');return;}
  const permission=await Notification.requestPermission();
  commit([putMeta('settings',{...settings(),notificationsEnabled:permission==='granted'})]);
  toast(permission==='granted'?'Notificaciones activadas. El sistema puede retrasarlas si suspende la app.':'No se concedió permiso. Podés cambiarlo en los ajustes del navegador.');
}
async function testAlert() {
  const sound=settings().soundEnabled?await alerts.unlockAudio():false;
  if(sound)alerts.beep();
  let vibration=false;
  if(settings().vibrationEnabled&&'vibrate' in navigator){try{vibration=navigator.vibrate([180,80,180]);}catch{}}
  toast(sound?'Alerta de prueba. Comprobá el volumen del dispositivo.':vibration?'Vibración solicitada. El sonido está desactivado o bloqueado.':'No hay una alerta sonora activa. Revisá tus ajustes y el navegador.');
  updateCapabilities();
}

async function handleAction(target) {
  const action=target.dataset.action;
  const id=target.dataset.id;
  const dayId=target.dataset.day;
  const setId=target.dataset.set;
  switch(action){
    case 'open-clock':openClock();break;
    case 'clock-tab':saveClock({...clock(),tab:target.dataset.tab});break;
    case 'clock-toggle':toggleClock();break;
    case 'clock-adjust':adjustClock(Number(target.dataset.seconds));break;
    case 'clock-reset':{
      const state=clock();
      saveClock(state.tab==='countdown'?{...state,countdown:null}:{...state,stopwatch:{elapsedMs:0,startedAt:null}});
      break;
    }
    case 'view':setView(target.dataset.view);break;
    case 'close-dialog':closeDialog();break;
    case 'select-day':commit([putMeta('selectedDayId',dayId)]);break;
    case 'start-session':await startSession(dayId);break;
    case 'finish-session':await finishSession();break;
    case 'discard-session':if(activeSession(data))await deleteSession(activeSession(data).id);break;
    case 'new-routine':editName('Nueva rutina','',name=>{const routine={id:uid(),name,archived:false,days:[]};ui.routineId=routine.id;commit([put('routines',routine)]);});break;
    case 'rename-routine':editName('Renombrar rutina',byId('routines',id).name,name=>commit([put('routines',{...byId('routines',id),name})]));break;
    case 'duplicate-routine':{
      const routine=clone(byId('routines',id));routine.id=uid();routine.name=`${routine.name.slice(0,150)} (copia)`;
      for(const day of routine.days){day.id=uid();for(const p of day.exercises)p.id=uid();}
      ui.routineId=routine.id;commit([put('routines',routine)]);toast('Rutina duplicada.');break;
    }
    case 'delete-routine':{
      const routine=clone(byId('routines',id));
      if(await confirmAction('Archivar rutina',`“${routine.name}” dejará de aparecer para entrenar. El historial se conserva y podés restaurarla desde esta pantalla.`,'Archivar',true)){
        const next=data.routines.find(r=>!r.archived&&r.id!==id);ui.routineId=next?.id||null;
        commit([put('routines',{...routine,archived:true}),putMeta('selectedDayId',next?.days[0]?.id||null)]);
        toast('Rutina archivada.','Deshacer',()=>commit([put('routines',{...byId('routines',routine.id),archived:false})]));
      }break;
    }
    case 'restore-routine':{
      const archived=data.routines.filter(r=>r.archived);
      showDialog('Restaurar rutina',`<label class="form-field">Rutina<select name="routineId">${archived.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>`,{submitLabel:'Restaurar',submit:async form=>{const routine=byId('routines',String(form.get('routineId')));ui.routineId=routine.id;commit([put('routines',{...routine,archived:false}),putMeta('selectedDayId',routine.days[0]?.id||null)]);closeDialog(true);}});break;
    }
    case 'new-day':editName('Nuevo día','',name=>{const routine=clone(byId('routines',id));const day={id:uid(),name,order:Math.max(0,...routine.days.map(d=>d.order))+1,exercises:[]};routine.days.push(day);commit([put('routines',routine)]);});break;
    case 'day-menu':{
      const found=findDay(data,id);
      showDialog(found.day.name,`<div class="stack">${button('rename-day','Renombrar día','edit','secondary wide',`data-id="${id}"`)}${button('duplicate-day','Duplicar día','copy','secondary wide',`data-id="${id}"`)}<div class="row">${button('move-day','Subir','up','secondary wide',`data-id="${id}" data-step="-1"`)}${button('move-day','Bajar','down','secondary wide',`data-id="${id}" data-step="1"`)}</div>${button('delete-day','Eliminar día','trash','danger wide',`data-id="${id}"`)}</div>`);break;
    }
    case 'rename-day':{const found=findDay(data,id);editName('Renombrar día',found.day.name,name=>{const routine=clone(found.routine);routine.days.find(d=>d.id===id).name=name;commit([put('routines',routine)]);});break;}
    case 'duplicate-day':{
      const found=findDay(data,id);const routine=clone(found.routine);const day=clone(found.day);day.id=uid();day.name=`${day.name.slice(0,150)} (copia)`;day.order=Math.max(0,...routine.days.map(d=>d.order))+1;day.exercises.forEach(p=>p.id=uid());routine.days.push(day);commit([put('routines',routine)]);closeDialog();break;
    }
    case 'move-day':{
      const found=findDay(data,id);const routine=clone(found.routine);const days=sorted(routine.days);const index=days.findIndex(d=>d.id===id);const other=index+Number(target.dataset.step);
      if(other>=0&&other<days.length){[days[index],days[other]]=[days[other],days[index]];days.forEach((d,i)=>d.order=i+1);routine.days=days;commit([put('routines',routine)]);}closeDialog();break;
    }
    case 'delete-day':{
      const found=findDay(data,id);if(await confirmAction('Eliminar día',`Se quitará “${found.day.name}” de la rutina. Las sesiones anteriores se conservan.`,'Eliminar',true)){
        const original=clone(found.routine);const routine=clone(original);routine.days=routine.days.filter(d=>d.id!==id);
        const operations=[put('routines',routine)];if(metaValue(data,'selectedDayId')===id)operations.push(putMeta('selectedDayId',routine.days[0]?.id||null));
        commit(operations);toast('Día eliminado.','Deshacer',()=>commit([put('routines',original)]));
      }break;
    }
    case 'add-placement':editExercise({dayId});break;
    case 'edit-placement':editExercise({dayId,placementId:id});break;
    case 'session-add-exercise':editExercise({sessionOnly:true});break;
    case 'move-placement':{
      const found=findDay(data,dayId);const routine=clone(found.routine);const day=routine.days.find(d=>d.id===dayId);const placements=sorted(day.exercises);const index=placements.findIndex(p=>p.id===id);const other=index+Number(target.dataset.step);
      if(other>=0&&other<placements.length){[placements[index],placements[other]]=[placements[other],placements[index]];placements.forEach((p,i)=>p.order=i+1);day.exercises=placements;commit([put('routines',routine)]);}break;
    }
    case 'remove-placement':{
      const found=findDay(data,dayId);if(await confirmAction('Quitar ejercicio','El ejercicio se quitará de este día. El catálogo y el historial se conservan.','Quitar',true)){
        const original=clone(found.routine);const routine=clone(original);const day=routine.days.find(d=>d.id===dayId);day.exercises=day.exercises.filter(p=>p.id!==id);commit([put('routines',routine)]);toast('Ejercicio quitado del día.','Deshacer',()=>commit([put('routines',original)]));
      }break;
    }
    case 'entry-menu':{const entry=byId('sessionExercises',id);showDialog(entry.nameSnapshot,`<div class="stack">${button('rest-config','Configurar descanso','clock','secondary wide',`data-id="${id}"`)}${button('remove-entry','Quitar de esta sesión','trash','danger wide',`data-id="${id}"`)}</div>`);break;}
    case 'remove-entry':await removeEntry(id);break;
    case 'rest-config':editRest(id);break;
    case 'add-set':{const sets=entrySets(data,id);commit([put('sets',newSet(id,Math.max(0,...sets.map(s=>s.order))+1))]);break;}
    case 'set-menu':showDialog('Opciones de la serie',`<div class="stack">${button('duplicate-set','Duplicar valores como nueva serie','copy','secondary wide',`data-set="${setId}"`)}${byId('sessionExercises',byId('sets',setId).sessionExerciseId).loadBasisSnapshot==='resistencia'?'':button('clear-rir','Dejar RIR sin registrar','minus','secondary wide',`data-set="${setId}"`)}${button('delete-set','Eliminar serie','trash','danger wide',`data-set="${setId}"`)}</div>`);break;
    case 'duplicate-set':{
      const set=byId('sets',setId);const sets=entrySets(data,set.sessionExerciseId);const duplicate={...set,id:uid(),order:Math.max(0,...sets.map(s=>s.order))+1,completedAt:null};commit([put('sets',duplicate)]);closeDialog();break;
    }
    case 'clear-rir':updateSetField(setId,'rir','');closeDialog();render();break;
    case 'delete-set':{
      const set=clone(byId('sets',setId));const drafts=clone(data.draftInputs.filter(d=>d.setId===setId));
      const operations=setRemovalOps([set]);if(timer()?.triggerSetId===setId)operations.push(putMeta('timer',null));
      commit(operations);closeDialog();toast('Serie eliminada.','Deshacer',()=>commit(restoreOps([['sets',[set]],['draftInputs',drafts]])));break;
    }
    case 'rir-step':{const set=byId('sets',setId);const raw=String(Math.max(0,(set.rir??0)+Number(target.dataset.step)));updateSetField(setId,'rir',raw);render();break;}
    case 'copy-previous':await copyPrevious(id);break;
    case 'timer-adjust':if(timer())commit([putMeta('timer',adjustTimer(timer(),Number(target.dataset.seconds)))]);break;
    case 'timer-pause':if(timer())commit([putMeta('timer',timer().status==='paused'?resumeTimer(timer()):pauseTimer(timer()))]);break;
    case 'timer-cancel':commit([putMeta('timer',null)]);break;
    case 'history-more':ui.historyLimit+=30;render();break;
    case 'history-detail':historyDetail(id);break;
    case 'delete-history':await deleteSession(id);break;
    case 'edit-history':closeDialog();ui.editSessionId=id;ui.view='train';render();window.scrollTo({top:0});break;
    case 'end-edit':ui.editSessionId=null;setView('history');toast('Correcciones guardadas.');break;
    case 'export':await exportBackup();break;
    case 'import':document.getElementById('import-file').click();break;
    case 'recover-import':{const recovery=await repo.recovery();if(!recovery)toast('Todavía no hay una copia anterior a una importación.');else await importBackup(recovery.backup,true);break;}
    case 'retry-save':await repo.retry();toast('Cambios guardados.');break;
    case 'test-alert':await testAlert();break;
    case 'notifications':await toggleNotifications();break;
    case 'install':if(pwa.installPrompt)await pwa.install();else showInstallHelp();break;
    case 'update-app':await repo.flush();if(!pwa.activateUpdate())toast('No hay una actualización pendiente.');break;
    case 'persist-storage':{
      const status=document.getElementById('storage-status');
      if(!navigator.storage?.persist){status.textContent='Este navegador no ofrece esta opción. Conservá respaldos JSON.';break;}
      const persisted=await navigator.storage.persist();status.textContent=persisted?'Almacenamiento persistente concedido. El borrado manual sigue eliminando los datos.':'El navegador no concedió persistencia. La app sigue guardando; conservá respaldos JSON.';break;
    }
  }
}

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');
  if(!target||target.disabled||ui.busy)return;
  void handleAction(target).catch(error=>{console.error(error);toast(error.message||'No se pudo completar la acción.');});
});
app.addEventListener('input',event=>{
  if(ui.busy||!data)return;
  const target=event.target;
  if(target.dataset.set&&target.dataset.field){
    updateSetField(target.dataset.set,target.dataset.field,target.value);
    if(target.dataset.field==='type')target.className=`set-type ${target.value}`;
  }else if(target.dataset.entryNote){
    const entry=byId('sessionExercises',target.dataset.entryNote);commit([put('sessionExercises',{...entry,note:target.value})],false);
  }else if(target.dataset.complete){
    void completeSet(target.dataset.complete,target.checked);
  }else if(target.dataset.setting){
    const key=target.dataset.setting;commit([putMeta('settings',{...settings(),[key]:target.checked})],false);
    if(key==='soundEnabled'&&target.checked)void alerts.unlockAudio();
    alerts.setWake(!!activeSession(data)&&settings().keepScreenAwake);updateCapabilities();
  }
});
app.addEventListener('change',event=>{
  const select=event.target;const kind=select.dataset.select;if(!kind||ui.busy)return;
  if(kind==='train-routine'){const routine=byId('routines',select.value);ui.routineId=routine.id;commit([putMeta('selectedDayId',sorted(routine.days)[0]?.id||null)]);}
  else if(kind==='edit-routine'){ui.routineId=select.value;render();}
  else if(kind==='history-exercise'){ui.historyExerciseId=select.value;ui.historyLimit=30;render();}
  else if(kind==='history-month'){ui.historyMonth=select.value;ui.historyLimit=30;render();}
});
dialog.addEventListener('input',event=>{
  const field=event.target.dataset.clockField;
  if (!field || ui.busy) return;
  const state=clock();
  saveClock({...state,[field]:event.target.value,countdown:state.countdown?.status==='elapsed'?null:state.countdown},false);
  const label=document.getElementById('general-clock-state');if(!state.countdown || state.countdown.status==='elapsed')label.textContent='LISTO PARA EMPEZAR';
  const error=document.getElementById('clock-error');if(error)error.textContent='';
});
dialog.addEventListener('keydown',event=>{
  if(event.target.matches('[role="tab"][data-tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    const tab=event.key==='Home'?'countdown':event.key==='End'?'stopwatch':clock().tab==='countdown'?'stopwatch':'countdown';
    saveClock({...clock(),tab});
    document.getElementById(`clock-tab-${tab}`).focus();
  }
});
dialog.addEventListener('change',event=>{
  if(event.target.id==='exercise-catalog'){
    const exercise=byId('exercises',event.target.value);
    dialog.querySelector('#exercise-name').value=exercise?.name||'';
    dialog.querySelector('#exercise-load-basis').value=exercise?.loadBasis||'total';
  }
});
document.getElementById('import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{
    if(file.size>30*1024*1024)throw new Error('El respaldo supera el límite de importación de 30 MB.');
    let backup;try{backup=JSON.parse(await file.text());}catch{throw new Error('El archivo no contiene JSON válido.');}
    await importBackup(backup);
  }catch(error){showDialog('No se pudo importar',`<p class="muted">${esc(error.message)}</p><p class="hint" style="margin-top:16px">Los registros actuales se conservaron.</p>`);}
});
window.addEventListener('popstate',()=>{ui.view=['train','routines','history','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'train';ui.editSessionId=null;render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tickTimer();});
window.addEventListener('pageshow',()=>tickTimer());
window.addEventListener('beforeunload',event=>{if(repo.pending.length||repo.working||ui.busy){event.preventDefault();event.returnValue='';}});

async function acquireWriterLock() {
  if(!navigator.locks)return true;
  return new Promise((resolve,reject)=>{
    navigator.locks.request(`writer:${DB_NAME}`,{ifAvailable:true},async lock=>{
      resolve(!!lock);
      if(lock)await new Promise(release=>window.addEventListener('pagehide',event=>{if(!event.persisted)release();},{once:true}));
    }).catch(reject);
  });
}
async function boot() {
  if(location.protocol==='file:')throw new Error('Abrí Serie desde GitHub Pages (HTTPS) o un servidor local. Abrir index.html con doble clic no permite instalar la PWA ni cargar correctamente sus módulos.');
  if(!('indexedDB' in window))throw new Error('Este navegador no permite IndexedDB. Usá un navegador actualizado y habilitá el almacenamiento del sitio.');
  if(!await acquireWriterLock())throw new Error('Serie está abierta en otra pestaña o ventana de este navegador. Cerrala y recargá esta página para evitar que se sobrescriban cambios.');
  data=await repo.open();
  ui.view=['train','routines','history','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'train';
  render();
  void pwa.start();
  setInterval(tickTimer,250);
  if(navigator.storage?.persisted) {
    const persisted=await navigator.storage.persisted();
    const element=document.getElementById('storage-status');if(element&&persisted)element.textContent='El navegador ya concedió almacenamiento persistente.';
  }
}
boot().catch(error=>{
  console.error(error);
  app.innerHTML=`<main class="boot-screen"><div class="brand-word">SERIE<span>.</span></div><h2>No pudimos abrir tu registro</h2><p>${esc(error.message)}</p><button type="button" id="reload-app" class="primary">Volver a intentar</button><p>Si ya tenías datos, no borres el almacenamiento del sitio. Reintentá en el mismo navegador.</p></main>`;
  document.getElementById('reload-app').addEventListener('click',()=>location.reload());
});
