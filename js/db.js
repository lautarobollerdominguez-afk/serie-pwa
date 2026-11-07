import {DATA_STORES, initialData} from './core.js';

export const APP_SCOPE = new URL('../', import.meta.url).pathname;
export const DB_NAME = `serie-v1:${APP_SCOPE}`;
const STORES = ['meta', ...DATA_STORES, 'recovery'];
const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error || new Error('La escritura se interrumpió.'));
  transaction.onerror = () => {}; // El resultado definitivo se recibe en abort o complete.
});
export class Repository {
  constructor(name = DB_NAME, onStatus = () => {}) {
    this.name = name;
    this.onStatus = onStatus;
    this.pending = [];
    this.working = false;
    this.error = null;
    this.waiters = [];
  }
  async open() {
    const request = indexedDB.open(this.name, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of STORES) if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, {keyPath: 'id'});
      const entries = request.transaction.objectStore('sessionExercises');
      entries.createIndex('exerciseDate', ['exerciseId', 'sessionStartedAt']);
      entries.createIndex('session', 'sessionId');
      request.transaction.objectStore('sets').createIndex('entryOrder', ['sessionExerciseId', 'order']);
      request.transaction.objectStore('sessions').createIndex('startedAt', 'startedAt');
    };
    request.onblocked = () => this.onStatus('error', new Error('Cerrá las otras pestañas de Serie y recargá.'));
    this.db = await requestResult(request);
    this.db.onversionchange = () => {this.db.close(); this.onStatus('error', new Error('La base de datos cambió. Recargá esta pestaña.'));};
    let data = await this.readAll();
    if (!data.meta.some(item => item.id === 'settings')) {
      data = initialData();
      await this.replace(data, null);
    }
    return data;
  }
  async readAll() {
    const transaction = this.db.transaction(['meta', ...DATA_STORES], 'readonly');
    const done = transactionDone(transaction);
    const pairs = await Promise.all(['meta', ...DATA_STORES].map(async name => [name, await requestResult(transaction.objectStore(name).getAll())]));
    await done;
    return Object.fromEntries(pairs);
  }
  writeTransaction(stores) {
    // strict es una preferencia de durabilidad; no elimina los límites físicos del dispositivo.
    try { return this.db.transaction(stores, 'readwrite', {durability: 'strict'}); }
    catch { return this.db.transaction(stores, 'readwrite'); }
  }
  enqueue(operations) {
    this.pending.push(...structuredClone(operations));
    this.onStatus(this.error ? 'error' : 'saving', this.error);
    void this.pump();
  }
  async pump() {
    if (this.working || this.error || !this.pending.length) return;
    this.working = true;
    const operations = this.pending.slice();
    try {
      const transaction = this.writeTransaction([...new Set(operations.map(op => op.store))]);
      const done = transactionDone(transaction);
      try {
        for (const op of operations) {
          const store = transaction.objectStore(op.store);
          if (op.type === 'delete') store.delete(op.id);
          else store.put(op.value);
        }
      } catch (error) {
        transaction.abort();
        await done.catch(() => {});
        throw error;
      }
      await done;
      this.pending.splice(0, operations.length);
    } catch (error) {
      this.error = error;
      this.onStatus('error', error);
      this.waiters.splice(0).forEach(waiter => waiter.reject(error));
    } finally {
      this.working = false;
    }
    if (!this.error && this.pending.length) void this.pump();
    else if (!this.error) {
      this.onStatus('saved');
      this.waiters.splice(0).forEach(waiter => waiter.resolve());
    }
  }
  flush() {
    if (this.error) return Promise.reject(this.error);
    if (!this.pending.length && !this.working) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({resolve, reject}));
  }
  retry() { this.error = null; this.onStatus('saving'); void this.pump(); return this.flush(); }
  async replace(data, recoveryBackup) {
    await this.flush();
    const transaction = this.writeTransaction(STORES);
    const done = transactionDone(transaction);
    try {
      if (recoveryBackup) transaction.objectStore('recovery').put({id: 'before-import', backup: recoveryBackup, createdAt: new Date().toISOString()});
      for (const name of ['meta', ...DATA_STORES]) {
        const store = transaction.objectStore(name);
        store.clear();
        for (const record of data[name]) store.put(record);
      }
    } catch (error) {transaction.abort(); await done.catch(() => {}); throw error;}
    await done;
    this.onStatus('saved');
  }
  async recovery() {
    const transaction = this.db.transaction('recovery', 'readonly');
    return requestResult(transaction.objectStore('recovery').get('before-import'));
  }
  close() { this.db?.close(); }
}

export const put = (store, value) => ({type: 'put', store, value: structuredClone(value)});
export const remove = (store, id) => ({type: 'delete', store, id});
export const putMeta = (id, value) => put('meta', {id, value});
export function applyMemory(data, operations) {
  for (const op of operations) {
    const records = data[op.store];
    const recordId = op.type === 'delete' ? op.id : op.value.id;
    const index = records.findIndex(record => record.id === recordId);
    if (op.type === 'delete') {if (index >= 0) records.splice(index, 1);}
    else if (index >= 0) records[index] = structuredClone(op.value);
    else records.push(structuredClone(op.value));
  }
}
