import test from 'node:test';
import assert from 'node:assert/strict';
import {parseField,validCompletedSet,initialData,buildBackup,validateBackup,previousEntry} from '../js/core.js';
import {sessionTotals} from '../js/clocks.js';
function fixture() {
  const d=initialData();
  d.exercises=[{id:'bike',name:'Bicicleta',loadBasis:'resistencia',archived:false}];
  d.sessions=[{id:'session',routineId:d.routines[0].id,dayId:d.routines[0].days[0].id,dayNameSnapshot:'Torso',startedAt:'2026-11-03T18:00:00.000Z',endedAt:null,status:'in_progress'}];
  d.sessionExercises=[{id:'entry',sessionId:'session',exerciseId:'bike',placementId:null,sessionStartedAt:d.sessions[0].startedAt,order:1,nameSnapshot:'Bicicleta',loadBasisSnapshot:'resistencia',restSeconds:0,note:'Suave'}];
  d.sets=[{id:'set',sessionExerciseId:'entry',order:1,type:'efectiva',loadKg:null,reps:null,rir:null,durationSeconds:1200,completedAt:'2026-11-03T18:21:00.000Z'}];
  return d;
}
test('tiempo acepta minutos:segundos o segundos, rechaza cero y entradas parciales',()=>{
 assert.deepEqual(parseField('20:30','durationSeconds'),{valid:true,value:1230});
 assert.deepEqual(parseField('45','durationSeconds'),{valid:true,value:45});
 assert.deepEqual(parseField('','durationSeconds'),{valid:true,value:null});
 for(const raw of ['20:','1:99','0','-1','1.5','86401'])assert.equal(parseField(raw,'durationSeconds').valid,false);
});
test('resistencia se completa con duración sin carga, repeticiones ni RIR',()=>{
 const s=fixture().sets[0];assert.equal(validCompletedSet(s,'resistencia'),true);assert.equal(validCompletedSet(s),false);
 assert.equal(validCompletedSet({...s,durationSeconds:null},'resistencia'),false);
});
test('respaldo conserva resistencia e historial con duración y borradores',()=>{
 const d=fixture();assert.deepEqual(validateBackup(buildBackup(d)).sets,d.sets);
 d.sets[0].completedAt=null;d.sets[0].durationSeconds=null;
 d.draftInputs=[{id:'set:durationSeconds',setId:'set',field:'durationSeconds',raw:'20:'}];
 assert.deepEqual(validateBackup(buildBackup(d)).draftInputs,d.draftInputs);
});
test('importador rechaza resistencia completada sin duración o con carga residual',()=>{
 let b=buildBackup(fixture());b.data.sets[0].durationSeconds=null;assert.throws(()=>validateBackup(b),/incompletos/);
 b=buildBackup(fixture());b.data.sets[0].loadKg=10;assert.throws(()=>validateBackup(b),/campos de carga/);
 b=buildBackup(fixture());b.data.sets[0].durationSeconds=86401;assert.throws(()=>validateBackup(b),/24 horas/);
});
test('resistencia suma series y no volumen; admite respaldos de versión anterior',()=>{
 const d=fixture();assert.deepEqual(sessionTotals(d,'session'),{totalSets:1,completedSets:1,volumeKg:0,completedVolumeKg:0});
 const old=buildBackup(initialData());old.schemaVersion=1;assert.equal(validateBackup(old).routines.length,1);
});
