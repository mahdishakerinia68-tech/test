(function(){
  const DB_NAME='hesabdar-v4',DB_VERSION=1;
  /* v1.2.9 (t1): these are scalar fields on `data`, not one of the array
   * STORES above, so they were never written to IndexedDB at all — pin,
   * language, branding and year-settlement all silently reverted after a
   * reload. They're now saved into meta/'settings' and restored from it. */
  const SETTINGS_FIELDS=['pinHash','pinSalt','patternHash','patternSalt','lockMethod','biometricEnabled','webauthnCredId','lang','branding','yearSettlements'];
  const STORES=['accounts','transactions','invoices','customers','products','people','checks','notes','reminders','audit','attachments','trash','expenseCats','incomeCats','syncMetadata','meta'];
  let dbPromise;
  function openDatabase(){if(dbPromise)return dbPromise;if(!('indexedDB'in globalThis))return Promise.reject(new Error('IndexedDB در این دستگاه در دسترس نیست'));dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;for(const s of STORES)if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB unavailable'))});return dbPromise}
  function getAll(store){return openDatabase().then(db=>new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)}))}
  function getMetaRecord(id){return openDatabase().then(db=>new Promise((res,rej)=>{const r=db.transaction('meta').objectStore('meta').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))}
  async function exportDatabaseSnapshot(){const out={};for(const s of STORES.filter(x=>!['meta','syncMetadata'].includes(x)))out[s]=await getAll(s);const sync=await new Promise((res,rej)=>openDatabase().then(db=>{const r=db.transaction('syncMetadata').objectStore('syncMetadata').get('root');r.onsuccess=()=>res(r.result?.value);r.onerror=()=>rej(r.error)}));out._sync=sync||{tombstones:{}};const settings=await getMetaRecord('settings');if(settings)for(const f of SETTINGS_FIELDS)if(settings[f]!==undefined)out[f]=settings[f];return out}
  async function saveSnapshot(data){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,'readwrite');for(const s of STORES)tx.objectStore(s).clear();for(const s of STORES.filter(x=>!['meta','syncMetadata'].includes(x)))for(const r of data[s]||[])tx.objectStore(s).put(r);tx.objectStore('meta').put({id:'root',schemaVersion:data.schemaVersion,appVersion:'t1',savedAt:new Date().toISOString()});const settings={id:'settings'};for(const f of SETTINGS_FIELDS)settings[f]=data[f];tx.objectStore('meta').put(settings);tx.objectStore('syncMetadata').put({id:'root',value:data._sync||{tombstones:{}}});tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'))})}
  async function hydrate(blank){try{const snap=await exportDatabaseSnapshot();const meta=await getMetaRecord('root');snap.schemaVersion=meta?.schemaVersion||4;const has=Object.values(snap).some(v=>Array.isArray(v)&&v.length);return has?snap:blank}catch(e){return blank}}
  globalThis.HesabYarStorage={openDatabase,saveSnapshot,exportDatabaseSnapshot,hydrate};
})();
