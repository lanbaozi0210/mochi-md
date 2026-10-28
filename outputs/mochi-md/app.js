const hasNativeBridge = Boolean(window.__TAURI_INTERNALS__ || window.__MOCHI_NATIVE__);
if(hasNativeBridge) document.documentElement.classList.add('tauri');
function nativeInvoke(command,args){if(window.__TAURI__)return window.__TAURI__.core.invoke(command,args);if(window.mochiNative)return window.mochiNative.invoke(command,args);return Promise.reject(new Error('Native bridge unavailable'))}

const sample = `# 关于慢慢生活的练习

有时候，真正重要的不是抵达哪里，而是记得沿途的风是什么味道。

## 给日常留一点空白

我们总是习惯把日程排得满满的，像是只有不断向前，才算没有辜负时间。可那些没有安排的下午、漫无目的的散步，也在悄悄组成生活。

> 慢下来不是停滞，而是让灵魂跟上脚步。

最近给自己定了几个小小的约定：

- 每天留半小时不看手机
- 认真吃完一顿饭，不做别的事
- 记录一个值得记住的瞬间
- [x] 开始使用 Mochi MD

## 一些微小而确定的快乐

清晨第一杯热咖啡，窗台上新长出的叶子，读到一本好书时忍不住折起的页角……它们不轰轰烈烈，却足以让普通的一天有了光。

\`愿我们都有能力感受细微的幸福。\`
`;

const themes = [
  { id:'butter-sea', name:'黄油与海盐', colors:['#f2df9b','#7d91ad','#d9d6cf'] },
  { id:'ballpoint', name:'圆珠笔', colors:['#5b7190','#c5d5d6','#f8f7f1'] },
  { id:'doodle', name:'初代实验室', colors:['#00e51b','#242522','#f8f5eb'] },
  { id:'lavender', name:'淡紫莓果', colors:['#66519c','#bca9e8','#f4f1fb'] },
  { id:'minimal', name:'极简 Ins', colors:['#171715','#aaa9a2','#fbfbf8'] },
  { id:'coder', name:'程序员', colors:['#7bdcb5','#35425a','#171b23'] }
];
const customThemeDefaults={name:'我的海盐',bg:'#d9d6cf',panel:'#f9f6ec',sidebar:'#ebe8db',text:'#343b40',muted:'#777e82',accent:'#5b7292',accentSoft:'#f2e6ba',paper:'#fffaf0',code:'#f4eed9'};
let customThemes=(()=>{try{const value=JSON.parse(localStorage.getItem('mochi-custom-themes')||'[]');return Array.isArray(value)?value.filter(theme=>theme&&theme.id&&theme.vars):[]}catch(error){return []}})();
const customVariableNames=['--bg','--shell','--panel','--sidebar','--text','--muted','--line','--accent','--accent-soft','--accent-ink','--paper','--code','--shadow'];

let documents = JSON.parse(localStorage.getItem('mochi-documents') || 'null') || [
  { id:1,title:'关于慢慢生活的练习',content:sample,updated:'刚刚',favorite:true },
  { id:2,title:'八月阅读清单',content:'# 八月阅读清单\n\n- 《山茶文具店》\n- 《献给阿尔吉侬的花束》\n- 《禅与摩托车维修艺术》',updated:'昨天',favorite:false },
  { id:3,title:'周末去哪里散步',content:'# 周末去哪里散步\n\n想去有树、有风，也能喝到好咖啡的地方。',updated:'3 天前',favorite:false }
];
const migrationTime=Date.now();
documents=documents.map((doc,index)=>{
  const lastOpenedAt=Number(doc.lastOpenedAt)||migrationTime-index;
  return {...doc,lastOpenedAt,lastEditedAt:Number(doc.lastEditedAt)||lastOpenedAt};
});
if(!documents.length)documents=[{id:Date.now(),title:'未命名文档',content:'',updated:'新文档',favorite:false,lastOpenedAt:Date.now(),lastEditedAt:Date.now()}];
let activeId = Number(localStorage.getItem('mochi-active')) || documents[0].id;
if(!documents.some(doc=>doc.id===activeId))activeId=documents[0].id;
let fileHandle = null;
let isDirty = false;
let baselineContent = '';
let baselineTitle = '';
let documentFilter = 'all';
let contextDocumentId = null;
let recentPreferences = (()=>{try{return {...{sort:'recent',limit:10},...JSON.parse(localStorage.getItem('mochi-recent-preferences')||'{}')}}catch(error){return {sort:'recent',limit:10}}})();
if(!['recent','name'].includes(recentPreferences.sort))recentPreferences.sort='recent';
if(![5,10,20,'all'].includes(recentPreferences.limit))recentPreferences.limit=10;

const $ = (selector) => document.querySelector(selector);
const editor = $('#markdownEditor');
const preview = $('#preview');
const titleInput = $('#titleInput');
const editorArea = $('#editorArea');
const splitDivider = $('#splitDivider');
const appShell = $('.app-shell');
const readerButton = $('#focusButton');
const syncButton = $('#syncButton');
let syncEnabled = localStorage.getItem('mochi-sync-position') === 'true';
let syncFrame = 0;
let syncLockUntil = 0;
let syncTarget = null;

let splitRatio = (()=>{
  const value=Number(localStorage.getItem('mochi-split-ratio'));
  return Number.isFinite(value)&&value>=25&&value<=75?value:50;
})();
function applySplitRatio(value,persist=true){
  splitRatio=Math.max(25,Math.min(75,Number(value)||50));
  editorArea.style.setProperty('--split-ratio',`${splitRatio}%`);
  if(persist)localStorage.setItem('mochi-split-ratio',String(splitRatio));
}
applySplitRatio(splitRatio,false);

function setReaderMode(enabled){
  appShell.classList.toggle('reader-mode',enabled);
  readerButton.setAttribute('aria-pressed',String(enabled));
  readerButton.textContent=enabled?'退出阅读者模式':'阅读者模式';
  readerButton.title=enabled?'退出阅读者模式（Esc）':'阅读者模式';
  if(enabled)showToast('已进入阅读者模式，可按 ⌘ + 滚轮缩放');
}

function setReaderScale(value,notify=true){
  const scale=Math.max(.8,Math.min(1.5,Number(value)||1));
  appShell.style.setProperty('--reader-scale',scale.toFixed(2));
  localStorage.setItem('mochi-reader-scale',scale.toFixed(2));
  if(notify)showToast(`阅读字号 ${Math.round(scale*100)}%`);
}
setReaderScale(Number(localStorage.getItem('mochi-reader-scale'))||1,false);

function escapeHtml(text='') {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearSyncHighlight(){
  preview.querySelectorAll('.sync-target,.sync-hover').forEach(node=>node.classList.remove('sync-target','sync-hover'));
  syncTarget=null;
}
function setSyncHighlight(node,temporary=false){
  if(!node)return;
  if(syncTarget&&syncTarget!==node)syncTarget.classList.remove('sync-target','sync-hover');
  node.classList.add(temporary?'sync-hover':'sync-target');
  syncTarget=node;
}
function sourceLineRange(node){return {start:Number(node?.dataset.sourceStart)||0,end:Number(node?.dataset.sourceEnd)||Number(node?.dataset.sourceStart)||0}}
function lineStartOffset(line){return editor.value.split('\n').slice(0,line).reduce((sum,value)=>sum+value.length+1,0)}
function lineFromCaret(){return editor.value.slice(0,editor.selectionStart).split('\n').length-1}
function nearestSourceNode(line){
  const nodes=[...preview.querySelectorAll('[data-source-start]')];
  if(!nodes.length)return null;
  return nodes.reduce((best,node)=>{const range=sourceLineRange(node);const distance=line<range.start?range.start-line:line>range.end?line-range.end:0;return !best||distance<best.distance?{node,distance}:best},{node:null,distance:Infinity}).node;
}
function highlightSourceLine(line,scrollIntoView=false){
  if(!syncEnabled)return;
  const node=nearestSourceNode(Math.max(0,line));
  if(!node)return;
  setSyncHighlight(node);
  if(scrollIntoView)node.scrollIntoView({block:'center',behavior:'smooth'});
}
function syncPreviewToEditor(){
  if(!syncEnabled||performance.now()<syncLockUntil)return;
  const max=editor.scrollHeight-editor.clientHeight;
  const ratio=max>0?editor.scrollTop/max:0;
  const previewMax=preview.scrollHeight-preview.clientHeight;
  syncLockUntil=performance.now()+100;
  preview.scrollTop=previewMax>0?ratio*previewMax:0;
  highlightSourceLine(lineFromCaret());
}
function syncEditorToPreview(){
  if(!syncEnabled||performance.now()<syncLockUntil)return;
  const max=preview.scrollHeight-preview.clientHeight;
  const ratio=max>0?preview.scrollTop/max:0;
  const editorMax=editor.scrollHeight-editor.clientHeight;
  syncLockUntil=performance.now()+100;
  editor.scrollTop=editorMax>0?ratio*editorMax:0;
  const nodes=[...preview.querySelectorAll('[data-source-start]')];
  const visible=nodes.find(node=>node.getBoundingClientRect().bottom>preview.getBoundingClientRect().top+45)||nodes[0];
  setSyncHighlight(visible);
}
function setSyncEnabled(enabled,notify=true){
  syncEnabled=Boolean(enabled);localStorage.setItem('mochi-sync-position',String(syncEnabled));
  syncButton.setAttribute('aria-pressed',String(syncEnabled));syncButton.title=syncEnabled?'关闭两侧联动定位':'开启两侧联动定位';
  if(!syncEnabled)clearSyncHighlight();
  else {highlightSourceLine(lineFromCaret());if(notify)showToast('已开启联动定位')}
}
setSyncEnabled(syncEnabled,false);

function inline(text) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code>$1</code>');
}

function tableCells(line) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0,-1);
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const char of value) {
    if (char === '|' && !escaped) { cells.push(cell.trim()); cell = ''; continue; }
    if (char === '\\' && !escaped) { escaped = true; cell += char; continue; }
    escaped = false;
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function tableDelimiter(cells) {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderTable(lines, start) {
  if (start + 1 >= lines.length || !lines[start].includes('|')) return null;
  const headers = tableCells(lines[start]);
  const delimiters = tableCells(lines[start + 1]);
  if (headers.length < 1 || headers.length !== delimiters.length || !tableDelimiter(delimiters)) return null;

  const alignments = delimiters.map(cell => {
    const value = cell.trim();
    if (value.startsWith(':') && value.endsWith(':')) return 'center';
    if (value.startsWith(':')) return 'left';
    if (value.endsWith(':')) return 'right';
    return '';
  });
  let end = start + 2;
  const rows = [];
  while (end < lines.length && lines[end].trim() && lines[end].includes('|')) {
    rows.push(tableCells(lines[end]));
    end += 1;
  }
  let html = '<table><thead><tr>';
  headers.forEach((cell, index) => {
    const align = alignments[index] ? ` style="text-align:${alignments[index]}"` : '';
    html += `<th${align}>${inline(cell)}</th>`;
  });
  html += '</tr></thead>';
  if (rows.length) {
    html += '<tbody>';
    rows.forEach(row => {
      html += '<tr>';
      headers.forEach((_, index) => {
        const align = alignments[index] ? ` style="text-align:${alignments[index]}"` : '';
        html += `<td${align}>${inline(row[index] || '')}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
  }
  return { html: `<table data-source-start="${start}" data-source-end="${Math.max(start,end-1)}">${html.slice('<table>'.length)}</table>`, next: end };
}

function sourceMarker(start,end=start){return ` data-source-start="${start}" data-source-end="${Math.max(start,end)}"`}

function renderMarkdown(md) {
  const lines = md.split('\n');
  let html = '', inCode = false, inList = false, inQuote = false;
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    if (line.startsWith('```')) { if(inList){html+='</ul>';inList=false} html += inCode ? '</code></pre>' : `<pre${sourceMarker(i)}><code>`; inCode=!inCode; continue; }
    if (inCode) { html += escapeHtml(line)+'\n'; continue; }
    const table = renderTable(lines, i);
    if (table) {
      if(inList){html+='</ul>';inList=false}
      if(inQuote){html+='</blockquote>';inQuote=false}
      html += table.html;
      i = table.next - 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) { html+='<hr>'; continue; }
    const heading=line.match(/^(#{1,3})\s+(.+)/); if(heading){if(inList){html+='</ul>';inList=false}const n=heading[1].length;html+=`<h${n}${sourceMarker(i)}>${inline(heading[2])}</h${n}>`;continue}
    if (line.startsWith('> ')) { if(!inQuote){html+=`<blockquote${sourceMarker(i)}>`;inQuote=true}html+=`<p${sourceMarker(i)}>${inline(line.slice(2))}</p>`;continue; } else if(inQuote){html+='</blockquote>';inQuote=false}
    const item=line.match(/^[-*]\s+(.+)/); if(item){if(!inList){html+=`<ul${sourceMarker(i)}>`;inList=true}const task=item[1].match(/^\[([ xX])\]\s+(.+)/);html+=task?`<li${sourceMarker(i)}><input class="task-checkbox" type="checkbox" data-source-line="${i}" ${task[1].toLowerCase()==='x'?'checked':''}> ${inline(task[2])}</li>`:`<li${sourceMarker(i)}>${inline(item[1])}</li>`;continue}else if(inList){html+='</ul>';inList=false}
    if (!line.trim()) continue;
    html += `<p${html===''?' class="lead"':''}${sourceMarker(i)}>${inline(line)}</p>`;
  }
  if(inList)html+='</ul>'; if(inQuote)html+='</blockquote>'; if(inCode)html+='</code></pre>';
  return html;
}

function buildPdfExportHtml(){
  const theme=document.documentElement.dataset.theme||'lavender';
  const title=titleInput.value.trim()||'未命名文档';
  const customTheme=customThemes.find(item=>item.id===theme);
  const customCss=customTheme?`html[data-theme="${escapeHtml(theme)}"]{${Object.entries(customTheme.vars).map(([name,value])=>`${name}:${escapeHtml(value)};`).join('')}}`:'';
  return `<!doctype html>
<html lang="zh-CN" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--text:#302d3b;--muted:#8a8597;--line:rgba(71,61,94,.14);--accent:#8b72c7;--accent-soft:#e8e0f8;--accent-ink:#66519c;--paper:#fffefe;--code:#f3eff9;--serif:"Songti SC","Noto Serif CJK SC",Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;--mono:"SFMono-Regular",Menlo,monospace}
html[data-theme="butter-sea"]{--text:#343b40;--muted:#777e82;--line:rgba(81,91,96,.2);--accent:#5b7292;--accent-soft:#f2e6ba;--accent-ink:#405a79;--paper:#fffaf0;--code:#f4eed9}
html[data-theme="ballpoint"]{--text:#35445b;--muted:#7b8794;--line:rgba(91,111,139,.24);--accent:#5b7190;--accent-soft:#e5eaed;--accent-ink:#435a78;--paper:#fffefa;--code:#edf2f1}
html[data-theme="doodle"]{--text:#242522;--muted:#686a63;--line:rgba(36,37,34,.42);--accent:#00e51b;--accent-soft:#d7ffd6;--accent-ink:#234d27;--paper:#f8f5eb;--code:#e8e8dc}
html[data-theme="minimal"]{--text:#1c1c1a;--muted:#92928c;--line:rgba(0,0,0,.1);--accent:#171715;--accent-soft:#e8e8e3;--accent-ink:#111;--paper:#fff;--code:#f2f2ef}
html[data-theme="coder"]{--text:#d9e0ea;--muted:#8e9bad;--line:rgba(201,214,232,.12);--accent:#7bdcb5;--accent-soft:#203b35;--accent-ink:#89e8c1;--paper:#191e27;--code:#11161d}
${customCss}
*{box-sizing:border-box}html,body{margin:0;width:794px;height:auto;background:var(--paper);color:var(--text)}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}#pdfSource .markdown-body{padding:72px 66px 80px}.markdown-body>*{max-width:none;margin-left:auto;margin-right:auto}.markdown-body h1,.markdown-body h2,.markdown-body h3{font-family:var(--serif);line-height:1.3;color:var(--text);break-after:avoid-page}.markdown-body h1{font-size:28pt;margin:0 0 16pt;letter-spacing:-.03em}.markdown-body h2{font-size:18pt;margin:30pt 0 11pt}.markdown-body h3{font-size:14pt;margin:21pt 0 8pt}.markdown-body p,.markdown-body li{font-family:var(--serif);font-size:11.5pt;line-height:1.9;color:var(--text)}.markdown-body .lead{font-size:12.5pt;color:var(--muted);margin-bottom:25pt}.markdown-body hr{border:0;border-top:1px solid var(--line);margin:27pt auto}.markdown-body blockquote{display:block;width:100%;margin:22pt 0;padding:14pt 17pt;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0;break-inside:avoid-page}.markdown-body blockquote p{margin:0;color:var(--accent-ink)}.markdown-body code{font-family:var(--mono);font-size:.86em;background:var(--code);padding:2px 5px;border-radius:4px;color:var(--accent-ink)}.markdown-body pre{background:var(--code);padding:16pt;border-radius:9px;overflow-wrap:anywhere;white-space:pre-wrap;break-inside:avoid-page}.markdown-body pre code{padding:0;background:none;color:var(--text);line-height:1.6}.markdown-body a{color:var(--accent-ink);text-decoration-color:var(--accent);text-underline-offset:3px}.markdown-body ul{padding-left:20pt}.markdown-body li::marker{color:var(--accent)}.markdown-body input[type=checkbox]{accent-color:var(--accent)}.markdown-body img{max-width:100%;height:auto;border-radius:10px;break-inside:avoid-page}.markdown-body table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:10pt;break-inside:avoid-page}.markdown-body th,.markdown-body td{border:1px solid var(--line);padding:8pt;text-align:left}.markdown-body th{background:var(--accent-soft)}html[data-theme="coder"] .markdown-body,html[data-theme="coder"] .markdown-body p,html[data-theme="coder"] .markdown-body li{font-family:var(--mono)}
html[data-theme="butter-sea"] .markdown-body blockquote{background:#f8efce;border-left-color:#8093ad}html[data-theme="butter-sea"] .markdown-body th{background:#f5e9bb}
html[data-theme="ballpoint"] .markdown-body h1,html[data-theme="ballpoint"] .markdown-body h2,html[data-theme="ballpoint"] .markdown-body h3{font-family:"SFMono-Regular",Menlo,"PingFang SC",sans-serif;font-weight:500;color:var(--accent-ink);letter-spacing:0}html[data-theme="ballpoint"] .markdown-body th,html[data-theme="ballpoint"] .markdown-body td{border-style:dashed}html[data-theme="ballpoint"] .markdown-body blockquote{border-left-style:dashed}
html[data-theme="doodle"] .markdown-body h1,html[data-theme="doodle"] .markdown-body h2,html[data-theme="doodle"] .markdown-body h3{font-family:"SFMono-Regular",Menlo,"PingFang SC",sans-serif;color:var(--text);letter-spacing:0}html[data-theme="doodle"] .markdown-body h1{font-size:30pt;line-height:1.25;text-transform:uppercase;border-bottom:3px double var(--text);padding-bottom:15pt;margin-bottom:23pt}html[data-theme="doodle"] .markdown-body h2{font-size:18pt;border-bottom:1px dashed var(--text);padding-bottom:8pt}html[data-theme="doodle"] .markdown-body p,html[data-theme="doodle"] .markdown-body li{font-family:var(--sans);line-height:1.8}html[data-theme="doodle"] .markdown-body blockquote{background:var(--accent-soft);border:1px solid var(--text);border-left:5px solid var(--accent);border-radius:0}html[data-theme="doodle"] .markdown-body blockquote p{color:var(--text)}html[data-theme="doodle"] .markdown-body th,html[data-theme="doodle"] .markdown-body td{border:1px solid var(--text)}html[data-theme="doodle"] .markdown-body th{background:var(--accent)}html[data-theme="doodle"] .markdown-body li::marker{color:#167827}html[data-theme="doodle"] .markdown-body code{border:1px solid var(--line);border-radius:0}html[data-theme="doodle"] .markdown-body pre{border:1px dashed var(--text);border-radius:0}
html[data-theme="ballpoint"] .markdown-body blockquote{border-left-style:solid}
@page{size:A4;margin:0}
</style>
</head>
<body><main id="pdfSource"><article class="markdown-body">${renderMarkdown(editor.value)}</article></main>
<script>
window.mochiPaginateForPDF=function(){
  const source=document.querySelector('#pdfSource .markdown-body');
  if(!source)return 1;
  let pageIndex=0,pageBottom=1043;
  Array.from(source.children).forEach(function(node){
    const rect=node.getBoundingClientRect();
    if(rect.bottom>pageBottom&&rect.top>pageIndex*1123+72){
      const spacer=document.createElement('div');spacer.setAttribute('aria-hidden','true');
      spacer.style.height=Math.max(0,(pageIndex+1)*1123+72-rect.top)+'px';
      source.insertBefore(spacer,node);pageIndex++;pageBottom=(pageIndex+1)*1123-80;
    }
  });
  return Math.max(1,Math.ceil(document.documentElement.scrollHeight/1123));
};
</script></body>
</html>`;
}

async function exportPdf(){
  const safeName=(titleInput.value.trim()||'未命名文档').replace(/[\\/:*?"<>|]/g,'-');
  closeFilePopover();closeExportPopover();
  if(!hasNativeBridge){showToast('请在 Mochi MD 桌面版中导出 PDF');return}
  try{
    const path=await nativeInvoke('export_pdf',{defaultName:`${safeName}.pdf`,html:buildPdfExportHtml()});
    if(path)showToast('PDF 已按当前预览样式导出');
  }catch(error){showToast(`PDF 导出失败：${error.message||'未知错误'}`)}
}

function currentDoc(){ return documents.find(d=>d.id===activeId) || documents[0]; }
function currentFilePath(){return typeof fileHandle==='string'&&fileHandle.length?fileHandle:null}
function compactFilePath(path){const parts=path.split('/').filter(Boolean);return parts.length>1?`${parts.at(-2)} / ${parts.at(-1)}`:path}
function updateFileLocation(){
  const path=currentFilePath(),button=$('#fileLocationButton');
  button.classList.toggle('unsaved',!path);button.title=path||'尚未保存到磁盘';button.setAttribute('aria-label',`文件位置：${path||'尚未保存到磁盘'}`);
  $('#fileLocationLabel').textContent=path?compactFilePath(path):'尚未保存到磁盘';
  $('#fullFilePath').textContent=path||'尚未保存到磁盘';
  $('#revealFile').disabled=!path;$('#copyFilePath').disabled=!path;
  if(hasNativeBridge)nativeInvoke('set_represented_path',{path:path||null}).catch(()=>{});
}
function persist(){
  const safeDocuments=documents.map(doc=>doc.id===activeId&&isDirty?{...doc,content:baselineContent,title:baselineTitle,updated:'已保存'}:doc);
  localStorage.setItem('mochi-documents',JSON.stringify(safeDocuments));localStorage.setItem('mochi-active',activeId);
}
function persistRecentPreferences(){localStorage.setItem('mochi-recent-preferences',JSON.stringify(recentPreferences))}

function setDirty(value){
  if(isDirty===value)return;
  isDirty=value;
  const state=$('#saveState');state.classList.toggle('dirty',value);state.lastChild.textContent=value?' 未保存':' 已保存';
  const footer=$('#manualSaveState');footer.classList.toggle('dirty',value);footer.lastChild.textContent=value?'有未保存的修改':'按 ⌘S 保存';
  if(hasNativeBridge)nativeInvoke('set_dirty',{dirty:value,title:titleInput.value||'未命名文档'}).catch(()=>{});
}

function updateWorkingCopy(){
  const doc=currentDoc();doc.content=editor.value;doc.title=titleInput.value||'未命名文档';
  const changed=doc.content!==baselineContent||doc.title!==baselineTitle;doc.updated=changed?'未保存':'已保存';
  renderList();setDirty(changed);
}

function renderList(){
  let visibleDocuments=documentFilter==='favorites'?documents.filter(doc=>doc.favorite):documents.filter(doc=>!doc.hiddenFromRecent);
  visibleDocuments=[...visibleDocuments].sort((a,b)=>recentPreferences.sort==='name'?(a.title||'').localeCompare(b.title||'','zh-CN'):(Number(b.lastEditedAt)||0)-(Number(a.lastEditedAt)||0));
  const totalVisible=visibleDocuments.length;
  if(documentFilter==='all'&&recentPreferences.limit!=='all')visibleDocuments=visibleDocuments.slice(0,recentPreferences.limit);
  const emptyTitle=documentFilter==='favorites'?'还没有收藏文档':'最近编辑已整理干净';
  const emptyHint=documentFilter==='favorites'?'点击文档标题旁的爱心即可收藏':'打开或新建文档后会显示在这里';
  $('#documentList').innerHTML = visibleDocuments.length?visibleDocuments.map(doc=>`<button class="doc-card ${doc.id===activeId?'active':''}" data-id="${doc.id}" title="右键可整理文档"><strong>${escapeHtml(doc.title||'未命名文档')}</strong><p>${escapeHtml(doc.content.replace(/[#>*`\-\[\]]/g,' ').replace(/\s+/g,' ').trim().slice(0,32))}</p><span class="doc-meta"><span>${doc.updated}</span>${doc.favorite?'<b>♥</b>':''}</span></button>`).join(''):`<div class="empty-documents"><span>♡</span><strong>${emptyTitle}</strong><small>${emptyHint}</small></div>`;
  $('#docCount').textContent=documents.filter(doc=>!doc.hiddenFromRecent).length;
  $('#favoriteCount').textContent=documents.filter(doc=>doc.favorite).length;
  $('#documentListTitle').textContent=documentFilter==='favorites'?'我的收藏':`最近编辑${totalVisible>visibleDocuments.length?` · ${visibleDocuments.length}/${totalVisible}`:''}`;
  document.querySelectorAll('.doc-card').forEach(btn=>{
    btn.addEventListener('click',()=>loadDoc(Number(btn.dataset.id)));
    btn.addEventListener('contextmenu',event=>openDocumentContextMenu(event,Number(btn.dataset.id)));
  });
}

function setDocumentFilter(filter){
  documentFilter=filter==='favorites'?'favorites':'all';
  document.querySelectorAll('[data-document-filter]').forEach(button=>button.classList.toggle('active',button.dataset.documentFilter===documentFilter));
  const recentButton=$('#recentMenuButton');recentButton.classList.toggle('invisible',documentFilter==='favorites');recentButton.setAttribute('aria-hidden',String(documentFilter==='favorites'));closeRecentMenu();closeDocumentContextMenu();
  renderList();
}

async function loadDoc(id,skipPrompt=false,markRecent=true){
  if(!skipPrompt&&id===activeId)return;
  if(!skipPrompt&&!(await resolveUnsaved()))return;
  const selectedCard=!skipPrompt?document.querySelector(`.doc-card[data-id="${id}"]`):null;
  activeId=id; const doc=currentDoc();if(markRecent){doc.hiddenFromRecent=false;doc.lastOpenedAt=Date.now()}editor.value=doc.content;titleInput.value=doc.title;fileHandle=doc.filePath||null;updateFileLocation();
  baselineContent=doc.content;baselineTitle=doc.title;setDirty(false);
  $('#favorite').classList.toggle('active',doc.favorite);$('#favorite').setAttribute('aria-pressed',String(doc.favorite)); updatePreview();
  if(selectedCard)document.querySelectorAll('.doc-card').forEach(card=>card.classList.toggle('active',card===selectedCard));
  else renderList();
  persist();
  $('#sidebar').classList.remove('open');
}

function updatePreview(){
  preview.innerHTML=renderMarkdown(editor.value);
  const chars=editor.value.replace(/\s/g,'').length, lines=editor.value.split('\n').length;
  $('#wordCount').textContent=`${chars} 字`;$('#lineCount').textContent=`${lines} 行`;$('#readingTime').textContent=`约 ${Math.max(1,Math.ceil(chars/450))} 分钟阅读`;
  if(syncEnabled)highlightSourceLine(lineFromCaret());
}

function jumpToSource(node){
  if(!syncEnabled||!node)return;
  const range=sourceLineRange(node),start=lineStartOffset(range.start),end=Math.max(start,lineStartOffset(range.end)+editor.value.split('\n')[range.end]?.length||start);
  editor.focus();editor.setSelectionRange(start,Math.min(editor.value.length,end));
  const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||22;
  editor.scrollTop=Math.max(0,range.start*lineHeight-editor.clientHeight*.35);
  updateCursor();highlightSourceLine(range.start);showToast(`已定位到第 ${range.start+1} 行`);
}

async function saveCurrent(forceSaveAs=false){
  const name=titleInput.value||'未命名文档';
  try{
    if(hasNativeBridge){
      const path=await nativeInvoke('save_markdown',{path:forceSaveAs?null:fileHandle,defaultName:name+'.md',content:editor.value});
      if(!path)return false;
      fileHandle=path;
    }else if(fileHandle&&!forceSaveAs){
      const writable=await fileHandle.createWritable();await writable.write(editor.value);await writable.close();
    }else{
      const blob=new Blob([editor.value],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.md';a.click();URL.revokeObjectURL(a.href);
    }
    const doc=currentDoc();doc.content=editor.value;doc.title=name;doc.updated='刚刚';if(isDirty||forceSaveAs)doc.lastEditedAt=Date.now();doc.hiddenFromRecent=false;if(typeof fileHandle==='string')doc.filePath=fileHandle;
    baselineContent=doc.content;baselineTitle=doc.title;setDirty(false);updateFileLocation();persist();renderList();showToast('文档已保存');return true;
  }catch(error){showToast('保存失败');return false}
}

function revertCurrent(){
  const doc=currentDoc();doc.content=baselineContent;doc.title=baselineTitle;doc.updated='已保存';editor.value=baselineContent;titleInput.value=baselineTitle;setDirty(false);
}

async function resolveUnsaved(){
  if(!isDirty)return true;
  let choice='cancel';
  if(hasNativeBridge)choice=await nativeInvoke('confirm_unsaved',{title:titleInput.value||'未命名文档'});
  else choice=window.confirm('当前文档尚未保存。现在保存吗？')?'save':'cancel';
  if(choice==='save')return await saveCurrent();
  if(choice==='discard'){revertCurrent();return true}
  return false;
}

async function newDocument(){
  if(!(await resolveUnsaved()))return;
  setDocumentFilter('all');const id=Date.now();documents.unshift({id,title:'未命名文档',content:'',updated:'新文档',favorite:false,lastOpenedAt:Date.now(),lastEditedAt:Date.now()});activeId=id;await loadDoc(id,true);titleInput.select();showToast('新文档已创建');
}

async function confirmAction(title,message,confirmLabel='继续'){
  if(hasNativeBridge){try{return Boolean(await nativeInvoke('confirm_action',{title,message,confirmLabel}))}catch(error){return false}}
  return window.confirm(`${title}\n\n${message}`);
}

function closeRecentMenu(){const menu=$('#recentMenu'),button=$('#recentMenuButton');menu.hidden=true;button.setAttribute('aria-expanded','false')}
function syncRecentMenu(){
  document.querySelectorAll('[data-recent-sort]').forEach(button=>button.querySelector('i').textContent=button.dataset.recentSort===recentPreferences.sort?'✓':'');
  document.querySelectorAll('[data-recent-limit]').forEach(button=>button.classList.toggle('active',String(recentPreferences.limit)===button.dataset.recentLimit));
}
function toggleRecentMenu(event){
  event.stopPropagation();const menu=$('#recentMenu'),willOpen=menu.hidden;closeDocumentContextMenu();
  menu.hidden=!willOpen;event.currentTarget.setAttribute('aria-expanded',String(willOpen));if(willOpen)syncRecentMenu();
}

function closeDocumentContextMenu(){const menu=$('#documentContextMenu');menu.hidden=true;contextDocumentId=null}
function openDocumentContextMenu(event,id){
  event.preventDefault();event.stopPropagation();closeRecentMenu();contextDocumentId=id;
  const doc=documents.find(item=>item.id===id);if(!doc)return;
  const menu=$('#documentContextMenu'),favorite=$('#contextFavorite');
  favorite.querySelector('span').textContent=doc.favorite?'♥':'♡';favorite.querySelector('b').textContent=doc.favorite?'取消收藏':'收藏文档';
  $('#contextReveal').disabled=!doc.filePath;
  menu.hidden=false;
  const width=190,height=145,padding=8;
  menu.style.left=`${Math.max(padding,Math.min(event.clientX,window.innerWidth-width-padding))}px`;
  menu.style.top=`${Math.max(padding,Math.min(event.clientY,window.innerHeight-height-padding))}px`;
}

function makeBlankDocument(){return {id:Date.now(),title:'未命名文档',content:'',updated:'新文档',favorite:false,lastOpenedAt:Date.now(),lastEditedAt:Date.now()}}
async function settleAfterRecordRemoval(removedActive){
  if(!documents.length)documents=[makeBlankDocument()];
  if(removedActive){activeId=[...documents].sort((a,b)=>(Number(b.lastEditedAt)||0)-(Number(a.lastEditedAt)||0))[0].id;await loadDoc(activeId,true)}
  else{persist();renderList()}
}

async function removeDocumentFromRecent(id){
  const doc=documents.find(item=>item.id===id);if(!doc)return;closeDocumentContextMenu();
  if(id===activeId&&isDirty&&!(await resolveUnsaved()))return;
  if(doc.favorite){doc.hiddenFromRecent=true;persist();renderList();showToast('已从最近编辑移除，收藏仍保留');return}
  if(!doc.filePath&&!(await confirmAction('移除未保存的文档？','这篇文档尚未保存到磁盘，移除后将无法恢复。','移除')))return;
  const removedActive=id===activeId;documents=documents.filter(item=>item.id!==id);await settleAfterRecordRemoval(removedActive);showToast(doc.filePath?'已移除记录，原文件仍在磁盘中':'文档已从 Mochi MD 移除');
}

async function clearRecentDocuments(){
  closeRecentMenu();const recent=documents.filter(doc=>!doc.hiddenFromRecent);if(!recent.length){showToast('最近编辑已经是空的');return}
  const diskRecords=recent.filter(doc=>doc.filePath&&!doc.favorite),favoriteRecords=recent.filter(doc=>doc.favorite),drafts=recent.filter(doc=>!doc.filePath&&!doc.favorite);
  if(!(await confirmAction('清空最近编辑记录？','磁盘中的原始文件不会被删除；收藏和未保存到磁盘的草稿会保留。','清空记录')))return;
  const removingIds=new Set(diskRecords.map(doc=>doc.id));
  if(removingIds.has(activeId)&&isDirty&&!(await resolveUnsaved()))return;
  favoriteRecords.forEach(doc=>doc.hiddenFromRecent=true);
  const removedActive=removingIds.has(activeId);documents=documents.filter(doc=>!removingIds.has(doc.id));await settleAfterRecordRemoval(removedActive);
  const cleared=diskRecords.length+favoriteRecords.length;
  showToast(drafts.length?`已清理 ${cleared} 条记录，保留 ${drafts.length} 篇本地草稿`:`已清理 ${cleared} 条最近记录`);
}

async function cleanMissingDocuments(){
  closeRecentMenu();const candidates=documents.filter(doc=>doc.filePath);if(!candidates.length){showToast('没有需要检查的本地文件');return}
  if(!hasNativeBridge){showToast('桌面版才能检查文件位置');return}
  try{
    let existing=await nativeInvoke('existing_paths',{paths:candidates.map(doc=>doc.filePath)});
    let existingSet=new Set(existing),missing=candidates.filter(doc=>!existingSet.has(doc.filePath));
    if(!missing.length){showToast('所有本地文件都可以找到');return}
    if(!(await confirmAction('清理失效文件？',`将从 Mochi MD 移除 ${missing.length} 条已找不到原文件的记录。`,'清理')))return;
    if(missing.some(doc=>doc.id===activeId)&&isDirty){if(!(await resolveUnsaved()))return;existing=await nativeInvoke('existing_paths',{paths:missing.map(doc=>doc.filePath)});existingSet=new Set(existing);missing=missing.filter(doc=>!existingSet.has(doc.filePath))}
    const ids=new Set(missing.map(doc=>doc.id)),removedActive=ids.has(activeId);documents=documents.filter(doc=>!ids.has(doc.id));await settleAfterRecordRemoval(removedActive);showToast(`已清理 ${missing.length} 条失效记录`);
  }catch(error){showToast('暂时无法检查文件位置')}
}

function showToast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}

function applyAvatar(dataUrl){
  if(!dataUrl)return;const img=$('#avatarImage');img.src=dataUrl;img.hidden=false;$('#avatarFallback').hidden=true;localStorage.setItem('mochi-avatar',dataUrl);
}

const defaultProfileText={name:'我的小书桌',subtitle:'只属于你的文字空间'};
let profileText=(()=>{try{return {...defaultProfileText,...JSON.parse(localStorage.getItem('mochi-profile-text')||'{}')}}catch(error){return {...defaultProfileText}}})();
function applyProfileText(){
  $('#deskName').textContent=profileText.name||defaultProfileText.name;
  $('#deskSubtitle').textContent=profileText.subtitle||defaultProfileText.subtitle;
  $('#profileCopy').title=`${profileText.name} · ${profileText.subtitle}\n点击自定义`;
}
function closeProfilePopover(){const popover=$('#profilePopover'),button=$('#profileCopy');popover.hidden=true;button.setAttribute('aria-expanded','false')}
function openProfilePopover(event){
  event.stopPropagation();const popover=$('#profilePopover'),willOpen=popover.hidden;
  closeRecentMenu();closeDocumentContextMenu();popover.hidden=!willOpen;event.currentTarget.setAttribute('aria-expanded',String(willOpen));
  if(willOpen){$('#deskNameInput').value=profileText.name;$('#deskSubtitleInput').value=profileText.subtitle;setTimeout(()=>$('#deskNameInput').focus(),0)}
}
function saveProfileText(){
  profileText={name:$('#deskNameInput').value.trim()||defaultProfileText.name,subtitle:$('#deskSubtitleInput').value.trim()||defaultProfileText.subtitle};
  localStorage.setItem('mochi-profile-text',JSON.stringify(profileText));applyProfileText();closeProfilePopover();showToast('书桌文字已更新');
}

function squareAvatarFromFile(file){
  return new Promise((resolve,reject)=>{const image=new Image();const url=URL.createObjectURL(file);image.onload=()=>{const size=Math.min(image.naturalWidth,image.naturalHeight);const sx=(image.naturalWidth-size)/2,sy=(image.naturalHeight-size)/2;const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').drawImage(image,sx,sy,size,size,0,0,256,256);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/png'))};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('invalid image'))};image.src=url});
}

const savedAvatar=localStorage.getItem('mochi-avatar');if(savedAvatar)applyAvatar(savedAvatar);
applyProfileText();
$('#avatarButton').addEventListener('click',async()=>{if(hasNativeBridge){try{const dataUrl=await nativeInvoke('choose_avatar',{});if(dataUrl){applyAvatar(dataUrl);showToast('头像已更新')}}catch(e){showToast('无法读取这张图片')}return}$('#avatarInput').click()});
$('#avatarInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{applyAvatar(await squareAvatarFromFile(file));showToast('头像已更新')}catch(error){showToast('请选择有效的图片')}});
$('#profileCopy').addEventListener('click',openProfilePopover);
$('#profilePopover').addEventListener('click',event=>event.stopPropagation());
$('#cancelProfileText').addEventListener('click',closeProfilePopover);
$('#saveProfileText').addEventListener('click',saveProfileText);
$('#resetProfileText').addEventListener('click',()=>{$('#deskNameInput').value=defaultProfileText.name;$('#deskSubtitleInput').value=defaultProfileText.subtitle;$('#deskNameInput').focus()});
[$('#deskNameInput'),$('#deskSubtitleInput')].forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveProfileText()}}));

editor.addEventListener('input',()=>{updatePreview();updateWorkingCopy();if(syncEnabled)highlightSourceLine(lineFromCaret())});
editor.addEventListener('click',()=>{updateCursor();highlightSourceLine(lineFromCaret())});
editor.addEventListener('keyup',()=>{updateCursor();highlightSourceLine(lineFromCaret())});
editor.addEventListener('scroll',()=>{if(syncEnabled){cancelAnimationFrame(syncFrame);syncFrame=requestAnimationFrame(syncPreviewToEditor)}});
preview.addEventListener('click',event=>{if(event.target.closest('.task-checkbox'))return;const node=event.target.closest('[data-source-start]');if(node)jumpToSource(node)});
preview.addEventListener('change',event=>{const checkbox=event.target.closest('.task-checkbox');if(!checkbox)return;const line=Number(checkbox.dataset.sourceLine),lines=editor.value.split('\n');if(!Number.isInteger(line)||!lines[line])return;lines[line]=lines[line].replace(/^(\s*[-*]\s+)\[([ xX])\](\s+)/,`$1[${checkbox.checked?'x':' '}]$3`);const caret=editor.selectionStart;editor.value=lines.join('\n');updatePreview();updateWorkingCopy();editor.focus();editor.setSelectionRange(Math.min(caret,editor.value.length),Math.min(caret,editor.value.length));if(syncEnabled)highlightSourceLine(line)});
preview.addEventListener('mouseover',event=>{if(!syncEnabled)return;const node=event.target.closest('[data-source-start]');if(node)setSyncHighlight(node,true)});
preview.addEventListener('mouseleave',()=>{if(syncEnabled&&syncTarget)syncTarget.classList.remove('sync-hover')});
preview.addEventListener('scroll',()=>{if(syncEnabled){cancelAnimationFrame(syncFrame);syncFrame=requestAnimationFrame(syncEditorToPreview)}});
syncButton.addEventListener('click',()=>setSyncEnabled(!syncEnabled));
function updateCursor(){const before=editor.value.slice(0,editor.selectionStart).split('\n');$('#cursorPosition').textContent=`第 ${before.length} 行，第 ${before.at(-1).length+1} 列`}
titleInput.addEventListener('input',updateWorkingCopy);
$('#newDoc').addEventListener('click',newDocument);
$('#favorite').addEventListener('click',()=>{const doc=currentDoc();doc.favorite=!doc.favorite;const button=$('#favorite');button.classList.toggle('active',doc.favorite);button.setAttribute('aria-pressed',String(doc.favorite));persist();renderList()});
document.querySelectorAll('[data-document-filter]').forEach(button=>button.addEventListener('click',()=>setDocumentFilter(button.dataset.documentFilter)));
$('#recentMenuButton').addEventListener('click',toggleRecentMenu);
$('#recentMenu').addEventListener('click',event=>event.stopPropagation());
document.querySelectorAll('[data-recent-sort]').forEach(button=>button.addEventListener('click',()=>{recentPreferences.sort=button.dataset.recentSort;persistRecentPreferences();syncRecentMenu();renderList()}));
document.querySelectorAll('[data-recent-limit]').forEach(button=>button.addEventListener('click',()=>{recentPreferences.limit=button.dataset.recentLimit==='all'?'all':Number(button.dataset.recentLimit);persistRecentPreferences();syncRecentMenu();renderList()}));
$('#cleanMissingDocuments').addEventListener('click',cleanMissingDocuments);
$('#clearRecentDocuments').addEventListener('click',clearRecentDocuments);
$('#documentContextMenu').addEventListener('click',event=>event.stopPropagation());
$('#contextFavorite').addEventListener('click',()=>{const doc=documents.find(item=>item.id===contextDocumentId);if(!doc)return;doc.favorite=!doc.favorite;if(!doc.favorite)doc.hiddenFromRecent=false;if(doc.id===activeId)$('#favorite').classList.toggle('active',doc.favorite);closeDocumentContextMenu();persist();renderList();showToast(doc.favorite?'已加入我的收藏':'已取消收藏')});
$('#contextReveal').addEventListener('click',async()=>{const doc=documents.find(item=>item.id===contextDocumentId);if(!doc?.filePath)return;closeDocumentContextMenu();try{await nativeInvoke('reveal_in_finder',{path:doc.filePath})}catch(error){showToast('无法在访达中显示')}});
$('#contextRemove').addEventListener('click',()=>removeDocumentFromRecent(contextDocumentId));
document.querySelectorAll('.view-switcher button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.view-switcher button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');editorArea.className=`editor-area mode-${btn.dataset.mode}`}));
readerButton.addEventListener('click',()=>setReaderMode(!appShell.classList.contains('reader-mode')));
$('#collapseSidebar').addEventListener('click',()=>{appShell.classList.add('sidebar-collapsed');showToast('侧边栏已收起')});
$('#openSidebar').addEventListener('click',()=>{appShell.classList.remove('sidebar-collapsed');$('#sidebar').classList.add('open')});
$('#closeSidebar').addEventListener('click',()=>$('#sidebar').classList.remove('open'));

splitDivider.addEventListener('pointerdown',event=>{
  if(!editorArea.classList.contains('mode-split'))return;
  splitDivider.classList.add('dragging');splitDivider.setPointerCapture(event.pointerId);event.preventDefault();
});
splitDivider.addEventListener('pointermove',event=>{
  if(!splitDivider.hasPointerCapture(event.pointerId))return;
  const rect=editorArea.getBoundingClientRect();
  applySplitRatio((event.clientX-rect.left)/rect.width*100);
});
function endSplitDrag(event){
  if(splitDivider.hasPointerCapture(event.pointerId))splitDivider.releasePointerCapture(event.pointerId);
  splitDivider.classList.remove('dragging');
}
splitDivider.addEventListener('pointerup',endSplitDrag);splitDivider.addEventListener('pointercancel',endSplitDrag);
splitDivider.addEventListener('keydown',event=>{
  if(!editorArea.classList.contains('mode-split'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    event.preventDefault();applySplitRatio(splitRatio+(event.key==='ArrowRight'?2:-2));
  }
  if(event.key==='Home'){event.preventDefault();applySplitRatio(25)}
  if(event.key==='End'){event.preventDefault();applySplitRatio(75)}
});
document.addEventListener('wheel',event=>{
  if(!appShell.classList.contains('reader-mode')||!event.metaKey)return;
  event.preventDefault();
  const current=Number(getComputedStyle(appShell).getPropertyValue('--reader-scale'))||1;
  setReaderScale(current+(event.deltaY<0?-.05:.05));
},{passive:false});

$('#saveButton').addEventListener('click',()=>saveCurrent());
function closeExportPopover(){const popover=$('#exportPopover'),button=$('#exportButton');popover.hidden=true;button.setAttribute('aria-expanded','false')}
function toggleExportPopover(event){event.stopPropagation();const popover=$('#exportPopover'),willOpen=popover.hidden;closeFilePopover();popover.hidden=!willOpen;event.currentTarget.setAttribute('aria-expanded',String(willOpen))}
$('#exportButton').addEventListener('click',toggleExportPopover);
$('#exportPopover').addEventListener('click',event=>event.stopPropagation());
$('#toolbarExportPdf').addEventListener('click',exportPdf);
$('#toolbarSaveAs').addEventListener('click',()=>{closeExportPopover();saveCurrent(true)});
function closeFilePopover(){$('#filePopover').hidden=true;const button=$('#fileLocationButton');button.classList.remove('open');button.setAttribute('aria-expanded','false')}
$('#fileLocationButton').addEventListener('click',event=>{event.stopPropagation();const popover=$('#filePopover');popover.hidden=!popover.hidden;event.currentTarget.classList.toggle('open',!popover.hidden);event.currentTarget.setAttribute('aria-expanded',String(!popover.hidden))});
$('#filePopover').addEventListener('click',event=>event.stopPropagation());
$('#revealFile').addEventListener('click',async()=>{const path=currentFilePath();if(!path)return;try{await nativeInvoke('reveal_in_finder',{path});closeFilePopover()}catch(error){showToast('无法在访达中显示')}});
$('#copyFilePath').addEventListener('click',async()=>{const path=currentFilePath();if(!path)return;try{if(hasNativeBridge)await nativeInvoke('copy_path',{path});else await navigator.clipboard.writeText(path);showToast('文件路径已复制');closeFilePopover()}catch(error){showToast('无法复制路径')}});
$('#saveAsFile').addEventListener('click',()=>{closeFilePopover();saveCurrent(true)});
$('#exportPdf').addEventListener('click',exportPdf);
$('#openFile').addEventListener('click',async()=>{if(!(await resolveUnsaved()))return;if(hasNativeBridge){try{const opened=await nativeInvoke('open_markdown',{});if(opened){fileHandle=opened.path;await importContent(opened.name,opened.content,opened.path);showToast('本地文档已打开')}return}catch(e){showToast('无法打开文档');return}}if('showOpenFilePicker'in window){try{[fileHandle]=await window.showOpenFilePicker({types:[{description:'Markdown',accept:{'text/markdown':['.md','.markdown'],'text/plain':['.txt']}}]});const file=await fileHandle.getFile();importFile(file);return}catch(e){if(e.name==='AbortError')return}}$('#fileInput').click()});
$('#fileInput').addEventListener('change',e=>{if(e.target.files[0])importFile(e.target.files[0])});
async function importFile(file){const content=await file.text();importContent(file.name,content);showToast('本地文档已打开')}
async function importContent(name,content,path=null){
  setDocumentFilter('all');
  const nativePath=path||(typeof fileHandle==='string'?fileHandle:null);
  const existing=nativePath&&documents.find(doc=>doc.filePath===nativePath);
  if(existing){existing.title=name.replace(/\.(md|markdown|txt)$/i,'');existing.content=content;existing.updated='刚刚';existing.lastOpenedAt=Date.now();existing.hiddenFromRecent=false;activeId=existing.id}
  else{const id=Date.now()+Math.floor(Math.random()*1000);documents.unshift({id,title:name.replace(/\.(md|markdown|txt)$/i,''),content,updated:'刚刚',favorite:false,filePath:nativePath||undefined,lastOpenedAt:Date.now(),lastEditedAt:Date.now()});activeId=id}
  fileHandle=nativePath||fileHandle;await loadDoc(activeId,true);persist();
}

window.mochiOpenExternalFiles=async payloads=>{
  if(!Array.isArray(payloads)||!payloads.length)return false;
  let opened=0;
  for(const payload of payloads){
    if(!(await resolveUnsaved()))break;
    fileHandle=payload.path||null;
    await importContent(payload.name,payload.content,payload.path||null);
    opened++;
  }
  if(opened)showToast(opened>1?`已打开 ${opened} 个文档`:'本地文档已打开');
  return opened===payloads.length;
};

window.mochiSetDropActive=active=>document.body.classList.toggle('file-drop-active',Boolean(active));
const dropList=$('#documentList');
function containsFiles(event){return Array.from(event.dataTransfer?.types||[]).includes('Files')}
dropList.addEventListener('dragenter',event=>{if(!containsFiles(event))return;event.preventDefault();dropList.classList.add('drop-active')});
dropList.addEventListener('dragover',event=>{if(!containsFiles(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';dropList.classList.add('drop-active')});
dropList.addEventListener('dragleave',event=>{if(!dropList.contains(event.relatedTarget))dropList.classList.remove('drop-active')});
dropList.addEventListener('drop',async event=>{
  if(!containsFiles(event))return;event.preventDefault();dropList.classList.remove('drop-active');
  const files=Array.from(event.dataTransfer.files||[]).filter(file=>/\.(md|markdown|txt)$/i.test(file.name));
  if(!files.length){showToast('请拖入 Markdown 或文本文件');return}
  let opened=0;
  for(const file of files){if(!(await resolveUnsaved()))break;const droppedPath=typeof file.path==='string'&&file.path?file.path:null;fileHandle=droppedPath;await importContent(file.name,await file.text(),droppedPath);opened++}
  if(opened)showToast(opened>1?`已打开 ${opened} 个文档`:'本地文档已打开');
});
document.addEventListener('dragover',event=>{if(containsFiles(event))event.preventDefault()});
document.addEventListener('drop',event=>{if(containsFiles(event)&&!event.target.closest('#documentList'))event.preventDefault()});

const themeGrid=$('#themeGrid'),themeManager=$('#themeManager'),themeEditor=$('#themeEditor');
function allThemes(){return [...themes,...customThemes.map(theme=>({id:theme.id,name:theme.name,colors:[theme.vars['--accent'],theme.vars['--accent-soft'],theme.vars['--bg']]}))]}
function persistCustomThemes(){localStorage.setItem('mochi-custom-themes',JSON.stringify(customThemes))}
function renderThemeGrid(){
  themeGrid.innerHTML=allThemes().map(t=>`<button class="theme-option" data-theme="${escapeHtml(t.id)}"><span class="theme-swatch">${t.colors.map(c=>`<i style="background:${escapeHtml(c)}"></i>`).join('')}</span><span>${escapeHtml(t.name)}</span></button>`).join('');
  document.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.theme===document.documentElement.dataset.theme));
}
function clearCustomVariables(){customVariableNames.forEach(name=>document.documentElement.style.removeProperty(name))}
function setTheme(id){
  const migrated={chocolate:'butter-sea',strawberry:'doodle',pixel:'ballpoint'}[id]||id;
  const theme=allThemes().find(t=>t.id===migrated)||themes.find(t=>t.id==='lavender');
  clearCustomVariables();
  if(theme.id.startsWith('custom-')){
    const custom=customThemes.find(item=>item.id===theme.id);
    if(custom)Object.entries(custom.vars).forEach(([name,value])=>document.documentElement.style.setProperty(name,value));
  }
  document.documentElement.dataset.theme=theme.id;
  localStorage.setItem('mochi-theme',theme.id);
  $('.theme-launcher strong').textContent=theme.name;
  renderThemeGrid();
}
function openThemeEditor(theme=null){
  const source=theme?theme.vars:customThemeDefaults;
  $('#themeEditorTitle').textContent=theme?'编辑主题':'新建主题';
  $('#customThemeName').value=theme?theme.name:customThemeDefaults.name;
  Object.entries({bg:'--bg',panel:'--panel',sidebar:'--sidebar',text:'--text',muted:'--muted',accent:'--accent',accentSoft:'--accent-soft',paper:'--paper',code:'--code'}).forEach(([id,name])=>{$(`#customTheme${id[0].toUpperCase()+id.slice(1)}`).value=source[name]||customThemeDefaults[id]});
  themeEditor.dataset.editingId=theme?.id||'';themeManager.hidden=true;themeEditor.hidden=false;setTimeout(()=>$('#customThemeName').focus(),0);
}
function closeThemeEditor(){themeEditor.hidden=true;themeEditor.dataset.editingId=''}
function renderCustomThemeManager(){
  $('#customThemeList').innerHTML=customThemes.length?customThemes.map(theme=>`<div class="custom-theme-row"><span class="theme-swatch">${[theme.vars['--accent'],theme.vars['--accent-soft'],theme.vars['--bg']].map(c=>`<i style="background:${escapeHtml(c)}"></i>`).join('')}</span><strong>${escapeHtml(theme.name)}</strong><button data-edit-custom="${escapeHtml(theme.id)}">编辑</button><button class="danger-button" data-delete-custom="${escapeHtml(theme.id)}">删除</button></div>`).join(''):'<p class="theme-manager-empty">还没有自定义主题</p>';
}
let activeNativeColorInput=null;
window.mochiSetNativeColor=function(hex){if(!activeNativeColorInput)return;activeNativeColorInput.value=hex;activeNativeColorInput.dispatchEvent(new Event('input',{bubbles:true}));activeNativeColorInput.dispatchEvent(new Event('change',{bubbles:true}))};
document.querySelectorAll('.theme-editor input[type="color"]').forEach(input=>input.addEventListener('pointerdown',event=>{
  if(!hasNativeBridge)return;
  event.preventDefault();activeNativeColorInput=input;
  nativeInvoke('choose_color',{color:input.value,screenX:event.screenX,screenY:event.screenY}).catch(()=>{});
}));
document.querySelectorAll('.theme-editor input[type="color"]').forEach(input=>input.addEventListener('click',event=>{
  if(!hasNativeBridge)return;
  event.preventDefault();event.stopPropagation();
}));
renderThemeGrid();
setTheme(localStorage.getItem('mochi-theme')||'lavender');
$('#themeLauncher').addEventListener('click',e=>{e.stopPropagation();$('#themePopover').hidden=!$('#themePopover').hidden});
themeGrid.addEventListener('click',e=>{const btn=e.target.closest('.theme-option');if(btn){setTheme(btn.dataset.theme);showToast(`已换成${allThemes().find(t=>t.id===btn.dataset.theme).name}主题`)}});
$('#newThemeButton').addEventListener('click',()=>openThemeEditor());
$('#manageThemesButton').addEventListener('click',()=>{renderCustomThemeManager();themeEditor.hidden=true;themeManager.hidden=false});
$('#closeThemeManager').addEventListener('click',()=>{themeManager.hidden=true});
$('#cancelThemeEditor').addEventListener('click',closeThemeEditor);
$('#saveCustomTheme').addEventListener('click',()=>{
  const name=$('#customThemeName').value.trim();if(!name){showToast('请先填写主题名称');$('#customThemeName').focus();return}
  const values={};Object.entries({bg:'--bg',panel:'--panel',sidebar:'--sidebar',text:'--text',muted:'--muted',accent:'--accent',accentSoft:'--accent-soft',paper:'--paper',code:'--code'}).forEach(([id,varName])=>values[varName]=$(`#customTheme${id[0].toUpperCase()+id.slice(1)}`).value);
  values['--shell']=values['--panel'];values['--accent-ink']=values['--text'];values['--line']='color-mix(in srgb,var(--text) 18%,transparent)';values['--shadow']='0 24px 60px color-mix(in srgb,var(--text) 16%,transparent)';
  const editingId=themeEditor.dataset.editingId;const id=editingId||`custom-${Date.now()}`;const record={id,name,vars:values};const index=customThemes.findIndex(theme=>theme.id===id);if(index>=0)customThemes[index]=record;else customThemes.push(record);persistCustomThemes();renderThemeGrid();setTheme(id);closeThemeEditor();$('#themePopover').hidden=false;showToast(editingId?'主题已更新':'主题已保存');
});
$('#customThemeList').addEventListener('click',async event=>{const edit=event.target.closest('[data-edit-custom]'),remove=event.target.closest('[data-delete-custom]');if(edit){openThemeEditor(customThemes.find(theme=>theme.id===edit.dataset.editCustom));return}if(remove){const index=customThemes.findIndex(theme=>theme.id===remove.dataset.deleteCustom);if(index<0)return;const name=customThemes[index].name;let confirmed=false;if(hasNativeBridge){try{confirmed=await nativeInvoke('confirm_action',{title:'删除自定义主题？',message:`主题“${name}”删除后无法恢复。`,confirmLabel:'删除'})}catch(error){return}}else confirmed=window.confirm(`删除自定义主题“${name}”？`);if(!confirmed)return;const id=customThemes[index].id;customThemes.splice(index,1);persistCustomThemes();renderThemeGrid();if(document.documentElement.dataset.theme===id)setTheme('butter-sea');renderCustomThemeManager();showToast('主题已删除')}});
document.addEventListener('click',e=>{if(!e.target.closest('#themePopover')&&!e.target.closest('#themeLauncher'))$('#themePopover').hidden=true;if(!e.target.closest('#filePopover')&&!e.target.closest('#fileLocationButton'))closeFilePopover();if(!e.target.closest('#exportPopover')&&!e.target.closest('#exportButton'))closeExportPopover();if(!e.target.closest('#recentMenu')&&!e.target.closest('#recentMenuButton'))closeRecentMenu();if(!e.target.closest('#documentContextMenu'))closeDocumentContextMenu();if(!e.target.closest('#profilePopover')&&!e.target.closest('#profileCopy'))closeProfilePopover()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(appShell.classList.contains('reader-mode'))setReaderMode(false);closeRecentMenu();closeDocumentContextMenu();closeProfilePopover();closeExportPopover()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDocument()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCurrent(e.shiftKey)}if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();exportPdf()}if(e.key==='Tab'&&document.activeElement===editor){e.preventDefault();const s=editor.selectionStart;editor.setRangeText('  ',s,editor.selectionEnd,'end');updatePreview();updateWorkingCopy()}});

window.mochiSaveBeforeClose=async()=>{if(await saveCurrent())await nativeInvoke('force_close',{});else await nativeInvoke('cancel_quit',{})};

if(window.matchMedia('(max-width: 520px)').matches){document.querySelectorAll('.view-switcher button').forEach(b=>b.classList.toggle('active',b.dataset.mode==='preview'));editorArea.className='editor-area mode-preview'}
loadDoc(activeId,true,false);
