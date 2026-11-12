const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const elements=new Map(),events={};const noop=()=>{};function el(id){if(elements.has(id))return elements.get(id);const e={id,value:id==='#theme'?'light':id==='#signal'?'acc':id==='#cloud-device'?'CS01':'',textContent:'',hidden:false,disabled:false,style:{},dataset:{},classList:{toggle:noop,add:noop,remove:noop},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]},append(...nodes){(this.children??=[]).push(...nodes)},replaceChildren(...nodes){this.children=nodes},addEventListener(k,fn){(this.events??={})[k]=fn},getBoundingClientRect(){return {width:1200,height:500,left:0}},getContext(){return new Proxy({},{get:()=>noop,set:()=>true})},setPointerCapture:noop,click:noop};elements.set(id,e);return e;}
const document={querySelector:el,createElement:()=>el(Symbol()),documentElement:{dataset:{}},body:el('body'),addEventListener(k,fn){events[k]=fn},baseURI:'http://localhost/dashboard/'};
class TestURL extends URL { static createObjectURL(){return "blob:test"} static revokeObjectURL(){} }
const ctx=vm.createContext({document,window:{},URL:TestURL,Option:function(text,value){this.text=text;this.value=value},ArrayBuffer,Uint8Array,DataView,TextDecoder,BigInt,console,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener:noop}),localStorage:{getItem:()=>null,setItem:noop},getComputedStyle:()=>({getPropertyValue:()=> '#888'}),ResizeObserver:class{observe(){}},fetch:async url=>String(url).endsWith('devices.json')?{ok:true,json:async()=>JSON.parse(fs.readFileSync('dashboard/devices.json','utf8'))}:{ok:false,status:404}});ctx.window=ctx;el('#signal').options=['acc','gyro','temperature','battery'].map(value=>({value}));Object.defineProperty(el('#signal'),'selectedOptions',{get(){return this.options.filter(o=>o.value===this.value)}});vm.runInContext(fs.readFileSync('dashboard/decoder.js','utf8'),ctx);vm.runInContext(fs.readFileSync('dashboard/app.js','utf8'),ctx);
function fixture(kind,version,count=100){const raw=kind==='raw',header=raw?(version===1?73:81):(version===1?32:75),record=raw?22:90;const b=new ArrayBuffer(header+record*count),v=new DataView(b),u=new Uint8Array(b);u.set(Buffer.from(raw?'CS3RAW01':'CS3SUM01'));v.setUint16(8,version,true);v.setUint16(10,header,true);u.set(Buffer.from('CS3_01'),raw?12:16);if(raw){v.setInt16(65,8,true);v.setInt16(67,1000,true);v.setUint16(69,100,true);v.setUint16(71,22,true);}else v.setUint16(12,90,true);for(let i=0;i<count;i++){let o=header+i*record;if(raw){v.setBigUint64(o,BigInt(i*10000),true);v.setInt16(o+8,4096,true);v.setUint16(o+20,3,true);}else{v.setBigUint64(o,BigInt(1794355200000+i*100),true);v.setInt32(o+22,1000,true);v.setInt32(o+30,-500,true);v.setInt16(o+78,2350,true);v.setUint16(o+80,3800,true);v.setUint16(o+20,10,true);v.setUint16(o+88,32,true);}}return b;}
(async()=>{await vm.runInContext('devicesReady',ctx);assert.ok(el('#cloud-device').children.some(o=>o.value==='CS3_00'));for(const kind of ['raw','summary'])for(const version of [1,2]){const r=ctx.decodeBinary(fixture(kind,version));assert.equal(r.recordCount,100);assert.equal(r.points[0].ax,1);await ctx.openLocal({name:`${kind}.bin`,size:100,arrayBuffer:async()=>fixture(kind,version)});assert.equal(vm.runInContext('state.points.length',ctx),100);assert.equal(el('#original').getAttribute('aria-disabled'),'false');}vm.runInContext("state.series='battery';update()",ctx);assert.equal(vm.runInContext('state.points[0].batteryMv',ctx),3800);vm.runInContext("state.series='acc';state.enabled.delete('y');setRange(.2,.5)",ctx);assert.equal(ctx.entries().length,2);assert.ok(vm.runInContext('state.range[1]<1',ctx));el('#analysis').open=true;ctx.statistics();assert.equal(el('#stats').children.length,2);el('#theme').value='dark';ctx.applyTheme();assert.equal(document.documentElement.dataset.theme,'dark');el('#theme').value='system';ctx.applyTheme();assert.equal(document.documentElement.dataset.theme,'light');ctx.setRange(0,1);el('#chart').events.wheel({preventDefault:noop,clientX:600,deltaY:-200});assert.ok(vm.runInContext('state.range[1]-state.range[0]<1',ctx));el('#chart').events.pointermove({clientX:600});assert.equal(el('#tooltip').hidden,false);ctx.setRange(0,1);el('#chart').events.pointerdown({clientX:300,pointerId:1,shiftKey:true});el('#chart').events.pointermove({clientX:800});el('#chart').events.pointerup({});assert.ok(vm.runInContext('state.range[0]>0 && state.range[1]<1',ctx));ctx.setRange(0,1);el('#chart').events.keydown({key:'+',preventDefault:noop});assert.ok(vm.runInContext('state.range[1]-state.range[0]<1',ctx));await ctx.fetchCloudFiles();assert.match(el('#cloud-status').textContent,/Local files/);assert.equal(vm.runInContext('state.points.length',ctx),100);await events.drop({preventDefault:noop,dataTransfer:{files:[{name:'dropped.bin',size:9075,arrayBuffer:async()=>fixture('summary',2)}]}});await new Promise(setImmediate);assert.equal(el('#chart-title').textContent,'dropped.bin');
// Export must retain every record even when the plot is downsampled.
for(const kind of ['raw','summary'])for(const version of [1,2]){
 const buffer=fixture(kind,version,24001),decoded=ctx.decodeBinary(buffer);
 assert.ok(decoded.stride>1);
 const csv=ctx.binaryCsv(buffer),lines=csv.trim().split('\r\n');
 assert.equal(lines.length,24002);
 assert.match(lines[0],/header_device/);
 assert.match(lines[0],kind==='raw'?/axCounts/:/sensorTimeUs/);
 assert.match(lines.at(-1),/"24000"/);
}
// Human-readable SUMMARY times follow the export-time selection, including DST offsets.
const timedSummary=fixture('summary',2,3),timedView=new DataView(timedSummary);
timedView.setBigUint64(75,BigInt(Date.parse('2026-10-25T00:30:00.123Z')),true);
timedView.setBigUint64(165,BigInt(Date.parse('2026-10-25T01:30:00.123Z')),true);
timedView.setUint16(255+88,0,true);
const osloCsv=ctx.binaryCsv(timedSummary,{timeZone:'Europe/Oslo'});
assert.match(osloCsv,/"record_time_local"/);
assert.match(osloCsv,/2026-10-25 02:30:00.123 UTC\+02:00 \[Europe\/Oslo\]/);
assert.match(osloCsv,/2026-10-25 02:30:00.123 UTC\+01:00 \[Europe\/Oslo\]/);
assert.ok(osloCsv.trim().split('\r\n')[3].endsWith(',""'));
assert.match(ctx.binaryCsv(timedSummary,{timeZone:'UTC'}),/2026-10-25 00:30:00.123 UTC(?:\+00:00)? \[UTC\]/);
assert.doesNotMatch(ctx.binaryCsv(fixture('raw',2),{timeZone:'Europe/Oslo'}),/record_time_local/);
let downloadedBlob;
ctx.Blob=Blob;ctx.setTimeout=noop;
TestURL.createObjectURL=blob=>{downloadedBlob=blob;return 'blob:test';};
await ctx.openLocal({name:'times.bin',size:timedSummary.byteLength,arrayBuffer:async()=>timedSummary});
for(const zone of ['Europe/Oslo','UTC','browser']){
 el('#timezone').value=zone;el('#timezone').onchange();el('#export-csv').onclick();
 const exported=await downloadedBlob.text();
 const expected=vm.runInContext('displayTimeZone',ctx);
 assert.equal(exported,ctx.binaryCsv(timedSummary,{timeZone:expected}));
}
await ctx.openLocal({name:'span.bin',size:1,arrayBuffer:async()=>fixture('summary',2)});
ctx.setRange(0,1);const fullSpan=el('#range-label').textContent;
assert.match(fullSpan,/Visible span: 9.900 s/);
ctx.setRange(.2,.4);assert.notEqual(el('#range-label').textContent,fullSpan);
assert.match(el('#range-label').textContent,/Visible span: 2.100 s/);
assert.ok(!el('#range-label').textContent.includes('2026-'));
const wideTicks=ctx.timeTicks(1794355200000,1794355260000,1000);
const zoomTicks=ctx.timeTicks(1794355200000,1794355201000,1000);
assert.ok(wideTicks.length>2);assert.ok(zoomTicks.length>2);
assert.ok(zoomTicks[1].time-zoomTicks[0].time<wideTicks[1].time-wideTicks[0].time);
assert.match(zoomTicks[0].label,/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
console.log('PASS: full-record CSV export for RAW/SUMMARY v1/v2, metadata and raw counts, adaptive ticks and visible duration.');
// Unchanged headers: frequency is upload metadata only, never inferred locally.
const {summaryFixture}=require('./test_summary_workflow.cjs');
for(const version of [1,2])for(const hz of [1,10]){
 const buffer=summaryFixture({version,hz,count:11});
 const local=ctx.decodeBinary(buffer);
 assert.equal(local.header.summaryHz,null);assert.equal(local.header.sampleRate,null);
 assert.equal(local.representedDurationSeconds,null);
 assert.equal(local.timestampSpanSeconds,10/hz);
 const explicit=ctx.decodeBinary(buffer,{summaryHz:hz});
 assert.equal(explicit.header.summaryHz,hz);assert.equal(explicit.representedDurationSeconds,11/hz);
 await ctx.openLocal({name:'local-summary.bin',size:buffer.byteLength,arrayBuffer:async()=>buffer});
 assert.equal(vm.runInContext('state.points.length',ctx),11);
 assert.equal(vm.runInContext('state.meta.summaryHz',ctx),null);
 assert.match(el('#measurement').textContent,/frequency unknown/);
 assert.equal(vm.runInContext('state.times[10]-state.times[0]',ctx),10000/hz);
 assert.equal(vm.runInContext('state.meta.crc32',ctx),ctx.motionCrc32(buffer));
 const cloud={key:'CS3_03/2026/11/11/test.bin',date:'2026-11-11',filename:'test.bin',summary_hz:hz,crc32:ctx.motionCrc32(buffer)};
 ctx.testCloud=cloud;vm.runInContext('state.cloudFiles=[testCloud]',ctx);el('#cloud-file').value=cloud.key;
 ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>buffer});await ctx.loadCloudFile();
 assert.equal(vm.runInContext('state.meta.summaryHz',ctx),hz);
 assert.equal(vm.runInContext('state.meta.representedDurationSeconds',ctx),11/hz);
 assert.equal(vm.runInContext('state.times[10]-state.times[0]',ctx),10000/hz);
 assert.match(el('#measurement').textContent,new RegExp(hz+' Hz'));
 assert.match(ctx.binaryCsv(buffer,{summaryHz:hz}),/header_summaryHz/);
}
const invalid=summaryFixture({count:11,invalidUtc:true});
// Display-only timezone changes exercise the real local and remote loading paths.
const timezoneBuffer=summaryFixture({count:4});
const timezoneView=new DataView(timezoneBuffer);
const transitionTimes=['2026-03-29T00:59:59Z','2026-03-29T01:00:00Z','2026-10-25T00:59:59Z','2026-10-25T01:00:00Z'].map(Date.parse);
transitionTimes.forEach((t,i)=>timezoneView.setBigUint64(75+i*90,BigInt(t),true));
for(const source of ['local','remote']){
 if(source==='local')await ctx.openLocal({name:'timezone.bin',size:timezoneBuffer.byteLength,arrayBuffer:async()=>timezoneBuffer});
 else {
  vm.runInContext("state.cloudFiles=[{key:'timezone',filename:'timezone.bin',summary_hz:1}]",ctx);
  el('#cloud-file').value='timezone';ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>timezoneBuffer});await ctx.loadCloudFile();
 }
 const before=vm.runInContext('JSON.stringify({points:state.points,times:state.times,range:state.range})',ctx);
 const bytes=Buffer.from(timezoneBuffer).toString('hex');
 for(const zone of ['UTC','Europe/Oslo','browser','Asia/Shanghai']){
  el('#timezone').value=zone;el('#timezone').onchange();
  assert.equal(vm.runInContext('JSON.stringify({points:state.points,times:state.times,range:state.range})',ctx),before);
  assert.equal(Buffer.from(timezoneBuffer).toString('hex'),bytes);
  assert.match(ctx.timeLabel(0),/Local:.*\nUTC: 2026-03-29 00:59:59.000 UTC/s);
  const resolved=zone==='browser'?vm.runInContext('Intl.DateTimeFormat().resolvedOptions().timeZone',ctx):zone;
  assert.ok(el('#active-timezone').textContent.includes(resolved));
  if(zone==='UTC')assert.equal(ctx.axisLabel(transitionTimes[0],1000),'00:59:59');
  if(zone==='Europe/Oslo'){
   assert.equal(ctx.axisLabel(transitionTimes[0],1000),'01:59:59');
   assert.equal(ctx.axisLabel(transitionTimes[1],1000),'03:00:00');
   assert.equal(ctx.axisLabel(transitionTimes[2],1000),'02:59:59');
   assert.equal(ctx.axisLabel(transitionTimes[3],1000),'02:00:00');
   assert.match(ctx.displayTimestamp(Date.parse('2026-11-11T12:00:00Z')),/2026-11-11 13:00:00.000 CET/);
   assert.match(ctx.displayTimestamp(Date.parse('2026-07-11T12:00:00Z')),/2026-07-11 14:00:00.000 CEST/);
   ctx.setRange(0,.4);assert.match(el('#active-timezone').textContent,/CET, UTC\+1 → CEST, UTC\+2/);ctx.setRange(0,1);
   el('#chart').events.pointermove({clientX:600});assert.match(el('#tooltip').textContent,/Local:.*\nUTC:/s);
  }
 }
}
el('#timezone').value='browser';el('#timezone').onchange();
console.log('PASS: local/cloud timezone switching, browser detection, UTC, Oslo winter/summer and both DST transitions, tooltip and source invariance.');
await ctx.openLocal({name:'invalid-clock.bin',size:invalid.byteLength,arrayBuffer:async()=>invalid});
assert.equal(vm.runInContext('state.clock',ctx),'index'); // no local rate inference, even with 1-second sensor intervals
const nominal=ctx.decodeBinary(invalid,{summaryHz:1});
ctx.adopt(nominal.points,{kind:'summary',filename:'nominal.bin',count:11,summaryHz:1,timestampsValid:nominal.timestampsValid,stride:1});
assert.equal(vm.runInContext('state.clock',ctx),'relative');assert.equal(vm.runInContext('state.times[10]',ctx),10e6);
assert.match(ctx.timeLabel(10),/nominal SUMMARY time/);
const snapshots=ctx.sortSnapshots([{key:'old',date:'2026-11-11',size_bytes:100,uploaded:'2026-11-11T02:00:00Z'},{key:'new',date:'2026-11-11',size_bytes:200,uploaded:'2026-11-11T01:00:00Z'}]);
assert.equal(snapshots[0].key,'new');assert.equal(snapshots[0].preferred,true);assert.equal(snapshots.length,2);
ctx.testListing=snapshots;
ctx.fetch=async()=>({ok:true,json:async()=>({files:ctx.testListing})});await ctx.fetchCloudFiles();assert.equal(el('#cloud-file').value,'new');
// CRC mismatch must not adopt the downloaded recording.
vm.runInContext("state.cloudFiles=[{key:'bad',filename:'bad.bin',summary_hz:1,crc32:'00000000'}]",ctx);el('#cloud-file').value='bad';
const beforeName=vm.runInContext('state.meta.filename',ctx);ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>invalid});await ctx.loadCloudFile();assert.equal(vm.runInContext('state.meta.filename',ctx),beforeName);
// All-record clock checks include records omitted by plot sampling.
const skipped=summaryFixture({count:24001});new DataView(skipped).setUint16(75+90+88,0,true);
assert.equal(ctx.decodeBinary(skipped).timestampsValid,false);
const sampledNominal=ctx.decodeBinary(skipped,{summaryHz:1});ctx.adopt(sampledNominal.points,{kind:'summary',filename:'sampled.bin',count:sampledNominal.recordCount,summaryHz:1,timestampsValid:false,stride:sampledNominal.stride});assert.equal(vm.runInContext('state.times[1]',ctx),sampledNominal.stride*1e6);
assert.equal(ctx.decodeBinary(summaryFixture({count:0}),{summaryHz:1}).representedDurationSeconds,0);
assert.throws(()=>ctx.decodeBinary(invalid,{summaryHz:2}),/summary_hz/);
ctx.fetch=async()=>({ok:false,status:404});
console.log('PASS: local 1/10 Hz timestamps without rate inference, cloud metadata rate/duration, CRC, nominal fallback, snapshots and hidden invalid timestamps.');
// V3 fields come from DATA_FORMAT.md, not header length or filename heuristics.
const v3buffer=summaryFixture({version:3,count:3,windows:[0,1,4]});
const v3view=new DataView(v3buffer);v3view.setUint16(75+20,83,true);v3view.setUint16(75+90+20,127,true);v3view.setUint16(75+180+88,3|32|64|128,true);
const v3decoded=ctx.decodeBinary(v3buffer);
assert.equal(v3decoded.header.version,3);assert.equal(v3decoded.header.summaryHz,1);assert.equal(v3decoded.header.rateSource,'v3 header');assert.equal(v3decoded.header.timeBasis,1);
assert.equal(v3decoded.header.firmware,'1.0.0');assert.equal(v3decoded.representedDurationSeconds,3);assert.equal(v3decoded.timestampSpanSeconds,4);assert.equal(v3decoded.windowCoverageSeconds,5);
assert.equal(v3decoded.points[0].sampleCount,83);assert.equal(v3decoded.points[1].sampleCount,127);
assert.equal(v3decoded.points[0].windowStartUtcMs,'1794355200000');assert.equal(v3decoded.points[0].windowEndUtcMs,'1794355201000');
assert.equal(v3decoded.points[0].windowStartMonotonicUs,'0');assert.equal(v3decoded.points[2].gapBefore,true);assert.equal(v3decoded.points[2].timingWarning,true);assert.equal(v3decoded.points[2].emptyIntervalGap,true);
await ctx.openLocal({name:'not-a-version-hint.bin',size:v3buffer.byteLength,arrayBuffer:async()=>v3buffer});
assert.equal(vm.runInContext('state.meta.summaryHz',ctx),1);assert.equal(vm.runInContext('state.clock',ctx),'utc');assert.equal(vm.runInContext('state.times[2]-state.times[1]',ctx),3000);
assert.match(el('#measurement').textContent,/SUMMARY v3.*1 Hz \(v3 header\)/);assert.match(ctx.timeLabel(0),/exclusive window end/);assert.match(ctx.timeLabel(2),/timing warning.*empty interval gap/);
assert.equal(vm.runInContext('state.points.length',ctx),3);assert.equal(el('#original').getAttribute('aria-disabled'),'false');
const v3csv=ctx.binaryCsv(v3buffer);assert.match(v3csv,/header_timeBasis/);assert.match(v3csv,/windowStartMonotonicUs/);assert.equal(v3csv.trim().split('\r\n').length,4);
const v3unsynced=summaryFixture({version:3,count:3,windows:[0,1,4],invalidUtc:true});
await ctx.openLocal({name:'unsynced_v3.bin',size:v3unsynced.byteLength,arrayBuffer:async()=>v3unsynced});
assert.equal(vm.runInContext('state.clock',ctx),'monotonic');assert.equal(vm.runInContext('state.times[2]-state.times[1]',ctx),3000000);assert.match(ctx.timeLabel(0),/host monotonic/);
// Boot-clock reset cannot be converted to a fabricated contiguous 1 Hz timeline.
const reboot=v3unsynced.slice(0);new DataView(reboot).setBigUint64(75+180+8,1000000n,true);
await ctx.openLocal({name:'reset.bin',size:reboot.byteLength,arrayBuffer:async()=>reboot});assert.equal(vm.runInContext('state.clock',ctx),'index');
const backwards=v3buffer.slice(0);new DataView(backwards).setBigUint64(75+180,1794355200000n,true);
await ctx.openLocal({name:'clock-step.bin',size:backwards.byteLength,arrayBuffer:async()=>backwards});assert.equal(vm.runInContext('state.clock',ctx),'monotonic');
const v3zero=ctx.decodeBinary(summaryFixture({version:3,count:0}));assert.equal(v3zero.recordCount,0);assert.equal(v3zero.representedDurationSeconds,0);
for(const [offset,bad] of [[14,0],[14,10],[70,0],[70,2]]){const bytes=v3buffer.slice(0),view=new DataView(bytes);if(offset===14)view.setUint16(offset,bad,true);else view.setUint8(offset,bad);assert.throws(()=>ctx.decodeBinary(bytes),/v3 rate\/time basis/);}
assert.throws(()=>ctx.decodeBinary(v3buffer,{summaryHz:10}),/conflicts/);
const rawV3=fixture('raw',2);new DataView(rawV3).setUint16(8,3,true);assert.throws(()=>ctx.decodeBinary(rawV3),/unsupported RAW version 3/);
const v2reserved=summaryFixture({version:2});new DataView(v2reserved).setUint16(14,1,true);new DataView(v2reserved).setUint8(70,1);assert.equal(ctx.decodeBinary(v2reserved).header.summaryHz,null); // version wins
// A gap hidden between retained points must still break the rendered line.
const many=summaryFixture({version:3,count:24001});new DataView(many).setUint16(75+90+88,3|32|128,true);assert.equal(ctx.decodeBinary(many).points[1].gapBefore,true);
ctx.testCloud={key:'v3',filename:'v3.bin',summary_hz:1,crc32:ctx.motionCrc32(v3buffer)};vm.runInContext('state.cloudFiles=[testCloud]',ctx);el('#cloud-file').value='v3';ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>v3buffer});await ctx.loadCloudFile();assert.equal(vm.runInContext('state.meta.version',ctx),3);
ctx.testCloud.summary_hz=10;await ctx.loadCloudFile();assert.match(el('#diagnostics').textContent,/conflicts with v3 header/);
// Check actual renderer commands: no line across the omitted interval, and isolated windows remain visible.
const strokes=[],markers=[];let path=[];const canvas=el('#chart'),oldContext=canvas.getContext;
const paint=new Proxy({beginPath(){path=[];},moveTo(){path.push('M');},lineTo(){path.push('L');},stroke(){if(this.strokeStyle==='#168575')strokes.push(path.slice());},fillRect(x,y,w,h){if(this.fillStyle==='#168575')markers.push([x,y,w,h]);}},{get(target,key){return key in target?target[key]:noop;}});
canvas.getContext=()=>paint;vm.runInContext("state.series='acc';state.enabled=new Set(['x'])",ctx);ctx.drawChart();
assert.ok(strokes.some(commands=>commands.join('')==='MLM'));assert.equal(markers.length,3);canvas.getContext=oldContext;
ctx.fetch=async()=>({ok:false,status:404});
console.log('PASS: SUMMARY v3 header rate/time basis, exclusive windows, real gaps, variable sample counts, local/cloud load, UTC/monotonic/reset fallback, CSV and legacy version separation.');
// Optional field recording: never require private measurement data in a checkout.
const samplePath=process.argv[2]||'data/samples/CS3_01_SUMMARY_20261111.bin';
if(fs.existsSync(samplePath)){
 const bytes=fs.readFileSync(samplePath);
 const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const decoded=ctx.decodeBinary(buffer),view=new DataView(buffer);
 assert.equal(decoded.kind,'summary');assert.equal(decoded.tailBytes,0);
 assert.equal(decoded.recordCount,(bytes.length-decoded.header.headerBytes)/90);
 // Independently compare every retained record with its original little-endian fields.
 decoded.points.forEach((p,i)=>{
  const offset=decoded.header.headerBytes+i*decoded.stride*90;
  assert.equal(p.t,view.getBigUint64(offset,true).toString());
  for(const [key,relative,scale] of [['ax',22,1000],['ay',26,1000],['az',30,1000],['gx',50,1000],['gy',54,1000],['gz',58,1000]])assert.equal(p[key],view.getInt32(offset+relative,true)/scale);
  const temp=view.getInt16(offset+78,true),battery=view.getUint16(offset+80,true);
  assert.equal(p.temperature,temp===-32768?null:temp/100);
  assert.equal(p.batteryVoltage,battery===0?null:battery/1000);
 });
 await ctx.openLocal({name:samplePath.split(/[\\/]/).pop(),size:bytes.length,arrayBuffer:async()=>buffer});
 assert.equal(vm.runInContext('state.points.length',ctx),decoded.plottedCount);
 assert.equal(vm.runInContext('state.meta.count',ctx),decoded.recordCount);
 assert.equal(el('#original').getAttribute('aria-disabled'),'false');
 assert.ok(!el('#measurement').textContent.includes('10 Hz'));
 for(const signal of ['acc','gyro','accPeak','gyroPeak','temperature','battery','missed','samples','saturation']){
  vm.runInContext('state.series='+JSON.stringify(signal),ctx);ctx.update();
  assert.ok(el('#stats').children.length>0);
  assert.ok(el('#stats').children.every(row=>row.children.every(cell=>!String(cell.textContent).includes('NaN'))));
 }
 ctx.setRange(.2,.4);ctx.statistics();assert.match(el('#stats-note').textContent,/evenly sampled/);
 for(const mode of ['light','dark','system']){el('#theme').value=mode;ctx.applyTheme();}
 await ctx.fetchCloudFiles();assert.equal(vm.runInContext('state.meta.count',ctx),decoded.recordCount);
 console.log('PASS field SUMMARY: '+decoded.recordCount+' records, '+decoded.plottedCount+' displayed; all retained motion/temperature/battery fields match original bytes; all signal views, statistics, themes and cloud isolation.');
}else console.log('SKIP field SUMMARY (not present): '+samplePath);
console.log('PASS: RAW/SUMMARY v1/v2, scaling, local open, drop handler, download link, battery mV, axes, ranges, wheel, selection, hover, keyboard, theme modes, statistics, cloud failure isolation.');})().catch(e=>{console.error(e);process.exitCode=1});

