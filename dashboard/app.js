const INDEX_URL = new URL("data/index.json", document.baseURI);
const REPO_RAW = "https://raw.githubusercontent.com/hui-aqua/Storage/main/";
const WORKER_URL = "https://marine-motion-storage-api.stavanger.workers.dev";
const state = { records: [], points: [], series: 'acc', cloudFiles: [], enabled: new Set(['x','y','z']), range: [0,1], times: [] };
const $ = s => document.querySelector(s);
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}
function formatDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC", ...options }).format(date);
}
function workerContentUrl(key) {
  const url = new URL("/api/v1/files/content", WORKER_URL);
  url.searchParams.set("key", key);
  return url.href;
}
function fileUrl(record) {
  if (record.url) return record.url;
  if (record.path) return new URL(record.path.split("/").map(encodeURIComponent).join("/"), REPO_RAW).href;
  return "#";
}
function fileUrlForRaw(record) {
  return record.raw_key ? workerContentUrl(record.raw_key) : "#";
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines.shift().split(",").map((value) => value.trim());
  if (!SUMMARY_COLUMNS.every((name, index) => header[index] === name)) throw new Error("CSV columns do not match the daily SUMMARY format");
  return lines.map((line) => {
    const columns = line.split(",");
    const row = Object.fromEntries(header.map((key, index) => [key, columns[index]]));
    return { t: row.UTC_time, ax: Number(row.acc_x_mean), ay: Number(row.acc_y_mean), az: Number(row.acc_z_mean), gx: Number(row.gyro_x_mean), gy: Number(row.gyro_y_mean), gz: Number(row.gyro_z_mean), row };
  }).filter((point) => [point.ax, point.ay, point.az, point.gx, point.gy, point.gz].every(Number.isFinite));
}
function renderHistory() {
  const body = $("#history-body");
  if (!state.records.length) return;
  body.replaceChildren(...state.records.map((record) => {
    const row = document.createElement("tr");
    ["PUBLISHED", record.device_id || "device", formatDate(record.timestamp), record.filename || "SUMMARY.csv", formatBytes(Number(record.size_bytes)), record.sha256 ? `${record.sha256.slice(0, 12)}â€¦` : "â€”"].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) cell.className = "status-cell";
      if (index === 3) cell.className = "file-cell";
      if (index === 5) cell.className = "hash-cell";
      row.append(cell);
    });
    const action = document.createElement("td");
    const link = document.createElement("a");
    link.className = "table-download";
    link.href = fileUrl(record);
    link.textContent = "â†“";
    link.setAttribute("aria-label", `Download ${record.filename || "summary"}`);
    link.setAttribute("download", record.filename || "summary.csv");
    action.append(link);
    row.append(action);
    return row;
  }));
}
async function loadSummary(record) {
  const response = await fetch(fileUrl(record));
  if (!response.ok) throw new Error(`Unable to download SUMMARY CSV (${response.status})`);
  return parseCsv(await response.text());
}
function selectedCloudFile() {
  return state.cloudFiles.find((file) => file.key === $("#cloud-file").value) || null;
}
function setDownloadEnabled(enabled) {
  const link = $("#cloud-download");
  link.classList.toggle("disabled", !enabled);
  link.setAttribute("aria-disabled", enabled ? "false" : "true");
  if (!enabled) link.href = "#";
}
const colors = ['#168575','#397bd2','#c07d20','#a36acb'];
const signals = {
 acc:{label:'Acceleration',unit:'g',keys:['ax','ay','az'],vector:true}, gyro:{label:'Gyroscope',unit:'Â°/s',keys:['gx','gy','gz'],vector:true},
 accPeak:{label:'Recorded acceleration peaks',unit:'g',keys:['accXPeak','accYPeak','accZPeak','accMagPeak'],vector:true},gyroPeak:{label:'Recorded gyroscope peaks',unit:'Â°/s',keys:['gyroXPeak','gyroYPeak','gyroZPeak','gyroMagPeak'],vector:true},
 temperature:{label:'Temperature',unit:'Â°C',keys:['temperature']},battery:{label:'Battery',unit:'mV',keys:['batteryMv']},missed:{label:'Missed samples',unit:'samples',keys:['missedSamples']},samples:{label:'Samples per summary',unit:'samples',keys:['sampleCount']},saturation:{label:'Saturation',unit:'0 / 1',keys:['accSaturated','gyroSaturated'],labels:['Acceleration','Gyroscope']}
};
let exportSource=null;
let loadToken=0, originalUrl=null, hover=null, drag=null;
function diagnostic(error){ const line=error instanceof Error?error.message:String(error); $('#diagnostics').textContent += '\n'+line; }
function notice(text){$('#notice').hidden=!text;$('#notice').textContent=text;}
function fail(message,error){notice(message+' Open Advanced & diagnostics for details.');diagnostic(error);}
function link(id,url,name=''){const a=$(id);a.href=url||'#';a.download=name;a.classList.toggle('disabled',!url);a.setAttribute('aria-disabled',String(!url));}
function setOriginal(url,name){if(originalUrl){URL.revokeObjectURL(originalUrl);originalUrl=null;}link('#original',url,name);}
function entries(){const s=signals[state.series];if(!s.vector)return s.keys.map((key,i)=>({key,label:s.labels?.[i]||s.label,color:colors[i]}));return ['x','y','z','m'].filter(a=>state.enabled.has(a)).map(a=>{const i=['x','y','z','m'].indexOf(a);return {key:s.keys[i]||'magnitude',label:a==='m'?'Magnitude':a.toUpperCase(),color:colors[i]};});}
function value(p,key){if(key==='magnitude'){const keys=signals[state.series].keys.slice(0,3);return keys.every(k=>Number.isFinite(p[k]))?Math.hypot(...keys.map(k=>p[k])):null;}const v=p[key];return typeof v==='boolean'?Number(v):v;}
// IANA timezone formatting is presentation-only. Coordinates retain UTC milliseconds.
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let displayTimeZone = browserTimeZone;
const timeFormatters = new Map();
function displayParts(t, zone = displayTimeZone) {
 if (!timeFormatters.has(zone)) timeFormatters.set(zone, new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  hourCycle: 'h23', timeZoneName: 'short'
 }));
 return Object.fromEntries(timeFormatters.get(zone).formatToParts(new Date(t)).map(p => [p.type, p.value]));
}
function displayTimestamp(t, zone = displayTimeZone) {
 const p = displayParts(t, zone);
 return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond} ${p.timeZoneName}`;
}
function zoneDescription(t) {
 const name = displayParts(t).timeZoneName;
 const offset = new Intl.DateTimeFormat('en-GB', {timeZone: displayTimeZone, timeZoneName: 'shortOffset'})
  .formatToParts(new Date(t)).find(p => p.type === 'timeZoneName').value.replace('GMT', 'UTC');
 return name === offset ? name : `${name}, ${offset}`;
}
function updateTimeZoneLabel() {
 let text = `Time: ${displayTimeZone}`;
 if (state.clock === 'utc' && state.points.length) {
  const [a, b] = bounds();
  const descriptions = [...new Set([zoneDescription(state.times[a]), zoneDescription(state.times[b])])];
  if (displayTimeZone !== 'UTC') text += ` (${descriptions.join(' → ')})`;
 } else if (state.points.length) text += ' | chart uses ' + state.clock + ' time';
 $('#active-timezone').textContent = text;
}
$('#timezone').onchange = () => {
 displayTimeZone = $('#timezone').value === 'browser' ? browserTimeZone : $('#timezone').value;
 update();
};
updateTimeZoneLabel();
function timeLabel(index,exact=false){
 if(!state.points.length)return '';
 const point=state.points[index],v3=state.meta?.kind==='summary'&&state.meta.version===3;
 const format=t=>state.clock==='utc'?displayTimestamp(t):(t/1e6).toFixed(exact?6:2)+' s';
 let label;
 if(state.clock==='index')label='Record '+(index+1)+' | clock unavailable';
 else if(v3)label='['+format(state.times[index]-(state.clock==='utc'?1000:1e6))+', '+format(state.times[index])+') | '+(state.clock==='utc'?displayTimeZone:'host monotonic')+' exclusive window end';
 else label=format(state.times[index])+(state.clock==='utc'?'':state.clock==='relative'?' | nominal SUMMARY time':' | sensor');
 if(v3)label+=' | '+point.sampleCount+' samples'+(point.timingWarning?' | timing warning':'')+(point.emptyIntervalGap?' | empty interval gap':'')+(point.loss?' | detected loss':'');
 if(state.clock==='utc')label='Local: '+label+'\nUTC: '+displayTimestamp(state.times[index], 'UTC');
 return label;
}

function normalize(points){return points.map(p=>{if(!p.row)return {...p,batteryMv:p.batteryVoltage==null?null:p.batteryVoltage*1000};const r=p.row;return {...p,t:r.UTC_time,sensorTimeUs:Number(r.sensor_time_us),temperature:Number(r.temperature),batteryMv:Number(r.battery_voltage)*1000,accXPeak:Number(r.acc_x_peak),accYPeak:Number(r.acc_y_peak),accZPeak:Number(r.acc_z_peak),accMagPeak:Number(r.acc_mag_peak),gyroXPeak:Number(r.gyro_x_peak),gyroYPeak:Number(r.gyro_y_peak),gyroZPeak:Number(r.gyro_z_peak),gyroMagPeak:Number(r.gyro_mag_peak),sampleCount:Number(r.sample_count),missedSamples:Number(r.missed_samples),accSaturated:Number(r.acc_saturation),gyroSaturated:Number(r.gyro_saturation)};});}
function adopt(points,meta){
 exportSource=null;$('#export-csv').disabled=true;
 state.points=normalize(points);state.meta=meta;state.range=[0,1];hover=null;
 const v3=meta.kind==='summary'&&meta.version===3;
 state.clock=meta.kind==='raw'?'sensor':'utc';
 let times=state.points.map(p=>meta.kind==='raw'?Number(p.t):p.row?Date.parse(p.t):Number(p.t));
 const invalid=meta.timestampsValid===false||times.some((t,i)=>!Number.isFinite(t)||(state.clock==='utc'&&(t<=0||t>8640000000000000||state.points[i].timeValid===false))||(i&&t<times[i-1]));
 if(invalid){
  state.clock='index';times=points.map((_,i)=>i);
  if(v3&&meta.monotonicValid){
   state.clock='monotonic';times=state.points.map(p=>Number(p.sensorTimeUs));
   diagnostic('SUMMARY v3 UTC unavailable/discontinuous: using recorded host monotonic window ends; gaps preserved.');
  }else if(!v3&&meta.kind==='summary'&&[1,10].includes(meta.summaryHz)){
   state.clock='relative';times=points.map((_,i)=>i*(meta.stride||1)/meta.summaryHz*1e6);
   diagnostic('Relative nominal legacy SUMMARY time from upload metadata; no UTC reconstruction.');
  }else diagnostic('Unavailable/discontinuous timestamps: plot uses record order. No duration or gap-free clock is reconstructed.');
 }
 meta.timeBasis=state.clock;
 meta.representedDurationSeconds=meta.summaryHz?meta.count/meta.summaryHz:null;
 state.times=times;
 $('#chart-title').textContent=meta.filename;
 const rateLabel=meta.summaryHz?meta.summaryHz+' Hz ('+meta.rateSource+')':'frequency unknown';
 $('#measurement').textContent=[meta.device||'Unknown device',meta.date||'Date unavailable',meta.kind==='raw'?meta.rate+' Hz configured':'SUMMARY'+(meta.version?' v'+meta.version:'')+' | '+rateLabel,meta.count.toLocaleString()+' records'].join(' | ');
 $('#sample-info').textContent=points.length.toLocaleString()+' displayed / '+meta.count.toLocaleString()+' records';
 $('#plot-empty').hidden=!!points.length;$('#plot-empty strong').textContent='No complete records';$('#plot-empty span').textContent='This recording has no samples to display.';
 $('#file-info').replaceChildren();
 const labels={summaryHz:'SUMMARY frequency (Hz)',rateSource:'Frequency source',crc32:'CRC32 (whole file)',representedDurationSeconds:v3?'Recorded completed windows total (s)':'Approximate represented duration (s)',timestampSpanSeconds:'Recorded UTC endpoint span (s)',monotonicSpanSeconds:'Recorded monotonic endpoint span (s)',windowCoverageSeconds:'First window start to last end (s; includes gaps)',timestampSemantics:'Record timestamp meaning',headerTimeBasis:'Header time_basis',bytes:'File size (bytes)',count:'Complete records',device:'Device ID',date:'Date / creation time',snapshotKey:'R2 snapshot key',timeBasis:'Chart time basis'};
 for(const [key,val] of Object.entries(meta)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=labels[key]||key;dd.textContent=val??'Unavailable';$('#file-info').append(dt,dd);}
 for(const option of $('#signal').options){const signal=signals[option.value];option.disabled=!state.points.some(p=>signal.keys.some(k=>Number.isFinite(p[k])||typeof p[k]==='boolean'));}
 if($('#signal').selectedOptions[0].disabled)$('#signal').value='acc';state.series=$('#signal').value;
 notice(meta.tail?'Recording has an incomplete final record. Complete records are shown; preserve the original file.':v3?'SUMMARY v3: timestamps label exclusive ends of completed 1-second windows. Empty intervals are omitted; unfinished final intervals are discarded by firmware.':'');
 update();
}

async function openLocal(file){if(!file)return;const token=++loadToken;notice('Opening recordingâ€¦');try{let points,meta,source;if(file.name.toLowerCase().endsWith('.csv')){source=await file.text();points=parseCsv(source);meta={kind:'summary',count:points.length};}else{source=await file.arrayBuffer();const result=decodeBinary(source);points=result.points;meta={kind:result.kind,count:result.recordCount,device:result.header.device,date:result.header.createdUtc,rate:result.header.sampleRate,summaryHz:result.header.summaryHz,rateSource:result.header.rateSource,crc32:motionCrc32(source),timestampSpanSeconds:result.timestampSpanSeconds,timestampsValid:result.timestampsValid,monotonicValid:result.monotonicValid,monotonicSpanSeconds:result.monotonicSpanSeconds,windowCoverageSeconds:result.windowCoverageSeconds,timestampSemantics:result.header.timestampSemantics,headerTimeBasis:result.header.timeBasis,stride:result.stride,tail:result.tailBytes,version:result.header.version,headerBytes:result.header.headerBytes,recordBytes:result.header.recordBytes,firmware:result.header.firmware,droppedSamples:result.header.droppedSamples};}if(token!==loadToken)return;adopt(points,{...meta,filename:file.name,source:'Local file',bytes:file.size});exportSource=source;$('#export-csv').disabled=false;link('#download-link',null);link('#raw-download-link',null);setOriginal(URL.createObjectURL(file),file.name);originalUrl=$('#original').href;}catch(error){if(token===loadToken)fail('This file could not be opened. Choose a valid RAW or SUMMARY recording.',error);}}
function renderList(query=''){const filtered=state.records.filter(r=>`${r.filename} ${r.device_id} ${r.timestamp}`.toLowerCase().includes(query.toLowerCase()));$('#record-list').replaceChildren();if(!filtered.length){$('#record-list').textContent='No published summaries available.';return;}for(const r of filtered){const b=document.createElement('button');b.className='record-item';b.textContent=`${r.device_id} Â· ${r.filename} Â· ${formatDate(r.timestamp)}`;b.onclick=()=>selectRecord(r);$('#record-list').append(b);}}
async function selectRecord(record){const token=++loadToken;notice('Opening summaryâ€¦');try{const points=await loadSummary(record);if(token!==loadToken)return;adopt(points,{filename:record.filename,kind:'summary',device:record.device_id,date:record.timestamp,count:points.length,source:'Published CSV',bytes:record.size_bytes});setOriginal(fileUrl(record),record.filename);link('#download-link',fileUrl(record),record.filename);link('#raw-download-link',record.raw_key?fileUrlForRaw(record):null,record.raw_filename);}catch(e){if(token===loadToken)fail('Summary unavailable. Local files can still be opened normally.',e);}}
function sortSnapshots(files){
 const sorted=files.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.size_bytes)-Number(a.size_bytes)||String(b.uploaded||'').localeCompare(String(a.uploaded||''))||String(a.key).localeCompare(String(b.key)));
 const dates=new Set();return sorted.map(f=>{const preferred=!dates.has(f.date);dates.add(f.date);return {...f,preferred};});
}
async function fetchCloudFiles(){const device=$('#cloud-device').value;const select=$('#cloud-file');select.disabled=true;$('#load-cloud').disabled=true;setDownloadEnabled(false);$('#cloud-status').textContent='Loading recordingsâ€¦';try{const url=new URL('/api/v1/files',WORKER_URL);url.searchParams.set('device',device);const response=await fetch(url,{mode:'cors',cache:'no-store'});if(!response.ok)throw Error(`Cloud file list (${response.status})`);const body=await response.json();if(device!==$('#cloud-device').value)return;state.cloudFiles=sortSnapshots(Array.isArray(body.files)?body.files:[]);select.replaceChildren(...state.cloudFiles.map(f=>new Option(`${f.date} | ${f.original_filename||f.filename} | ${formatBytes(f.size_bytes)} | ${f.crc32||f.filename}${f.preferred?' | preferred':' | previous snapshot'}`,f.key)));if(state.cloudFiles.length)select.value=state.cloudFiles[0].key;select.disabled=!state.cloudFiles.length;$('#load-cloud').disabled=!state.cloudFiles.length;$('#cloud-status').textContent=state.cloudFiles.length?`${state.cloudFiles.length} recordings available.`:'No recordings for this device.';updateCloudDownload();}catch(e){if(device!==$('#cloud-device').value)return;select.replaceChildren(new Option('Unavailable',''));$('#cloud-status').textContent='Cloud data unavailable. Local files can still be opened normally. See Advanced & diagnostics for details.';diagnostic(e);}}
function updateCloudDownload(){const f=selectedCloudFile();link('#cloud-download',f?workerContentUrl(f.key):null,f?.filename);}
async function loadCloudFile(){const f=selectedCloudFile();if(!f)return;const token=++loadToken;notice('Opening cloud recordingâ€¦');try{const response=await fetch(workerContentUrl(f.key),{mode:'cors',cache:'no-store'});if(!response.ok)throw Error(`Cloud download (${response.status})`);const data=await response.arrayBuffer(),r=decodeBinary(data,{summaryHz:f.summary_hz});if(f.crc32&&motionCrc32(data)!==f.crc32.toLowerCase())throw Error('Snapshot CRC32 does not match listing metadata');if(token!==loadToken)return;adopt(r.points,{filename:f.original_filename||f.filename,snapshotKey:f.key,uploaded:f.uploaded,kind:r.kind,count:r.recordCount,device:r.header.device,date:r.header.createdUtc||f.date,rate:r.header.sampleRate,summaryHz:r.header.summaryHz,rateSource:r.header.rateSource,crc32:f.crc32||motionCrc32(data),timestampSpanSeconds:r.timestampSpanSeconds,timestampsValid:r.timestampsValid,monotonicValid:r.monotonicValid,monotonicSpanSeconds:r.monotonicSpanSeconds,windowCoverageSeconds:r.windowCoverageSeconds,timestampSemantics:r.header.timestampSemantics,headerTimeBasis:r.header.timeBasis,source:'Cloud',bytes:data.byteLength,stride:r.stride,tail:r.tailBytes,version:r.header.version,droppedSamples:r.header.droppedSamples});exportSource=data;$('#export-csv').disabled=false;setOriginal(workerContentUrl(f.key),f.filename);link('#download-link',null);link('#raw-download-link',null);}catch(e){if(token===loadToken)fail('Cloud recording unavailable. Local files can still be opened normally.',e);}}
$('#export-csv').onclick=()=>{if(exportSource==null)return;try{const csv=typeof exportSource==='string'?exportSource:binaryCsv(exportSource,{summaryHz:state.meta.summaryHz,timeZone:displayTimeZone});const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=state.meta.filename.replace(/\.[^.]+$/,'')+'.decoded.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){fail('CSV export failed.',e);}};
function axisLabel(t,step){
 if(state.clock==='utc'){const p=displayParts(t);return `${p.hour}:${p.minute}:${p.second}`+(step<1000?'.'+p.fractionalSecond:'');}
 if((state.clock==='sensor'||state.clock==='relative'||state.clock==='monotonic'))return (t/1e6).toFixed(Math.max(0,Math.min(6,Math.ceil(-Math.log10(step/1e6)))))+' s';
 return String(Math.round(t)+1);
}
function timeTicks(start,end,width){
 const raw=(end-start)/Math.max(2,Math.floor(width/110));
 if(!(raw>0))return [{time:start,label:axisLabel(start,1)}];
 const unit=(state.clock==='sensor'||state.clock==='relative'||state.clock==='monotonic')?1e6:state.clock==='utc'?1000:1;
 const steps=[.001,.002,.005,.01,.02,.05,.1,.2,.5,1,2,5,10,15,30,60,120,300,600,900,1800,3600,7200,10800,21600,43200,86400];
 const power=10**Math.floor(Math.log10(raw));
 const step=state.clock==='index'?Math.max(1,power*[1,2,5,10].find(n=>n*power>=raw)):(steps.find(n=>n*unit>=raw)||Math.ceil(raw/unit/86400)*86400)*unit;
 const ticks=[];for(let t=Math.ceil(start/step)*step;t<=end&&ticks.length<100;t+=step)ticks.push({time:t,label:axisLabel(t,step)});return ticks;
}
function visibleSpan(a,b){
 if(state.clock==='index')return (b-a+1)+' records visible; duration unavailable';
 const seconds=(state.times[b]-state.times[a])/((state.clock==='sensor'||state.clock==='relative'||state.clock==='monotonic')?1e6:1000);
 const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
 return (state.meta?.kind==='summary'&&state.meta.version===3?'Visible window-end span: ':'Visible span: ')+(hours?hours+' h ':'')+(minutes?minutes+' min ':'')+(seconds%60).toFixed(3)+' s';
}
function bounds(){const n=state.points.length;return [Math.floor(state.range[0]*Math.max(0,n-1)),Math.ceil(state.range[1]*Math.max(0,n-1))];}
function setRange(a,b){const min=Math.min(1,2/Math.max(2,state.points.length-1));const width=Math.max(min,Math.min(1,b-a));a=Math.max(0,Math.min(1-width,a));state.range=[a,a+width];hover=null;update();}
function xFraction(event){const r=$('#chart').getBoundingClientRect();return Math.max(0,Math.min(1,(event.clientX-r.left-64)/(r.width-82)));}
function update(){updateTimeZoneLabel();const s=signals[state.series];$('#chart-subtitle').textContent=`${s.label} Â· ${s.unit}`;$('#axes').hidden=!s.vector;$('#range-start').value=Math.round(state.range[0]*1000);$('#range-end').value=Math.round(state.range[1]*1000);const [a,b]=bounds();$('#range-label').textContent=state.points.length?`${axisLabel(state.times[a],1)} to ${axisLabel(state.times[b],1)} | ${visibleSpan(a,b)}${state.clock==='utc'?' | '+displayTimeZone:state.clock==='monotonic'?' | recorded host monotonic':state.clock==='relative'?' | nominal SUMMARY time':''}`:'Full recording';drawChart();statistics();}
function statistics(){if(!$('#analysis').open)return;if(!state.points.length){$('#stats-note').textContent='Open a recording to calculate statistics.';$('#stats').replaceChildren();return;}const [a,b]=bounds();$('#stats-note').textContent=`Visible range Â· ${b-a+1} displayed records. ${state.meta?.stride>1?'Statistics use evenly sampled plot points, not every original record.':'Statistics describe displayed records.'} RMS of SUMMARY means is not raw-sample RMS. ${state.meta?.version===3?'V3 statistics cover recorded windows only, without sample-count weighting or filled gaps. ':''}Units: ${signals[state.series].unit}.`;$('#stats').replaceChildren();for(const e of entries()){let count=0,sum=0,squares=0,min=Infinity,max=-Infinity;for(let i=a;i<=b;i++){const v=value(state.points[i]||{},e.key);if(!Number.isFinite(v))continue;count++;sum+=v;squares+=v*v;min=Math.min(min,v);max=Math.max(max,v);}const tr=document.createElement('tr');for(const v of [e.label,...(count?[sum/count,Math.sqrt(squares/count),min,max,Math.max(Math.abs(min),Math.abs(max))]:Array(5).fill(null))]){const td=document.createElement('td');td.textContent=typeof v==='number'?v.toFixed(5):v??'â€”';tr.append(td);}$('#stats').append(tr);}}
function drawChart(){const canvas=$('#chart'),r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=r.width,h=r.height,L=64,R=w-18,T=18,B=h-34;const css=getComputedStyle(document.documentElement);ctx.font='11px system-ui';const [a,b]=bounds(),es=entries();let min=Infinity,max=-Infinity;for(let i=a;i<=b;i++)for(const e of es){const v=value(state.points[i]||{},e.key);if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}if(!Number.isFinite(min)){min=-1;max=1;}if(min===max){min-=1;max+=1;}const margin=(max-min)*.08;min-=margin;max+=margin;const t0=state.times[a],t1=state.times[b],span=t1-t0;const x=i=>L+(R-L)*(span?(state.times[i]-t0)/span:(i-a)/Math.max(1,b-a));const y=v=>T+(max-v)/(max-min)*(B-T);for(let i=0;i<=4;i++){const yy=T+(B-T)*i/4;ctx.strokeStyle=css.getPropertyValue('--grid');ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(R,yy);ctx.stroke();ctx.fillStyle=css.getPropertyValue('--muted');ctx.textAlign='right';ctx.fillText((max-(max-min)*i/4).toFixed(2),L-9,yy+4);}if(!state.points.length){$('#tooltip').hidden=true;return;}ctx.save();ctx.beginPath();ctx.rect(L,T,R-L,B-T);ctx.clip();for(const e of es){ctx.strokeStyle=e.color;ctx.lineWidth=1.5;ctx.beginPath();let connected=false;for(let i=a;i<=b;i++){const v=value(state.points[i],e.key);if(!Number.isFinite(v)){connected=false;continue;}if(state.meta?.version===3&&state.points[i].gapBefore)connected=false;connected?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v));connected=true;}ctx.stroke();if(state.meta?.kind==='summary'&&state.meta.version===3){ctx.fillStyle=e.color;for(let i=a;i<=b;i++){const v=value(state.points[i],e.key);if(Number.isFinite(v))ctx.fillRect(x(i)-1.5,y(v)-1.5,3,3);}}}if(drag?.select){ctx.fillStyle='#397bd233';const p=L+drag.start*(R-L),q=L+drag.current*(R-L);ctx.fillRect(Math.min(p,q),T,Math.abs(p-q),B-T);}if(hover!=null){ctx.strokeStyle=css.getPropertyValue('--muted');ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x(hover),T);ctx.lineTo(x(hover),B);ctx.stroke();}ctx.restore();ctx.fillStyle=css.getPropertyValue('--muted');ctx.textAlign='center';for(const tick of timeTicks(t0,t1,R-L)){const xx=L+(R-L)*(span?(tick.time-t0)/span:0);ctx.strokeStyle=css.getPropertyValue('--grid');ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,B);ctx.stroke();ctx.fillText(tick.label,xx,h-10);}$('#tooltip').hidden=hover==null;if(hover!=null)$('#tooltip').textContent=[timeLabel(hover,true),...es.map(e=>`${e.label}: ${Number.isFinite(value(state.points[hover],e.key))?value(state.points[hover],e.key).toPrecision(8):'Unavailable'} ${signals[state.series].unit}`)].join('\n');}
const chart=$('#chart');chart.addEventListener('wheel',e=>{if(!state.points.length)return;e.preventDefault();const f=xFraction(e),[a,b]=state.range,width=(b-a)*Math.exp(Math.max(-1,Math.min(1,e.deltaY*.002))),anchor=a+f*(b-a);setRange(anchor-f*width,anchor+(1-f)*width);},{passive:false});
chart.addEventListener('pointerdown',e=>{if(!state.points.length)return;chart.setPointerCapture(e.pointerId);drag={start:xFraction(e),current:xFraction(e),range:[...state.range],select:e.shiftKey||$('#drag-mode').value==='select'};});
chart.addEventListener('pointermove',e=>{const f=xFraction(e);if(drag){drag.current=f;if(drag.select)drawChart();else{const width=drag.range[1]-drag.range[0],delta=(drag.start-f)*width;setRange(drag.range[0]+delta,drag.range[1]+delta);}return;}const [a,b]=bounds();if(!state.points.length)return;const target=state.times[a]+f*(state.times[b]-state.times[a]);let lo=a,hi=b;while(lo<hi){const m=Math.floor((lo+hi)/2);if(state.times[m]<target)lo=m+1;else hi=m;}hover=lo>a&&Math.abs(state.times[lo-1]-target)<Math.abs(state.times[lo]-target)?lo-1:lo;drawChart();});
function endDrag(e){if(!drag)return;const d=drag;drag=null;if(d.select&&Math.abs(d.current-d.start)>.003){const w=d.range[1]-d.range[0];setRange(d.range[0]+Math.min(d.start,d.current)*w,d.range[0]+Math.max(d.start,d.current)*w);}else drawChart();}chart.addEventListener('pointerup',endDrag);chart.addEventListener('pointercancel',()=>{drag=null;drawChart();});chart.addEventListener('pointerleave',()=>{if(!drag){hover=null;$('#tooltip').hidden=true;drawChart();}});chart.addEventListener('dblclick',()=>setRange(0,1));chart.addEventListener('keydown',e=>{const [a,b]=state.range,w=b-a,c=(a+b)/2;if(e.key==='Home')setRange(0,1);else if(e.key==='ArrowLeft')setRange(a-w*.1,b-w*.1);else if(e.key==='ArrowRight')setRange(a+w*.1,b+w*.1);else if(['+','=','-'].includes(e.key)){const nw=w*(e.key==='-'?1.25:.8);setRange(c-nw/2,c+nw/2);}else return;e.preventDefault();});
$('#reset').onclick=()=>setRange(0,1);$('#range-start').oninput=e=>setRange(Math.min(Number(e.target.value)/1000,state.range[1]-.002),state.range[1]);$('#range-end').oninput=e=>setRange(state.range[0],Math.max(Number(e.target.value)/1000,state.range[0]+.002));$('#signal').onchange=e=>{state.series=e.target.value;hover=null;update();};$('#axes').onchange=e=>{e.target.checked?state.enabled.add(e.target.value):state.enabled.delete(e.target.value);update();};$('#analysis').addEventListener('toggle',statistics);
$('#open-file').onclick=()=>$('#local-file').click();$('#local-file').onchange=e=>{openLocal(e.target.files[0]);e.target.value='';};let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;document.body.classList.add('dragging');}});document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',()=>{if(--dragDepth<=0)document.body.classList.remove('dragging');});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('dragging');openLocal(e.dataTransfer.files[0]);});
$('#cloud-toggle').onclick=()=>{const panel=$('#cloud-panel');panel.hidden=!panel.hidden;$('#cloud-toggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&!state.cloudFiles.length)fetchCloudFiles();};$('#cloud-device').onchange=fetchCloudFiles;$('#cloud-file').onchange=updateCloudDownload;$('#load-cloud').onclick=loadCloudFile;$('#refresh-cloud').onclick=fetchCloudFiles;$('#search').oninput=e=>renderList(e.target.value);
const systemTheme=matchMedia('(prefers-color-scheme: dark)');function applyTheme(){const mode=$('#theme').value;document.documentElement.dataset.theme=mode==='system'?(systemTheme.matches?'dark':'light'):mode;drawChart();}try{$('#theme').value=localStorage.getItem('motion-theme')||'light';}catch{}$('#theme').onchange=()=>{try{localStorage.setItem('motion-theme',$('#theme').value);}catch{}applyTheme();};systemTheme.addEventListener('change',applyTheme);new ResizeObserver(drawChart).observe($('#plot-wrap'));applyTheme();
async function init(){try{const response=await fetch(INDEX_URL,{cache:'no-store'});if(!response.ok)throw Error(`Index request failed (${response.status})`);const data=await response.json();if(!Array.isArray(data.records))throw Error('Index records missing');state.records=data.records.slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));renderList();renderHistory();}catch(e){$('#record-list').textContent='Published summaries unavailable. Local files can still be opened normally.';diagnostic(e);}}init();
