const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
function summaryFixture({version=2, hz=1, count=5, device='CS3_03', invalidUtc=false, windows=null}={}) {
  const header=version===1?32:75;
  const buffer=new ArrayBuffer(header+90*count), view=new DataView(buffer), bytes=new Uint8Array(buffer);
  bytes.set(Buffer.from('CS3SUM01'));view.setUint16(8,version,true);view.setUint16(10,header,true);view.setUint16(12,90,true);
  bytes.set(Buffer.from(device),16);
  if(version>=2){bytes.set(Buffer.from('1.0.0'),32);bytes.set(Buffer.from('2026-11-11T00:00:00Z'),48);view.setUint8(69,1);}
  if(version===3){view.setUint16(14,hz,true);view.setUint8(70,1);}
  for(let i=0;i<count;i++){
    const offset=header+90*i;
    const window=version===3?(windows?windows[i]:i)+1:i;
    view.setBigUint64(offset,BigInt(invalidUtc?0:1794355200000+window*1000/hz),true);
    view.setBigUint64(offset+8,BigInt(window*1e6/hz),true);
    view.setUint32(offset+16,i,true);view.setUint16(offset+20,100/hz,true);
    view.setInt32(offset+22,1000+i*100,true);view.setInt32(offset+30,-500,true);
    view.setUint16(offset+80,3800,true);view.setInt16(offset+78,2350,true);
    view.setUint16(offset+88,(invalidUtc?0:32)|(version===3?3:0)|(version===3&&i>0&&windows&&windows[i]-windows[i-1]>1?128:0),true);
  }
  return buffer;
}
module.exports={summaryFixture};
if(require.main===module){
(async()=>{
 const context=vm.createContext({ArrayBuffer,Uint8Array,DataView,TextDecoder,Request,Response,Headers,File,URL,crypto:webcrypto,console,devices:JSON.parse(fs.readFileSync("dashboard/devices.json","utf8"))});
 vm.runInContext(fs.readFileSync('dashboard/decoder.js','utf8'),context);
 vm.runInContext(fs.readFileSync('backend/worker/index.js','utf8').replace('import "../../dashboard/decoder.js";','').replace('import devices from "../../dashboard/devices.json";','').replace('export default {','globalThis.worker = {'),context);
 assert.equal(context.motionCrc32(new TextEncoder().encode('123456789').buffer),'cbf43926');
 const objects=new Map(); let puts=0;
 const bucket={
  async get(key){const o=objects.get(key);return o?{...o,body:o.bytes}:null;},
  async put(key,bytes,options){puts++;objects.set(key,{key,bytes:bytes.slice(0),size:bytes.byteLength,uploaded:new Date(),customMetadata:options.customMetadata});},
  async list({prefix,cursor}){const all=[...objects.values()].filter(o=>o.key.startsWith(prefix));const start=Number(cursor||0);return {objects:all.slice(start,start+2),truncated:start+2<all.length,cursor:String(start+2)};}
 };
 const env={DEVICE_API_KEY:'test',UPLOADS:bucket};
 async function upload(bytes,overrides={},filename='CS3_03_SUMMARY_20261111.bin',key='test'){
  const fields={device_id:'CS3_03',timestamp:'2026-11-11T00:00:00Z',date:'2026-11-11',sampling_frequency:'1',summary_hz:'1',measurement_type:'motion_summary',file_format:'cs3_summary_v2',crc32:context.motionCrc32(bytes),size_bytes:String(bytes.byteLength),...overrides};
  const form=new FormData();for(const [name,value] of Object.entries(fields))if(value!==null)form.append(name,value);
  form.append('file',new File([bytes],filename));
  const response=await context.worker.fetch(new Request('https://test/api/v1/upload',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form}),env);
  return {status:response.status,body:await response.json()};
 }
 const backup=await upload(summaryFixture({device:'CS3_00'}),{device_id:'CS3_00'});assert.equal(backup.status,200);
 const backupListing=await context.worker.fetch(new Request('https://test/api/v1/files?device=CS3_00'),env);assert.equal((await backupListing.json()).files.length,1);
 const downloadBackup=await context.worker.fetch(new Request('https://test/api/v1/files/content?key='+encodeURIComponent(backup.body.path)),env);assert.equal(downloadBackup.status,200);
 assert.equal((await upload(summaryFixture({device:'CS3_99'}),{device_id:'CS3_99'})).status,422);
 objects.clear();puts=0;
 const first=summaryFixture();const stored=await upload(first);assert.equal(stored.status,200);assert.equal(stored.body.status,'STORED');assert.equal(stored.body.summary_hz,1);assert.equal(stored.body.record_count,5);
 const duplicate=await upload(first,{},'different-name.bin');assert.equal(duplicate.body.status,'ALREADY_EXISTS');assert.equal(duplicate.body.path,stored.body.path);assert.equal(puts,1);
 const larger=await upload(summaryFixture({count:8}));assert.equal(larger.body.status,'STORED');assert.notEqual(larger.body.path,stored.body.path);assert.equal(objects.size,2);
 assert.equal(objects.get(stored.body.path).customMetadata.summary_hz,'1');assert.equal(objects.get(stored.body.path).customMetadata.represented_duration_seconds,'5');
 for(const version of [1,2]){
  const old=await upload(summaryFixture({version,hz:10,count:9}),{summary_hz:'10',sampling_frequency:'10',file_format:`cs3_summary_v${version}`});
  assert.equal(old.body.status,'STORED');assert.equal(old.body.summary_hz,10);
 }
 assert.equal((await upload(first,{summary_hz:null})).body.status,'ALREADY_EXISTS'); // firmware sampling_frequency alias
 assert.equal((await upload(first,{sampling_frequency:null})).body.status,'ALREADY_EXISTS'); // explicit summary_hz only
 assert.equal((await upload(first,{crc32:'00000000'})).status,422);
 assert.equal((await upload(first,{size_bytes:'1'})).status,422);
 assert.equal((await upload(first,{summary_hz:'2',sampling_frequency:'2'})).status,422);
 assert.equal((await upload(first,{summary_hz:'1',sampling_frequency:'10'})).status,422);
 assert.equal((await upload(first,{date:'2026-11-10'})).status,422);
 assert.equal((await upload(first,{device_id:'CS3_02'})).status,422);
 assert.equal((await upload(first,{},'file.bin','wrong')).status,401);
 const tail=new Uint8Array(first.byteLength+1);tail.set(new Uint8Array(first));assert.equal((await upload(tail.buffer)).status,422);
 const bad=first.slice(0);new DataView(bad).setUint16(10,76,true);assert.equal((await upload(bad)).status,422);
 const raw=new ArrayBuffer(81);new Uint8Array(raw).set(Buffer.from('CS3RAW01'));assert.equal((await upload(raw)).status,422);
 // Current-day stopped files and header-only snapshots are valid, no midnight/full-day rule.
 assert.equal((await upload(summaryFixture({count:0}))).body.status,'STORED');
 // V3 is versioned explicitly despite identical byte sizes; metadata must agree.
 const v3bytes=summaryFixture({version:3,count:3,windows:[0,1,4]});
 const v3=await upload(v3bytes,{file_format:'cs3_summary_v3'},'CS3_03_SUMMARY_20261111_v3.bin');assert.equal(v3.body.status,'STORED');assert.equal(v3.body.format_version,3);assert.equal(v3.body.time_basis,1);
 assert.equal((await upload(v3bytes,{file_format:'cs3_summary_v3'})).body.status,'ALREADY_EXISTS');
 const v3metadata=objects.get(v3.body.path).customMetadata;assert.equal(v3metadata.summary_hz,'1');assert.equal(v3metadata.sampling_frequency,'1');assert.equal(v3metadata.file_format,'cs3_summary_v3');assert.equal(v3metadata.time_basis,'1');assert.equal(v3metadata.timestamp_semantics,'exclusive completed-window end');
 assert.equal((await upload(v3bytes,{file_format:'cs3_summary_v2'})).status,422);
 assert.equal((await upload(v3bytes,{file_format:'cs3_summary_v3',summary_hz:'10',sampling_frequency:'10'})).status,422);
 const badBasis=v3bytes.slice(0);new DataView(badBasis).setUint8(70,0);assert.equal((await upload(badBasis,{file_format:'cs3_summary_v3'})).status,422);
 const badRate=v3bytes.slice(0);new DataView(badRate).setUint16(14,10,true);assert.equal((await upload(badRate,{file_format:'cs3_summary_v3'})).status,422);
 assert.equal((await upload(summaryFixture({version:3,count:0}),{file_format:'cs3_summary_v3'})).status,422);
 assert.equal((await upload(summaryFixture({version:3,count:1}),{file_format:'cs3_summary_v3'})).body.status,'STORED');
 // A complete 1 Hz UTC day fits the unchanged 10 MiB admission limit.
 const day=await upload(summaryFixture({version:3,count:86400}),{file_format:'cs3_summary_v3'});assert.equal(day.body.status,'STORED');assert.equal(day.body.record_count,86400);assert.ok(day.body.size_bytes<10*1024*1024);
 const overLimit=await context.worker.fetch(new Request('https://test/api/v1/upload',{method:'POST',headers:{Authorization:'Bearer test','Content-Length':String(11*1024*1024)}}),env);assert.equal(overLimit.status,413);
 // A hypothetical CRC collision cannot silently overwrite existing content.
 const saved=objects.get(stored.body.path);saved.customMetadata.sha256='0'.repeat(64);assert.equal((await upload(first)).status,409);saved.customMetadata.sha256=stored.body.sha256;
 const response=await context.worker.fetch(new Request('https://test/api/v1/files?device=CS3_03',{headers:{Origin:'http://localhost:8000'}}),env);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'http://localhost:8000');
 const listing=await response.json();assert.ok(listing.files.every(f=>f.date==='2026-11-11'));assert.equal(listing.files.filter(f=>f.preferred).length,1);assert.equal(listing.files[0].size_bytes,Math.max(...listing.files.map(f=>f.size_bytes)));assert.ok(listing.files.some(f=>f.summary_hz===1));assert.ok(listing.files.some(f=>f.summary_hz===10));
 const download=await context.worker.fetch(new Request('https://test/api/v1/files/content?key='+encodeURIComponent(stored.body.path)),env);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from(first));
 // Legacy keys remain listed, with unknown frequency rather than a fabricated 10 Hz.
 objects.set('CS01/2026/11/10/old.bin',{key:'CS01/2026/11/10/old.bin',size:100,uploaded:new Date()});
 const legacy=await (await context.worker.fetch(new Request('https://test/api/v1/files?device=CS01'),env)).json();assert.equal(legacy.files[0].date,'2026-11-10');assert.equal(legacy.files[0].summary_hz,null);
 objects.set('CS01/2026/11/09/summary.bin',{key:'CS01/2026/11/09/summary.bin',size:100,uploaded:new Date(),customMetadata:{measurement_type:'motion_summary',sampling_frequency:'10'}});
 const alias=await (await context.worker.fetch(new Request('https://test/api/v1/files?device=CS01'),env)).json();assert.equal(alias.files.find(f=>f.date==='2026-11-09').summary_hz,10);
 console.log('PASS: Worker 1/10 Hz, versioned v1/v2/v3 layouts, independent CRC vector/verification, identity duplicates, growing partial-day snapshots, metadata, listing preference/history, downloads and rejection cases.');
})().catch(error=>{console.error(error);process.exitCode=1;});
}
