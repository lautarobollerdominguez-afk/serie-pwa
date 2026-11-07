import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {initialData, buildBackup, validateBackup, parseField, uid, previousEntry, entrySets, makeTimer, remainingMs, pauseTimer, resumeTimer, adjustTimer, validCompletedSet, escapeHTML} from '../js/core.js';

function fixture() {
  const data=initialData();
  const exercise={id:uid(),name:'Press de prueba',loadBasis:'total',archived:false};
  data.exercises.push(exercise);
  for (const [index,status] of ['finished','finished','in_progress'].entries()) {
    const startedAt=`2026-10-${20+index}T18:00:00.000Z`;
    const session={id:uid(),routineId:data.routines[0].id,dayId:data.routines[0].days[0].id,dayNameSnapshot:'Día de prueba',startedAt,endedAt:status==='finished'?`2026-10-${20+index}T19:00:00.000Z`:null,status};
    data.sessions.push(session);
    const entry={id:uid(),exerciseId:exercise.id,sessionId:session.id,placementId:null,sessionStartedAt:startedAt,order:1,nameSnapshot:'Press de prueba',loadBasisSnapshot:'total',restSeconds:120,note:'Nota de prueba < > & "'};
    data.sessionExercises.push(entry);
    data.sets.push({id:uid(),sessionExerciseId:entry.id,order:1,type:'efectiva',loadKg:25,reps:8,rir:0,completedAt:status==='finished'?`2026-10-${20+index}T18:03:00.000Z`:null});
  }
  return data;
}

test('respaldo JSON conserva datos, identidades, RIR 0 y notas',()=>{
  const data=fixture();const imported=validateBackup(JSON.parse(JSON.stringify(buildBackup(data))));
  for(const key of ['routines','exercises','sessions','sessionExercises','sets','draftInputs'])assert.deepEqual(imported[key],data[key]);
});
test('importar no reactiva temporizadores ni permisos de otro dispositivo',()=>{
  const data=fixture();data.meta.find(m=>m.id==='timer').value=makeTimer(data.sessionExercises[2],data.sets[2].id);
  const settings=data.meta.find(m=>m.id==='settings').value;settings.notificationsEnabled=true;settings.keepScreenAwake=true;
  const imported=validateBackup(buildBackup(data));
  assert.equal(imported.meta.find(m=>m.id==='timer').value,null);
  assert.equal(imported.meta.find(m=>m.id==='settings').value.notificationsEnabled,false);
  assert.equal(imported.sessions.filter(s=>s.status==='in_progress').length,1);
});
test('rechaza formatos ajenos y versiones futuras sin tocar el objeto original',()=>{
  const data=fixture();const original=structuredClone(data);const backup=buildBackup(data);
  backup.schemaVersion=99;assert.throws(()=>validateBackup(backup),/actualizá/);
  backup.schemaVersion=1;backup.appId='otra';assert.throws(()=>validateBackup(backup),/no pertenece/);
  assert.deepEqual(data,original);
});
test('rechaza referencias rotas y UUID duplicados',()=>{
  let backup=buildBackup(fixture());backup.data.sets[0].sessionExerciseId='inexistente';assert.throws(()=>validateBackup(backup),/serie sin ejercicio/);
  backup=buildBackup(fixture());backup.data.sets.push(structuredClone(backup.data.sets[0]));assert.throws(()=>validateBackup(backup),/duplicados/);
});
test('rechaza descansos importados que desborden el reloj',()=>{
  const backup=buildBackup(fixture());backup.data.sessionExercises[0].restSeconds=Number.MAX_SAFE_INTEGER;
  assert.throws(()=>validateBackup(backup),/descanso superior/);
});
test('rechaza dos sesiones activas y estados de finalización inconsistentes',()=>{
  const backup=buildBackup(fixture());backup.data.sessions[0].status='in_progress';backup.data.sessions[0].endedAt=null;
  assert.throws(()=>validateBackup(backup),/más de una/);
  backup.data.sessions[0].status='finished';assert.throws(()=>validateBackup(backup),/inconsistente/);
});
test('no permite marcar una carga vacía como 0 ni repeticiones no enteras',()=>{
  assert.equal(validCompletedSet({loadKg:null,reps:8,rir:null}),false);
  assert.equal(validCompletedSet({loadKg:0,reps:8,rir:0}),true);
  assert.equal(validCompletedSet({loadKg:20,reps:8.5,rir:1}),false);
  assert.equal(validCompletedSet({loadKg:20,reps:8,rir:-1}),false);
});
test('coma decimal y borradores parciales conservan su significado',()=>{
  assert.deepEqual(parseField('22,5','loadKg'),{valid:true,value:22.5});
  assert.deepEqual(parseField('','rir'),{valid:true,value:null});
  assert.deepEqual(parseField('0','rir'),{valid:true,value:0});
  assert.equal(parseField('22,','loadKg').valid,false);
  for(const raw of ['-2','Infinity','1e3','2,5.0'])assert.equal(parseField(raw,'loadKg').valid,false);
  assert.equal(parseField('0','reps').valid,false);
});
test('un borrador incompleto sobrevive exportación/importación',()=>{
  const data=fixture();const set=data.sets[2];set.loadKg=null;
  data.draftInputs.push({id:`${set.id}:loadKg`,setId:set.id,field:'loadKg',raw:'22,'});
  const imported=validateBackup(buildBackup(data));
  assert.equal(imported.draftInputs[0].raw,'22,');assert.equal(imported.sets[2].loadKg,null);
});
test('rechaza borradores que contradigan los valores guardados',()=>{
  const backup=buildBackup(fixture());const set=backup.data.sets[2];
  backup.data.draftInputs.push({id:`${set.id}:loadKg`,setId:set.id,field:'loadKg',raw:'99'});
  assert.throws(()=>validateBackup(backup),/borrador inconsistente/);
});
test('la sesión anterior se busca por identidad, excluyendo pendientes y la actual',()=>{
  const data=fixture();const current=data.sessionExercises[2];
  assert.equal(previousEntry(data,current).id,data.sessionExercises[1].id);
  data.exercises[0].name='Nombre nuevo';assert.equal(previousEntry(data,current).id,data.sessionExercises[1].id);
  data.sets[1].completedAt=null;assert.equal(previousEntry(data,current).id,data.sessionExercises[0].id);
  data.sessionExercises[0].exerciseId='variante-distinta';assert.equal(previousEntry(data,current),null);
});
test('la cronología de las series no se agrupa por tipo',()=>{
  const data=fixture();const entry=data.sessionExercises[2];
  data.sets=data.sets.filter(s=>s.sessionExerciseId!==entry.id);
  for(const [order,type] of [[3,'calentamiento'],[1,'efectiva'],[2,'aproximacion']])data.sets.push({id:uid(),sessionExerciseId:entry.id,order,type});
  assert.deepEqual(entrySets(data,entry.id).map(s=>s.type),['efectiva','aproximacion','calentamiento']);
});
test('el descanso recupera el tiempo por timestamp después de suspensión',()=>{
  const start=Date.parse('2026-10-26T18:00:00Z');const timer=makeTimer({id:'entry',restSeconds:120},'set',start);
  assert.equal(remainingMs(timer,start+73000),47000);
  assert.equal(remainingMs(timer,start+300000),0);
  assert.equal(remainingMs(JSON.parse(JSON.stringify(timer)),start+100000),20000);
});
test('pausa, reanudación y ajustes no acumulan ticks ni producen negativos',()=>{
  const start=Date.now();const timer=makeTimer({id:'entry',restSeconds:120},'set',start);
  const paused=pauseTimer(timer,start+30000);assert.equal(remainingMs(paused,start+999000),90000);
  const resumed=resumeTimer(paused,start+100000);assert.equal(remainingMs(resumed,start+130000),60000);
  const adjusted=adjustTimer(resumed,-100,start+130000);assert.equal(remainingMs(adjusted,start+130000),0);
  const extended=adjustTimer({...adjusted,status:'elapsed'},15,start+200000);assert.equal(remainingMs(extended,start+200000),15000);
  assert.equal(makeTimer({id:'entry',restSeconds:0},'set',start),null);
});
test('el importador elimina campos desconocidos y el render escapa HTML',()=>{
  const backup=buildBackup(fixture());backup.data.exercises[0].html='<img src=x onerror=alert(1)>';
  const imported=validateBackup(backup);assert.equal('html' in imported.exercises[0],false);
  assert.equal(escapeHTML('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');
});
test('UUIDs únicos y válidos',()=>{
  const ids=Array.from({length:1000},uid);assert.equal(new Set(ids).size,1000);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Service Worker usa subruta GitHub Pages y abre el HTML desde caché',async()=>{
  const listeners={};const scope='https://ejemplo.github.io/serie/';const cached=new Response('offline-shell');
  const seen={};
  const cache={addAll:async requests=>{seen.assets=requests.map(r=>r.url);},match:async()=>cached};
  const context={URL,Request,Response,Set,console,fetch:async()=>{throw new Error('No hay red');},caches:{open:async name=>{seen.cache=name;return cache;},keys:async()=>[],delete:async()=>true},
    self:{registration:{scope},location:{origin:'https://ejemplo.github.io'},addEventListener:(name,callback)=>listeners[name]=callback,clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async()=>{}},skipWaiting:()=>{}}};
  vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
  let installed;listeners.install({waitUntil:promise=>installed=promise});await installed;
  assert.ok(seen.assets.every(url=>url.startsWith(scope)));
  assert.ok(seen.assets.includes(`${scope}js/app.js`));
  let response;listeners.fetch({request:{method:'GET',url:scope,mode:'navigate'},respondWith:promise=>response=promise});
  assert.equal(await (await response).text(),'offline-shell');
  let intercepted=false;listeners.fetch({request:{method:'GET',url:'https://ejemplo.github.io/otra/',mode:'navigate'},respondWith:()=>intercepted=true});
  assert.equal(intercepted,false);
});
test('el manifiesto y las rutas del cache existen sin rutas absolutas',()=>{
  const root=new URL('../',import.meta.url);const manifest=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root),'utf8'));
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.id,'./');
  for(const icon of manifest.icons)assert.ok(fs.existsSync(new URL(icon.src,root)));
  const sw=fs.readFileSync(new URL('sw.js',root),'utf8');
  for(const match of sw.matchAll(/'\.\/([^']+)'/g))if(!match[1].includes('$'))assert.ok(fs.existsSync(new URL(match[1],root)),match[1]);
});
