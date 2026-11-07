import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {initialData, buildBackup, validateBackup, remainingMs, pauseTimer, resumeTimer, adjustTimer} from '../js/core.js';
import {initialClock, parseClockDuration, makeCountdown, stopwatchMs, startStopwatch, pauseStopwatch, sessionDurationMs, formatElapsed, sessionTotals} from '../js/clocks.js';

const start = Date.parse('2026-11-03T18:00:00Z');

test('duración del entrenamiento: inicio, recarga, finalización y más de una hora', () => {
  const session = {startedAt:new Date(start).toISOString(), status:'in_progress', endedAt:null};
  assert.equal(sessionDurationMs(session,start),0);
  assert.equal(formatElapsed(sessionDurationMs(JSON.parse(JSON.stringify(session)),start+3723500)),'01:02:03');
  const finished = {...session,status:'finished',endedAt:new Date(start+3723500).toISOString()};
  assert.equal(sessionDurationMs(finished,start+99999999),3723500);
  assert.equal(sessionDurationMs(session,start-10000),0);
});

test('cronómetro conserva tiempo sin ticks y no cuenta pausas ni reinicios de inicio', () => {
  let sw=startStopwatch(initialClock().stopwatch,start);
  assert.equal(stopwatchMs(sw,start+65321),65321);
  sw=startStopwatch(sw,start+65000);
  assert.equal(stopwatchMs(sw,start+65321),65321);
  sw=pauseStopwatch(sw,start+65321);
  assert.equal(stopwatchMs(sw,start+999999),65321);
  sw=JSON.parse(JSON.stringify(sw));
  sw=startStopwatch(sw,start+1000000);
  assert.equal(stopwatchMs(sw,start+1001000),66321);
  assert.equal(formatElapsed(stopwatchMs(sw,start+1001000)),'00:01:06');
  assert.equal(stopwatchMs(initialClock().stopwatch,start+1001000),0);
});

test('duración configurable distingue entradas parciales, cero, límites y segundos inválidos', () => {
  assert.equal(parseClockDuration('1','30'),90);
  assert.equal(parseClockDuration('','5'),5);
  assert.equal(parseClockDuration('1440','0'),86400);
  for(const [m,s] of [['',''],['0','0'],['0','60'],['-1','0'],['0','1.5'],['1e2','0'],['1440','1'],['a','10']])assert.equal(parseClockDuration(m,s),null);
  assert.throws(()=>makeCountdown(0),/duración/);
  assert.throws(()=>makeCountdown(86401),/duración/);
});

test('temporizador general recupera timestamps, pausa, ajuste y reanudación independientemente del descanso', () => {
  const t=makeCountdown(90,start);
  assert.equal(t.kind,'general');
  assert.equal(t.triggerSetId,null);
  assert.equal(remainingMs(JSON.parse(JSON.stringify(t)),start+30000),60000);
  const paused=pauseTimer(t,start+30000);
  const adjusted=adjustTimer(paused,15,start+100000);
  assert.equal(remainingMs(adjusted,start+100000),75000);
  const resumed=resumeTimer(adjusted,start+100000);
  assert.equal(remainingMs(resumed,start+174000),1000);
  assert.equal(remainingMs(resumed,start+175000),0);
  assert.equal(remainingMs(resumed,start+999999),0);
  assert.equal(remainingMs(t,start+30000),60000);
});

test('volumen suma cada serie una vez con distintos tipos, cargas y repeticiones', () => {
  const data={sessionExercises:[{id:'a',sessionId:'today'},{id:'b',sessionId:'today'},{id:'c',sessionId:'other'}],sets:[
    {sessionExerciseId:'a',loadKg:20,reps:10,type:'calentamiento',completedAt:'done'},
    {sessionExerciseId:'a',loadKg:22.5,reps:8,type:'efectiva',completedAt:null},
    {sessionExerciseId:'b',loadKg:40,reps:6,type:'aproximacion',completedAt:'done'},
    {sessionExerciseId:'b',loadKg:null,reps:10,completedAt:null},
    {sessionExerciseId:'b',loadKg:0,reps:12,completedAt:'done'},
    {sessionExerciseId:'b',loadKg:50,reps:null,completedAt:null},
    {sessionExerciseId:'c',loadKg:100,reps:100,completedAt:'done'}]};
  assert.deepEqual(sessionTotals(data,'today'),{volumeKg:620,completedVolumeKg:440,totalSets:6,completedSets:3});
  data.sets[1].completedAt='done';
  assert.equal(sessionTotals(data,'today').completedVolumeKg,620);
  data.sets[1].loadKg=25;
  assert.equal(sessionTotals(data,'today').volumeKg,640);
  data.sets.splice(1,1);
  assert.deepEqual(sessionTotals(data,'today'),{volumeKg:440,completedVolumeKg:440,totalSets:5,completedSets:3});
  data.sessionExercises=data.sessionExercises.filter(e=>e.id!=='b');
  assert.deepEqual(sessionTotals(data,'today'),{volumeKg:200,completedVolumeKg:200,totalSets:1,completedSets:1});
  assert.deepEqual(sessionTotals(data,'empty'),{volumeKg:0,completedVolumeKg:0,totalSets:0,completedSets:0});
});

test('respaldos anteriores mantienen sesiones y no transportan alarmas ni cronómetros locales', () => {
  const data=initialData();
  const session={id:'session',routineId:data.routines[0].id,dayId:data.routines[0].days[0].id,dayNameSnapshot:'Prueba',startedAt:new Date(start).toISOString(),endedAt:null,status:'in_progress'};
  data.sessions.push(session);
  data.meta.push({id:'clock',value:{...initialClock(),countdown:makeCountdown(90,start),stopwatch:startStopwatch(initialClock().stopwatch,start)}});
  const old=buildBackup(data);old.appVersion='1.0.0';
  const imported=validateBackup(old);
  assert.deepEqual(imported.sessions,[session]);
  assert.equal(imported.meta.find(m=>m.id==='clock'),undefined);
  assert.equal('clock' in old.data,false);
  assert.equal(sessionDurationMs(imported.sessions[0],start+3600000),3600000);
});

test('alarma general solicita sonido y vibración, respeta ajustes y evita avisos sonoros tardíos', async () => {
  let beep=0,vibration=0;
  const context={document:{hidden:false,addEventListener:()=>{}},navigator:{vibrate:()=>{vibration++;return true;}},Date,console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../js/alerts.js',import.meta.url),'utf8').replace('export class Alerts','class Alerts')+'\nglobalThis.TestAlerts=Alerts;',context);
  const alerts=new context.TestAlerts();alerts.beep=()=>{beep++;return true;};
  const t=makeCountdown(1,Date.now()-1000);
  await alerts.notify(t,'',{soundEnabled:true,vibrationEnabled:true},null);
  assert.equal(beep,1);assert.equal(vibration,1);
  await alerts.notify(t,'',{soundEnabled:false,vibrationEnabled:false},null);
  assert.equal(beep,1);assert.equal(vibration,1);
  await alerts.notify({...t,endsAt:new Date(Date.now()-20000).toISOString()},'',{soundEnabled:true,vibrationEnabled:true},null);
  assert.equal(beep,1);assert.equal(vibration,1);
});

test('notificación general tiene título propio y conserva el aviso de descanso existente',async()=>{
  const shown=[];
  const context={document:{hidden:true,addEventListener:()=>{}},navigator:{},window:{Notification:{}},Notification:{permission:'granted'},Date,URL,console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../js/alerts.js',import.meta.url),'utf8').replace('export class Alerts','class Alerts')+'\nglobalThis.TestAlerts=Alerts;',context);
  const alerts=new context.TestAlerts();
  const registration={scope:'https://example.test/serie/',showNotification:async(title,options)=>shown.push({title,options})};
  const t=makeCountdown(1,Date.now()-1000);
  const settings={soundEnabled:true,vibrationEnabled:true,notificationsEnabled:true};
  await alerts.notify(t,'',settings,registration);
  await alerts.notify({...t,kind:undefined},'Press',settings,registration);
  assert.equal(shown[0].title,'Temporizador terminado');
  assert.equal(shown[1].title,'Descanso terminado');
  assert.match(shown[1].options.body,/Press/);
  assert.equal(shown[0].options.data.url,registration.scope);
});
