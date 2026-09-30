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
  { id:'chocolate', name:'巧克力', colors:['#5f3929','#c99168','#f7eddf'] },
  { id:'strawberry', name:'草莓奶油', colors:['#d85e7b','#f4b8c8','#fff4f6'] },
  { id:'pixel', name:'像素森林', colors:['#294b32','#8daa76','#f3efd4'] },
  { id:'lavender', name:'淡紫莓果', colors:['#66519c','#bca9e8','#f4f1fb'] },
  { id:'minimal', name:'极简 Ins', colors:['#171715','#aaa9a2','#fbfbf8'] },
  { id:'coder', name:'程序员', colors:['#7bdcb5','#35425a','#171b23'] }
];

let documents = JSON.parse(localStorage.getItem('mochi-documents') || 'null') || [
  { id:1,title:'关于慢慢生活的练习',content:sample,updated:'刚刚',favorite:true },
  { id:2,title:'八月阅读清单',content:'# 八月阅读清单\n\n- 《山茶文具店》\n- 《献给阿尔吉侬的花束》\n- 《禅与摩托车维修艺术》',updated:'昨天',favorite:false },
  { id:3,title:'周末去哪里散步',content:'# 周末去哪里散步\n\n想去有树、有风，也能喝到好咖啡的地方。',updated:'3 天前',favorite:false }
];
const migrationTime=Date.now();
documents=documents.map((doc,index)=>({...doc,lastOpenedAt:Number(doc.lastOpenedAt)||migrationTime-index}));
if(!documents.length)documents=[{id:Date.now(),title:'未命名文档',content:'',updated:'新文档',favorite:false,lastOpenedAt:Date.now()}];
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

function escapeHtml(text='') {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

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
  return { html: `${html}</table>`, next: end };
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  let html = '', inCode = false, inList = false, inQuote = false;
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    if (line.startsWith('```')) { if(inList){html+='</ul>';inList=false} html += inCode ? '</code></pre>' : '<pre><code>'; inCode=!inCode; continue; }
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
    const heading=line.match(/^(#{1,3})\s+(.+)/); if(heading){if(inList){html+='</ul>';inList=false}const n=heading[1].length;html+=`<h${n}>${inline(heading[2])}</h${n}>`;continue}
    if (line.startsWith('> ')) { if(!inQuote){html+='<blockquote>';inQuote=true}html+=`<p>${inline(line.slice(2))}</p>`;continue; } else if(inQuote){html+='</blockquote>';inQuote=false}
    const item=line.match(/^[-*]\s+(.+)/); if(item){if(!inList){html+='<ul>';inList=true}const task=item[1].match(/^\[([ xX])\]\s+(.+)/);html+=task?`<li><input type="checkbox" disabled ${task[1].toLowerCase()==='x'?'checked':''}> ${inline(task[2])}</li>`:`<li>${inline(item[1])}</li>`;continue}else if(inList){html+='</ul>';inList=false}
    if (!line.trim()) continue;
    html += `<p${html===''?' class="lead"':''}>${inline(line)}</p>`;
  }
  if(inList)html+='</ul>'; if(inQuote)html+='</blockquote>'; if(inCode)html+='</code></pre>';
  return html;
}

function buildPdfExportHtml(){
  const theme=document.documentElement.dataset.theme||'lavender';
  const title=titleInput.value.trim()||'未命名文档';
  return `<!doctype html>
<html lang="zh-CN" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--text:#302d3b;--muted:#8a8597;--line:rgba(71,61,94,.14);--accent:#8b72c7;--accent-soft:#e8e0f8;--accent-ink:#66519c;--paper:#fffefe;--code:#f3eff9;--serif:"Songti SC","Noto Serif CJK SC",Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;--mono:"SFMono-Regular",Menlo,monospace}
html[data-theme="chocolate"]{--text:#3e2b22;--muted:#957d70;--line:rgba(83,54,38,.16);--accent:#9a6246;--accent-soft:#ead7c5;--accent-ink:#75442d;--paper:#fffaf2;--code:#f0e3d6}
html[data-theme="strawberry"]{--text:#482e35;--muted:#a17e87;--line:rgba(121,62,78,.14);--accent:#df6b87;--accent-soft:#f8dbe3;--accent-ink:#ae4962;--paper:#fffefe;--code:#faeaf0}
html[data-theme="pixel"]{--text:#26342b;--muted:#67766b;--line:rgba(32,47,37,.24);--accent:#4f7757;--accent-soft:#dce5c9;--accent-ink:#294b32;--paper:#fffbe0;--code:#e5ebd5}
html[data-theme="minimal"]{--text:#1c1c1a;--muted:#92928c;--line:rgba(0,0,0,.1);--accent:#171715;--accent-soft:#e8e8e3;--accent-ink:#111;--paper:#fff;--code:#f2f2ef}
html[data-theme="coder"]{--text:#d9e0ea;--muted:#8e9bad;--line:rgba(201,214,232,.12);--accent:#7bdcb5;--accent-soft:#203b35;--accent-ink:#89e8c1;--paper:#191e27;--code:#11161d}
*{box-sizing:border-box}html,body{margin:0;width:794px;height:auto;background:var(--paper);color:var(--text)}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}#pdfSource .markdown-body{padding:72px 66px 80px}.markdown-body>*{max-width:none;margin-left:auto;margin-right:auto}.markdown-body h1,.markdown-body h2,.markdown-body h3{font-family:var(--serif);line-height:1.3;color:var(--text);break-after:avoid-page}.markdown-body h1{font-size:28pt;margin:0 0 16pt;letter-spacing:-.03em}.markdown-body h2{font-size:18pt;margin:30pt 0 11pt}.markdown-body h3{font-size:14pt;margin:21pt 0 8pt}.markdown-body p,.markdown-body li{font-family:var(--serif);font-size:11.5pt;line-height:1.9;color:var(--text)}.markdown-body .lead{font-size:12.5pt;color:var(--muted);margin-bottom:25pt}.markdown-body hr{border:0;border-top:1px solid var(--line);margin:27pt auto}.markdown-body blockquote{display:block;width:100%;margin:22pt 0;padding:14pt 17pt;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0;break-inside:avoid-page}.markdown-body blockquote p{margin:0;color:var(--accent-ink)}.markdown-body code{font-family:var(--mono);font-size:.86em;background:var(--code);padding:2px 5px;border-radius:4px;color:var(--accent-ink)}.markdown-body pre{background:var(--code);padding:16pt;border-radius:9px;overflow-wrap:anywhere;white-space:pre-wrap;break-inside:avoid-page}.markdown-body pre code{padding:0;background:none;color:var(--text);line-height:1.6}.markdown-body a{color:var(--accent-ink);text-decoration-color:var(--accent);text-underline-offset:3px}.markdown-body ul{padding-left:20pt}.markdown-body li::marker{color:var(--accent)}.markdown-body input[type=checkbox]{accent-color:var(--accent)}.markdown-body img{max-width:100%;height:auto;border-radius:10px;break-inside:avoid-page}.markdown-body table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:10pt;break-inside:avoid-page}.markdown-body th,.markdown-body td{border:1px solid var(--line);padding:8pt;text-align:left}.markdown-body th{background:var(--accent-soft)}html[data-theme="pixel"] *{border-radius:2px!important}html[data-theme="pixel"] h1,html[data-theme="pixel"] h2{font-family:var(--mono);text-transform:uppercase}html[data-theme="coder"] .markdown-body,html[data-theme="coder"] .markdown-body p,html[data-theme="coder"] .markdown-body li{font-family:var(--mono)}
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
  visibleDocuments=[...visibleDocuments].sort((a,b)=>recentPreferences.sort==='name'?(a.title||'').localeCompare(b.title||'','zh-CN'):(Number(b.lastOpenedAt)||0)-(Number(a.lastOpenedAt)||0));
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
  activeId=id; const doc=currentDoc();if(markRecent){doc.hiddenFromRecent=false;doc.lastOpenedAt=Date.now()}editor.value=doc.content;titleInput.value=doc.title;fileHandle=doc.filePath||null;updateFileLocation();
  baselineContent=doc.content;baselineTitle=doc.title;setDirty(false);
  $('#favorite').classList.toggle('active',doc.favorite); updatePreview();renderList();persist();
  $('#sidebar').classList.remove('open');
}

function updatePreview(){
  preview.innerHTML=renderMarkdown(editor.value);
  const chars=editor.value.replace(/\s/g,'').length, lines=editor.value.split('\n').length;
  $('#wordCount').textContent=`${chars} 字`;$('#lineCount').textContent=`${lines} 行`;$('#readingTime').textContent=`约 ${Math.max(1,Math.ceil(chars/450))} 分钟阅读`;
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
    const doc=currentDoc();doc.content=editor.value;doc.title=name;doc.updated='刚刚';doc.lastOpenedAt=Date.now();doc.hiddenFromRecent=false;if(typeof fileHandle==='string')doc.filePath=fileHandle;
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
  setDocumentFilter('all');const id=Date.now();documents.unshift({id,title:'未命名文档',content:'',updated:'新文档',favorite:false,lastOpenedAt:Date.now()});activeId=id;await loadDoc(id,true);titleInput.select();showToast('新文档已创建');
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

function makeBlankDocument(){return {id:Date.now(),title:'未命名文档',content:'',updated:'新文档',favorite:false,lastOpenedAt:Date.now()}}
async function settleAfterRecordRemoval(removedActive){
  if(!documents.length)documents=[makeBlankDocument()];
  if(removedActive){activeId=[...documents].sort((a,b)=>(Number(b.lastOpenedAt)||0)-(Number(a.lastOpenedAt)||0))[0].id;await loadDoc(activeId,true)}
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

editor.addEventListener('input',()=>{updatePreview();updateWorkingCopy()});
editor.addEventListener('click',updateCursor);editor.addEventListener('keyup',updateCursor);
function updateCursor(){const before=editor.value.slice(0,editor.selectionStart).split('\n');$('#cursorPosition').textContent=`第 ${before.length} 行，第 ${before.at(-1).length+1} 列`}
titleInput.addEventListener('input',updateWorkingCopy);
$('#newDoc').addEventListener('click',newDocument);
$('#favorite').addEventListener('click',()=>{const doc=currentDoc();doc.favorite=!doc.favorite;$('#favorite').classList.toggle('active',doc.favorite);persist();renderList()});
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
$('#focusButton').addEventListener('click',()=>{$('.app-shell').classList.toggle('focus');showToast($('.app-shell').classList.contains('focus')?'已进入专注模式':'已退出专注模式')});
$('#openSidebar').addEventListener('click',()=>$('#sidebar').classList.add('open'));$('#closeSidebar').addEventListener('click',()=>$('#sidebar').classList.remove('open'));

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
  if(existing){existing.title=name.replace(/\.(md|markdown|txt)$/i,'');existing.content=content;existing.updated='刚刚';existing.lastOpenedAt=Date.now();existing.hiddenFromRecent=false;documents=documents.filter(doc=>doc!==existing);documents.unshift(existing);activeId=existing.id}
  else{const id=Date.now()+Math.floor(Math.random()*1000);documents.unshift({id,title:name.replace(/\.(md|markdown|txt)$/i,''),content,updated:'刚刚',favorite:false,filePath:nativePath||undefined,lastOpenedAt:Date.now()});activeId=id}
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

const themeGrid=$('#themeGrid');
themeGrid.innerHTML=themes.map(t=>`<button class="theme-option" data-theme="${t.id}"><span class="theme-swatch">${t.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span><span>${t.name}</span></button>`).join('');
function setTheme(id){const theme=themes.find(t=>t.id===id)||themes[3];document.documentElement.dataset.theme=id;localStorage.setItem('mochi-theme',id);$('.theme-launcher strong').textContent=theme.name;document.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.theme===id))}
setTheme(localStorage.getItem('mochi-theme')||'lavender');
$('#themeLauncher').addEventListener('click',e=>{e.stopPropagation();$('#themePopover').hidden=!$('#themePopover').hidden});
themeGrid.addEventListener('click',e=>{const btn=e.target.closest('.theme-option');if(btn){setTheme(btn.dataset.theme);$('#themePopover').hidden=true;showToast(`已换成${themes.find(t=>t.id===btn.dataset.theme).name}主题`)}});
document.addEventListener('click',e=>{if(!e.target.closest('#themePopover')&&!e.target.closest('#themeLauncher'))$('#themePopover').hidden=true;if(!e.target.closest('#filePopover')&&!e.target.closest('#fileLocationButton'))closeFilePopover();if(!e.target.closest('#exportPopover')&&!e.target.closest('#exportButton'))closeExportPopover();if(!e.target.closest('#recentMenu')&&!e.target.closest('#recentMenuButton'))closeRecentMenu();if(!e.target.closest('#documentContextMenu'))closeDocumentContextMenu();if(!e.target.closest('#profilePopover')&&!e.target.closest('#profileCopy'))closeProfilePopover()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeRecentMenu();closeDocumentContextMenu();closeProfilePopover();closeExportPopover()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDocument()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCurrent(e.shiftKey)}if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();exportPdf()}if(e.key==='Tab'&&document.activeElement===editor){e.preventDefault();const s=editor.selectionStart;editor.setRangeText('  ',s,editor.selectionEnd,'end');updatePreview();updateWorkingCopy()}});

window.mochiSaveBeforeClose=async()=>{if(await saveCurrent())await nativeInvoke('force_close',{});else await nativeInvoke('cancel_quit',{})};

if(window.matchMedia('(max-width: 520px)').matches){document.querySelectorAll('.view-switcher button').forEach(b=>b.classList.toggle('active',b.dataset.mode==='preview'));editorArea.className='editor-area mode-preview'}
loadDoc(activeId,true,false);
