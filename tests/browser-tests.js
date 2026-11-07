import {Repository,put,putMeta,applyMemory} from '../js/db.js';
import {uid,buildBackup,validateBackup,initialData} from '../js/core.js';
import {initialClock,makeCountdown,startStopwatch,stopwatchMs} from '../js/clocks.js';
const resultList=document.getElementById('results');
const summary=document.getElementById('summary');
document.getElementById('pwa-context').textContent=isSecureContext?'Contexto seguro: la instalación PWA puede comprobarse desde la app.':'Este entorno HTTP no admite Service Workers. Instalación y caché real requieren HTTPS o localhost.';
document.getElementById('run').addEventListener('click',async()=>{
  document.getElementById('run').disabled=true;resultList.innerHTML='';summary.textContent='Ejecutando…';
  const name=`serie-test-${uid()}`;const repo=new Repository(name);let passed=0;let failed=0;
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const run=async(title,fn)=>{const row=document.createElement('li');try{await fn();passed++;row.textContent=`OK · ${title}`;row.style.color='#b5ed79';}catch(error){failed++;row.textContent=`ERROR · ${title}: ${error.message}`;row.style.color='#ffaaa7';}resultList.append(row);};
  let data;
  await run('Creación de IndexedDB e inicialización',async()=>{data=await repo.open();assert(data.routines.length===1,'falta rutina inicial');});
  await run('200 cambios consecutivos conservan el último valor',async()=>{
    for(let i=0;i<200;i++)repo.enqueue([putMeta('test-value',i)]);
    await repo.flush();assert((await repo.readAll()).meta.find(x=>x.id==='test-value').value===199,'orden de escrituras incorrecto');
  });
  await run('Cerrar y reabrir conserva los datos confirmados',async()=>{
    const second=new Repository(name);const reopened=await second.open();second.close();
    assert(reopened.meta.find(x=>x.id==='test-value').value===199,'dato no persistido');
  });
  await run('Relojes generales y borrador de duración sobreviven al cierre de IndexedDB',async()=>{
    const timestamp=Date.now();
    const state={...initialClock(),minutes:'',seconds:'7',countdown:makeCountdown(90,timestamp),stopwatch:startStopwatch(initialClock().stopwatch,timestamp)};
    repo.enqueue([putMeta('clock',state)]);await repo.flush();
    const second=new Repository(name);const reopened=await second.open();second.close();
    const saved=reopened.meta.find(x=>x.id==='clock').value;
    assert(JSON.stringify(saved)===JSON.stringify(state),'el reloj cambió al reabrir');
    assert(stopwatchMs(saved.stopwatch,timestamp+75000)===75000,'el cronómetro depende de ticks');
  });
  await run('Un fallo de escritura deja la cola recuperable',async()=>{
    const original=repo.writeTransaction.bind(repo);let fail=true;
    repo.writeTransaction=(stores)=>{if(fail){fail=false;throw new DOMException('Fallo de cuota simulado','QuotaExceededError');}return original(stores);};
    repo.enqueue([putMeta('retry-test',42)]);
    let rejected=false;try{await repo.flush();}catch{rejected=true;}
    assert(rejected&&repo.pending.length===1,'se perdió la escritura fallida');
    await repo.retry();assert((await repo.readAll()).meta.find(x=>x.id==='retry-test').value===42,'reintento no persistido');
    repo.writeTransaction=original;
  });
  await run('Importación atómica y copia recuperable',async()=>{
    data=await repo.readAll();const replacement=initialData();replacement.routines[0].name='Rutina importada';
    await repo.replace(replacement,buildBackup(data));
    assert((await repo.readAll()).routines[0].name==='Rutina importada','reemplazo incompleto');
    assert((await repo.recovery()).backup.data.routines[0].name===data.routines[0].name,'sin copia anterior');
  });
  await run('Un import fallido revierte todos los cambios y su copia',async()=>{
    const before=await repo.readAll();const recoveryBefore=await repo.recovery();const broken=initialData();broken.routines.push({name:'Registro sin identificador'});
    let rejected=false;try{await repo.replace(broken,buildBackup(before));}catch{rejected=true;}
    assert(rejected,'no se rechazó el registro inválido');
    assert(JSON.stringify(await repo.readAll())===JSON.stringify(before),'se alteró la base tras abortar');
    assert(JSON.stringify(await repo.recovery())===JSON.stringify(recoveryBefore),'se alteró la copia tras abortar');
  });
  await run('Restauración de la copia anterior',async()=>{
    const recovery=await repo.recovery();const current=await repo.readAll();await repo.replace(validateBackup(recovery.backup),buildBackup(current));
    assert((await repo.readAll()).routines[0].name===data.routines[0].name,'restauración incorrecta');
  });
  repo.close();indexedDB.deleteDatabase(name);
  summary.textContent=`${passed} pruebas correctas · ${failed} fallos`;
  document.getElementById('run').disabled=false;
});
