(async () => {
  'use strict';
  const api = globalThis.risuai || globalThis.Risuai;
  const C = globalThis.ScenarioCore;
  const CATALOG_KEY='scenario.v4.catalog',LEGACY_CATALOG_KEY='scenario.v2.catalog',LEGACY_CONTENT_PREFIX='scenario.v2.content.';
  const ENTRY_ID='scenario-library-chat-entry',LEGACY_ENTRY_ID='scenario-library-entry';
  const ENTRY_BADGE='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="currentColor" opacity="0.18"/><path d="M5.5 6h5.6c1 0 1.8.8 1.8 1.8v10.4c0-1-.8-1.8-1.8-1.8H5.5z" fill="currentColor"/><path d="M18.5 6h-5.6c-1 0-1.8.8-1.8 1.8v10.4c0-1 .8-1.8 1.8-1.8h5.6z" fill="currentColor" opacity="0.62"/></svg>';
  const parseStored=(raw,fallback)=>{if(raw==null)return fallback;return typeof raw==='string'?JSON.parse(raw):raw;};
  const stripContent=mod=>{const copy=C.clone(mod);for(const item of C.entries(copy))item.content='';return copy;};
  class CatalogRepository {
    constructor(){this.canonical=new C.Repository(api,SCENARIO_SEED);this.catalog=null;this.full=null;
      this.seedById=new Map((SCENARIO_SEED.entries||[]).map(item=>['scenario-arca-'+item.sourceArticleId,item]));}
    async raw(key){return api.pluginStorage.getItem(key);}
    async read(){
      const mod=this.catalog||parseStored(await this.raw(CATALOG_KEY),null);
      if(!C.isLibraryModule(mod))throw new Error('상황극 보관함 목록을 읽지 못했습니다.');
      return C.clone(mod);
    }
    async store(key,value){await api.pluginStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));}
    decorate(mod,previous=null){
      const result=stripContent(C.standardizeModule(mod)),old=new Map(C.entries(previous||{lorebook:[]}).map(item=>[item.id,item]));
      result.scenarioLibraryCoverage=C.mergeCoverage(previous?.scenarioLibraryCoverage,SCENARIO_SEED.coverage);
      for(const item of C.entries(result)){
        const prior=old.get(item.id),seed=this.seedById.get(item.id);
        if(prior?.scenarioLibrarySummary)item.scenarioLibrarySummary=prior.scenarioLibrarySummary;
        else if(seed?.summary)item.scenarioLibrarySummary=seed.summary;
        if(prior?.scenarioLibrarySource)item.scenarioLibrarySource=C.clone(prior.scenarioLibrarySource);
        else if(seed)item.scenarioLibrarySource=C.sourceMeta(seed);
      }
      return result;
    }
    async removeLegacy(){
      const keys=await api.pluginStorage.keys();
      await Promise.all(keys.filter(key=>key===LEGACY_CATALOG_KEY||key.startsWith(LEGACY_CONTENT_PREFIX)).map(key=>api.pluginStorage.removeItem(key)));
    }
    async initialize(){
      const existing=parseStored(await this.raw(CATALOG_KEY),null);
      if(C.isLibraryModule(existing)){this.catalog=existing;await this.removeLegacy();return this.read();}
      const legacy=parseStored(await this.raw(LEGACY_CATALOG_KEY),null);
      const installed=await this.canonical.read();
      if(!installed && !(SCENARIO_SEED.entries||[]).some(item=>String(item.content||'').trim()))
        throw new Error('상황극 서고 모듈을 먼저 가져온 뒤 다시 열어 주세요. 플러그인에는 본문을 중복 저장하지 않습니다.');
      const seeded=await this.canonical.initialize();
      this.full=seeded;this.catalog=this.decorate(seeded,legacy);await this.store(CATALOG_KEY,this.catalog);await this.removeLegacy();return this.read();
    }
    async content(item){
      if(item?.content)return item.content;
      this.full||=await this.canonical.read();
      const found=C.entries(this.full||{lorebook:[]}).find(entry=>entry.id===item.id);
      if(typeof found?.content!=='string')throw new Error('이 상황극의 본문을 읽지 못했습니다.');
      return found.content;
    }
    async mutate(transform){
      let nextCatalog=null;
      const saved=await this.canonical.mutate(mod=>{
        if(!mod)throw new Error('상황극 서고 모듈이 없습니다. 보관함 메뉴에서 모듈을 다시 동기화해 주세요.');
        const working=C.clone(mod),metadata=new Map(C.entries(this.catalog||{lorebook:[]}).map(item=>[item.id,item]));
        working.scenarioLibraryCoverage=this.catalog?.scenarioLibraryCoverage||SCENARIO_SEED.coverage||null;
        for(const item of C.entries(working)){const old=metadata.get(item.id);if(old?.scenarioLibrarySummary)item.scenarioLibrarySummary=old.scenarioLibrarySummary;if(old?.scenarioLibrarySource)item.scenarioLibrarySource=C.clone(old.scenarioLibrarySource);}
        const next=transform(working);
        if(!C.isLibraryModule(next))throw new Error('보관함 변경 결과가 올바르지 않습니다.');
        nextCatalog=this.decorate(next,next);return C.standardizeModule(next);
      });
      this.full=saved;this.catalog=this.decorate(saved,nextCatalog);this.catalog.scenarioLibraryCoverage=nextCatalog?.scenarioLibraryCoverage||this.catalog.scenarioLibraryCoverage;
      await this.store(CATALOG_KEY,this.catalog);return C.clone(this.catalog);
    }
    async refresh(){const mod=await this.canonical.read();if(!mod)throw new Error('상황극 서고 모듈을 찾지 못했습니다.');this.full=mod;this.catalog=this.decorate(mod,this.catalog);await this.store(CATALOG_KEY,this.catalog);return C.clone(this.catalog);}
    async export(){const mod=await this.canonical.read();if(!mod)throw new Error('상황극 서고 모듈을 찾지 못했습니다.');return mod;}
    async usage(){
      const keys=await api.pluginStorage.keys(),encoder=new TextEncoder(),rows=[];
      for(const key of keys){const value=await this.raw(key),serialized=typeof value==='string'?value:JSON.stringify(value);rows.push({key,bytes:encoder.encode(key).length+encoder.encode(serialized||'').length});}
      return {keys:rows.length,bytes:rows.reduce((sum,row)=>sum+row.bytes,0),catalogBytes:rows.filter(row=>row.key===CATALOG_KEY).reduce((sum,row)=>sum+row.bytes,0),rows};
    }
    async clearCache(){await api.pluginStorage.removeItem(CATALOG_KEY);await this.removeLegacy();this.catalog=null;this.full=null;}
    async clearAll(){await api.pluginStorage.clear();this.catalog=null;this.full=null;}
  }
  const repo = new CatalogRepository();
  const PAGE_STEP = 30;
  const state = {mod:null, prefs:{favorites:[],recent:[],lastFolder:'',sort:'newest',adult:'all',targets:[],searches:[],cleanMode:'off'},
    context:'none', mode:false,target:'',cart:[],
    page:'list', filter:'all', query:'', shown:PAGE_STEP, selected:null, draft:null, compose:'', undo:null, busy:false,
    importItems:null,importCoverage:null,importQuery:'',importView:'candidates',importSearchBody:false,importPage:0,importFolder:''};
  const registrations=[];
  let databasePermission=typeof api.requestPluginPermission!=='function';
  let pendingAdd=null;
  // One-shot instructions queued for resolution once the model has replied.
  const PENDING_CLEAN_KEY='scenario.v1.pending-clean';
  const canAutoClean=typeof api.addRisuChatListener==='function';
  let pendingClean=[],cleaning=false;
  function savePendingClean(){return store(PENDING_CLEAN_KEY,pendingClean);}
  async function handleOutput(event){
    if(cleaning||!pendingClean.length)return;
    const key=JSON.stringify([event?.char?.chaId,event?.chat?.id||'index:'+event?.chatIndex]);
    if(!pendingClean.some(p=>p.key===key))return;
    cleaning=true;
    try{
      for(const p of pendingClean.filter(x=>x.key===key)){
        const result=await C.resolveOneShot(api,event.characterIndex,event.chatIndex,p.key,p.messageId,{mode:p.mode,label:p.label});
        // 'waiting'/'busy'/'moved' keep the entry for the next output event.
        if(result.resolved||result.reason==='missing'||result.reason==='off')pendingClean=pendingClean.filter(x=>x!==p);
      }
      await savePendingClean();
    }catch(e){console.warn('[scenario-library] auto-clean',e);}
    finally{cleaning=false;}
  }
  let preferenceQueue=Promise.resolve(), draftTimer, listObserver=null, lastPage=null;
  let autoLoadArmed=false, syncChipCounts=()=>{},tryAutoLoad=()=>{};
  const armAutoLoad=()=>{autoLoadArmed=true;requestAnimationFrame(()=>tryAutoLoad());};
  addEventListener('scroll',armAutoLoad,{passive:true});
  document.addEventListener('scroll',armAutoLoad,{passive:true,capture:true});
  const el=(tag,props={},...children)=>{
    const node=document.createElement(tag);
    for(const [key,val] of Object.entries(props)) {
      if(key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(),val);
      else if(key==='class')node.className=val;
      else if(key==='text')node.textContent=val;
      else if(key==='hidden')node.hidden=val;
      else node.setAttribute(key,val);
    }
    for(const child of children.flat()) if(child!=null) node.append(typeof child==='string'?document.createTextNode(child):child);
    return node;
  };
  const button=(text,fn,cls='')=>el('button',{type:'button',class:cls,onClick:()=>run(fn)},text);
  const iconButton=(glyph,name,fn,cls='')=>{const b=button(glyph,fn,'icon '+cls);b.setAttribute('aria-label',name);b.setAttribute('title',name);return b;};
  const root=el('main',{class:'app'});document.body.replaceChildren(root);
  root.addEventListener('scroll',armAutoLoad,{passive:true});
  const style=el('style');style.textContent=STYLE;document.head.append(style);
  const errorBox=el('div',{class:'status',role:'alert',hidden:true});
  function error(e){errorBox.textContent=e.message||String(e);errorBox.hidden=false;root.prepend(errorBox);errorBox.scrollIntoView({block:'nearest'});}
  function toast(text){document.querySelector('.toast')?.remove();const n=el('div',{class:'toast',role:'status'},text);document.body.append(n);setTimeout(()=>n.remove(),3200);}
  async function run(fn){if(state.busy)return;errorBox.hidden=true;state.busy=true;
    const controls=[...document.querySelectorAll('button,input,textarea,select')].map(node=>[node,node.disabled]);controls.forEach(([node])=>node.disabled=true);
    try{await fn();}catch(e){error(e);}finally{state.busy=false;controls.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled;});}}
  // A corrupt stored value must degrade to defaults, not brick the explorer.
  async function load(key, fallback){try{const raw=await api.pluginStorage.getItem(key);if(raw==null)return fallback;return typeof raw==='string'?JSON.parse(raw):raw;}catch(e){console.warn('[scenario-library] corrupt storage',key,e);return fallback;}}
  function store(key,value){const snapshot=JSON.stringify(value);preferenceQueue=preferenceQueue.catch(()=>{}).then(()=>api.pluginStorage.setItem(key,snapshot));return preferenceQueue;}
  function savePrefs(){return store('scenario.v1.preferences',state.prefs);}
  function saveDraft(){clearTimeout(draftTimer);return store('scenario.v1.draft',state.draft);}
  function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraft().catch(error),600);}
  // A character without an open chat must still allow browsing the library.
  async function context(){try{if(!(await api.getCharacter())?.chaId)return 'none';return (await C.chatContext(api)).key;}catch(e){return 'none';}}
  function rememberMode(){return store('scenario.v1.context.'+state.context,{mode:state.mode,target:state.target,compose:state.compose,cart:state.cart});}
  async function openSource(event,url){
    event.preventDefault();
    const popup=globalThis.open(url,'_blank','noopener,noreferrer');
    if(popup){popup.opener=null;return;}
    try{await navigator.clipboard.writeText(url);toast('새 탭 열기가 차단되어 원문 주소를 복사했습니다.');}
    catch(e){toast('새 탭 열기가 차단되었습니다. 원문 주소를 길게 눌러 복사해 주세요.');}
  }
  function exitNow(){api.hideContainer();clearTimeout(draftTimer);saveDraft().catch(()=>{});rememberMode().catch(()=>{});}
  document.body.addEventListener('click',event=>{if(innerWidth>=700&&event.target===document.body)exitNow();});
  function exitButton(compact=false){const b=el('button',{type:'button',class:compact?'icon close':'exit-button',onClick:exitNow},compact?'×':'나가기');b.setAttribute('aria-label','상황극 탐색기 닫기');return b;}
  async function ensureDatabasePermission(){
    if(databasePermission)return true;
    try{databasePermission=await api.requestPluginPermission('db')===true;}
    catch(e){console.error('[scenario-library] database permission',e);databasePermission=false;}
    return databasePermission;
  }
  async function open(){
    if(!await ensureDatabasePermission()){
      console.warn('[scenario-library] DB access was not granted; the explorer will remain closed.');
      return;
    }
    await api.showContainer('fullscreen');
    root.replaceChildren(shell('상황극 탐색기',el('span',{class:'mark','aria-hidden':'true'},'☰'),[exitButton()]),
      el('section',{class:'loading-card','aria-live':'polite'},el('strong',{},'보관함을 여는 중'),el('p',{class:'muted'},'목록만 먼저 불러오고 본문은 선택할 때 읽습니다.'),el('div',{class:'skeleton'})));
    try{
      state.mod=await repo.initialize();
      const prefs=await load('scenario.v1.preferences',{});
      state.prefs={favorites:[],recent:[],lastFolder:'',sort:'newest',adult:'all',targets:[],searches:[],cleanMode:'off',...prefs};
      for(const key of ['favorites','recent','targets','searches']) if(!Array.isArray(state.prefs[key]))state.prefs[key]=[];
      // 1.1.0 shipped a boolean toggle; it maps onto the explicit removal mode.
      state.prefs.cleanMode=C.oneShotMode(state.prefs.cleanMode||(prefs.autoClean===true?'remove':'off'));
      delete state.prefs.autoClean;
      if(!['newest','title','oldest'].includes(state.prefs.sort))state.prefs.sort='newest';
      if(!['all','hide','only'].includes(state.prefs.adult))state.prefs.adult='all';
      state.context=await context();state.undo=null;pendingAdd=null;
      const saved=await load('scenario.v1.context.'+state.context,{});
      state.mode=!!saved.mode;state.target=typeof saved.target==='string'?saved.target:'';state.compose=typeof saved.compose==='string'?saved.compose:'';
      state.cart=Array.isArray(saved.cart)?saved.cart.filter(x=>x&&typeof x.text==='string').slice(0,30):[];
      state.draft=await load('scenario.v1.draft',null);state.page='list';state.selected=null;state.shown=PAGE_STEP;lastPage=null;
      // A stale search reads as an empty library on reopen; the folder does not.
      state.query='';
      if(!['all','favorites','recent'].includes(state.filter)&&!C.folders(state.mod).some(f=>f.key===state.filter))state.filter='all';
      render();
    }catch(e){root.replaceChildren(shell('상황극 탐색기',null,[exitButton()]),el('div',{class:'panel'},el('div',{class:'bar'},button('다시 시도',open,'primary'),exitButton())));error(e);}
  }
  // One shell, four screens. The header is the only chrome that survives a page
  // change, so mobile keeps the whole viewport for content.
  function shell(title,left,right){
    return el('header',{class:'top'},left||el('span',{class:'mark','aria-hidden':'true'},'☰'),
      el('h1',{class:'top-title'},title),el('div',{class:'top-actions'},right||[]));
  }
  function render(){
    listObserver?.disconnect();listObserver=null;
    root.replaceChildren();
    if(state.page==='edit')renderEdit();else if(state.page==='detail')renderDetail();
    else if(state.page==='compose')renderCompose();else if(state.page==='import')renderImport();
    else if(state.page==='cart')renderCart();else renderList();
    errorBox.hidden=true;
    if(lastPage!==state.page){lastPage=state.page;const heading=root.querySelector('.top-title');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}scrollTo(0,0);}
  }
  function goto(page){state.page=page;render();}
  async function close(){await saveDraft();await rememberMode();await api.hideContainer();}
  function label(text,child){return el('label',{},text,child);}

  /* ---------- shared item helpers ---------- */
  const folderName=key=>C.folders(state.mod).find(f=>f.key===key)?.comment||'미분류';
  const inputOf=item=>C.cleanInput(item.content);
  // 18+ marking must survive seeds whose crawler flag is unset: the adult folder
  // is the classification the user actually sees, so either signal marks it.
  const isAdult=item=>Boolean(item.scenarioLibrarySource?.isSensitive)||folderName(item.folder)==='성인';
  // Display only. Stored content and anything sent to the chat keep their tokens.
  const display=text=>String(text||'').replace(/\{\{char\}\}/gi,()=>state.mode&&state.target.trim()?state.target.trim():'상대').replace(/\{\{user\}\}/gi,'나');
  // Hangul is not a \w character, so the Korean markers must not rely on \b.
  const DIRECTIVE=/^(?:(?:ooc|system|scenario|reference|guideline|describe|write|output|portray|ensure|maintain)\b|시나리오|프롬프트|참조|지침|응답|출력|작성)/i;
  const plain=text=>String(text||'').replace(/<[^>]+>/g,' ').replace(/[\[(](?:OOC|System)[^\])]*[\])]?/gi,' ')
    .replace(/[\[\]#*_`>|]+/g,' ').replace(/\s+/g,' ').trim();
  // Fallback blurb for entries whose bundled summary is only the title: take the
  // first prose lines and skip the prompt scaffolding a reader gains nothing from.
  function snippet(item){
    const parts=[];
    for(const line of String(item.content||'').split(/\n+/).map(plain)){
      if(line.length<8||DIRECTIVE.test(line))continue;
      parts.push(line);
      if(parts.join(' ').length>=110)break;
    }
    return parts.join(' ').slice(0,180);
  }
  // The bundled summaries were generated from token-expanded text, so a title and
  // its summary only look different until both are put through the same spelling.
  const seedish=text=>String(text||'').replace(/\{\{char\}\}/gi,'캐릭터').replace(/\{\{user\}\}/gi,'사용자').replace(/로어북|lorebook/gi,'상황극');
  const squash=text=>seedish(text).replace(/[\s\p{P}\p{S}]+/gu,'').toLocaleLowerCase();
  function summaryOf(item){return item.scenarioLibrarySummary||snippet(item);}
  // The bundled summaries are built as "title — detail"; showing the title twice
  // is the single biggest source of noise in a 527 row list.
  function subtitleOf(item){
    const title=item.comment.trim(),key=squash(title);
    let text=plain(summaryOf(item));
    const sep=text.indexOf(' — ');
    if(sep>0 && squash(text.slice(0,sep))===key) text=text.slice(sep+3);
    else if(title && text.startsWith(title)) text=text.slice(title.length);
    text=text.replace(/^[\s—–\-·:,]+/,'').trim();
    const squashed=squash(text);
    if(!squashed || squashed===key || key.includes(squashed) || DIRECTIVE.test(text)) text='';
    return (text || snippet(item)).slice(0,180);
  }
  // 으로/로 depends on the final consonant of the target name.
  const ro=name=>{const code=name.charCodeAt(name.length-1),jong=(code>=0xAC00&&code<=0xD7A3)?(code-0xAC00)%28:-1;
    return jong===0||jong===8?'로':jong>0?'으로':'(으)로';};
  function tags(item){
    const name=folderName(item.folder),adult=isAdult(item);
    return [adult?el('span',{class:'tag adult'},'19+'):null,name==='성인'&&adult?null:el('span',{class:'tag'},name)].filter(Boolean);
  }
  function metaOf(item){const s=item.scenarioLibrarySource;return [s?.createdAt?s.createdAt.slice(0,10):null,s?.author].filter(Boolean).join(' · ');}
  function toggleFavorite(item,after){
    const starred=state.prefs.favorites.includes(item.id);
    state.prefs.favorites=starred?state.prefs.favorites.filter(id=>id!==item.id):[item.id,...state.prefs.favorites];
    return savePrefs().then(after);
  }
  function starButton(item,after){
    const b=el('button',{type:'button',class:'star'});
    const sync=()=>{const on=state.prefs.favorites.includes(item.id);
      b.textContent=on?'★':'☆';b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
      b.setAttribute('aria-label',(on?'즐겨찾기 해제: ':'즐겨찾기 추가: ')+item.comment);};
    b.addEventListener('click',()=>run(()=>toggleFavorite(item,()=>{sync();after?.();})));
    sync();return b;
  }

  /* ---------- list ---------- */
  function renderList(){
    const menu=iconButton('⋯','더보기 메뉴',()=>openMenu());
    const cart=state.cart.length?iconButton(`◫${state.cart.length}`,`담은 상황극 ${state.cart.length}개`,()=>goto('cart'),'cart-badge'):null;
    root.append(shell('상황극 탐색기',null,[cart,iconButton('＋','직접 저장',()=>edit(null)),menu,exitButton()].filter(Boolean)));
    root.append(errorBox);

    const search=el('input',{type:'search',placeholder:'제목·줄거리 검색','aria-label':'상황극 검색',enterkeyhint:'search',autocomplete:'off'});search.value=state.query;
    const clear=iconButton('×','검색어 지우기',()=>{state.query='';search.value='';state.shown=PAGE_STEP;search.focus();refresh();},'clear');
    clear.hidden=!state.query;
    const searchRow=el('div',{class:'search'},search,clear);
    // Recent searches only help while the box is empty; once there is a query the
    // result list is the better feedback.
    const history=el('div',{class:'chips history','aria-label':'최근 검색어'});
    const drawHistory=()=>{
      history.replaceChildren();
      const terms=state.prefs.searches.filter(Boolean).slice(0,5);
      history.hidden=!terms.length||Boolean(state.query.trim());
      for(const term of terms)history.append(button(term,()=>{state.query=term;search.value=term;state.shown=PAGE_STEP;refresh();drawHistory();search.focus();},'chip history-chip'));
      if(terms.length)history.append(button('기록 지우기',()=>{state.prefs.searches=[];savePrefs().catch(error);drawHistory();},'link'));
    };
    root.append(el('div',{class:'sticky'},searchRow,history));

    const chips=el('nav',{class:'chips scroller','aria-label':'상황극 분류'});
    const all=C.entries(state.mod);
    const counters=[];
    const chip=(name,id,sizeOf)=>{
      const b=button('',()=>{state.filter=id;state.shown=PAGE_STEP;render();},'chip'+(state.filter===id?' active':''));
      const size=el('span',{class:'chip-count'});counters.push([sizeOf,size]);
      b.append(el('span',{},name),size);
      b.setAttribute('aria-pressed',String(state.filter===id));chips.append(b);
    };
    // Favourites/recent may reference entries that were deleted since; the chip
    // must count what the filter will actually show.
    const ids=new Set(all.map(e=>e.id));
    chip('전체','all',()=>all.length);
    chip('★ 즐겨찾기','favorites',()=>state.prefs.favorites.filter(id=>ids.has(id)).length);
    chip('◷ 최근','recent',()=>state.prefs.recent.filter(id=>ids.has(id)).length);
    for(const f of C.folders(state.mod)) chip(f.comment,f.key,()=>all.filter(e=>e.folder===f.key).length);
    syncChipCounts=()=>{for(const [sizeOf,node] of counters)node.textContent=String(sizeOf());};
    syncChipCounts();
    root.append(chips);
    requestAnimationFrame(()=>{const active=chips.querySelector('.chip.active');
      if(active)chips.scrollLeft=Math.max(0,active.offsetLeft-chips.offsetLeft-16);});

    const count=el('p',{class:'result-count muted','aria-live':'polite'});
    const sort=el('select',{'aria-label':'상황극 정렬',class:'mini'},el('option',{value:'newest'},'최신순'),el('option',{value:'title'},'제목순'),el('option',{value:'oldest'},'오래된순'));
    sort.value=state.prefs.sort;
    const adult=el('select',{'aria-label':'19금 표시',class:'mini'},el('option',{value:'all'},'19금 포함'),el('option',{value:'hide'},'19금 숨김'),el('option',{value:'only'},'19금만'));
    adult.value=state.prefs.adult;
    const list=el('div',{class:'list'}),more=el('div',{class:'more'});
    const refresh=()=>{clear.hidden=!state.query;drawHistory();fillList(list,count,more);};
    let searchTimer;
    search.addEventListener('input',()=>{state.query=search.value;state.shown=PAGE_STEP;clearTimeout(searchTimer);searchTimer=setTimeout(refresh,90);});
    sort.addEventListener('change',()=>{state.prefs.sort=sort.value;state.shown=PAGE_STEP;savePrefs().catch(error);refresh();});
    adult.addEventListener('change',()=>{state.prefs.adult=adult.value;state.shown=PAGE_STEP;savePrefs().catch(error);refresh();});
    root.append(el('div',{class:'toolbar'},count,el('div',{class:'toolbar-controls'},sort,adult)));
    const coverage=C.normalizeCoverage(state.mod.scenarioLibraryCoverage);
    const newest=[...all].filter(item=>item.scenarioLibrarySource?.createdAt).sort((a,b)=>Date.parse(b.scenarioLibrarySource.createdAt)-Date.parse(a.scenarioLibrarySource.createdAt))[0];
    const coverageText=coverage
      ?`탭 확인 ${coverage.scannedAt.slice(0,10)} · 당시 최신 #${coverage.newestArticleId} (${coverage.newestCreatedAt.slice(0,10)}) · 저장 ${all.length}개`
      :newest?`저장된 최신 후보 #${newest.scenarioLibrarySource.sourceArticleId} (${newest.scenarioLibrarySource.createdAt.slice(0,10)}) · 탭 전체 확인 기록 없음`:'수집 기록 없음';
    root.append(el('p',{class:'coverage muted','aria-label':'상황극 서고 수집 범위'},coverageText));

    if(state.draft)root.append(el('div',{class:'notice'},'작성 중인 상황극이 있습니다. ',button('이어서 작성',()=>goto('edit'),'link')));
    root.append(list,more);
    root.append(el('p',{class:'muted foot-note'},'보관함의 상황극은 자동 발동하지 않습니다. 여기서 고른 지침만 현재 채팅에 들어갑니다.'));
    if(state.compose.trim())root.append(el('div',{class:'bar draft-bar'},
      button(`작성 중인 인풋카드 ${state.compose.trim().length}자 이어서 쓰기`,()=>goto('compose'),'primary')));
    refresh();
  }
  function visibleItems(){
    let items=C.entries(state.mod);
    if(state.filter==='favorites')items=state.prefs.favorites.map(id=>items.find(e=>e.id===id)).filter(Boolean);
    else if(state.filter==='recent')items=state.prefs.recent.map(id=>items.find(e=>e.id===id)).filter(Boolean);
    else if(state.filter!=='all')items=items.filter(e=>e.folder===state.filter);
    if(state.prefs.adult==='hide')items=items.filter(e=>!isAdult(e));
    else if(state.prefs.adult==='only')items=items.filter(isAdult);
    const query=state.query.trim().toLocaleLowerCase();
    if(query)items=items.filter(e=>(e.comment+'\n'+summaryOf(e)).toLocaleLowerCase().includes(query));
    const time=item=>Date.parse(item.scenarioLibrarySource?.createdAt||0)||0;
    if(state.filter!=='recent'&&state.filter!=='favorites')
      items=items.slice().sort(state.prefs.sort==='title'?(a,b)=>a.comment.localeCompare(b.comment,'ko'):state.prefs.sort==='oldest'?(a,b)=>time(a)-time(b):(a,b)=>time(b)-time(a));
    return items;
  }
  // Rows are appended, never rebuilt. Replacing the list on every page would
  // destroy the very button the reader is tapping and re-create 500 nodes.
  function fillList(container,count,more,append=false){
    const items=visibleItems();
    state.shown=Math.max(PAGE_STEP,Math.min(state.shown,Math.max(PAGE_STEP,items.length)));
    const shown=items.slice(0,state.shown);
    count.textContent=items.length?`${items.length}개 중 ${shown.length}개 표시`:'';
    const from=append?Number(container.dataset.rendered||0):0;
    if(!append)container.replaceChildren();
    container.dataset.rendered=String(shown.length);
    if(!items.length){
      listObserver?.disconnect();listObserver=null;more.replaceChildren();
      const why=state.query?'검색 결과가 없습니다':state.filter==='favorites'?'즐겨찾기가 비어 있습니다':state.filter==='recent'?'최근 사용한 상황극이 없습니다':'이 분류에 상황극이 없습니다';
      const how=state.query?'다른 낱말로 찾거나 분류를 ‘전체’로 바꿔 보세요.':state.prefs.adult!=='all'?'19금 표시 설정을 ‘19금 포함’으로 바꾸면 더 많이 보입니다.':'본문을 붙여넣어 첫 상황극을 저장해 보세요.';
      container.append(el('div',{class:'empty'},el('h2',{},why),el('p',{class:'muted'},how),button('＋ 직접 저장',()=>edit(null),'primary')));
      return;
    }
    const onFavourite=()=>{syncChipCounts();if(state.filter==='favorites')fillList(container,count,more);};
    for(const item of shown.slice(from)) container.append(listRow(item,onFavourite));
    const rest=items.length-shown.length;
    if(!rest){listObserver?.disconnect();listObserver=null;tryAutoLoad=()=>{};more.replaceChildren();return;}
    let load=more.querySelector('.more-button');
    if(!load){
      load=button('',()=>{state.shown+=PAGE_STEP;fillList(container,count,more,true);},'more-button');
      more.replaceChildren(load);
      tryAutoLoad=()=>{
        const near=innerWidth>=700?root.scrollTop+root.clientHeight>=root.scrollHeight-240:scrollY+innerHeight>=document.documentElement.scrollHeight-240;
        if(!near||!autoLoadArmed||state.busy||!load.isConnected)return;
        autoLoadArmed=false;state.shown+=PAGE_STEP;fillList(container,count,more,true);
      };
      // Auto-load turns 18 taps into scrolling, but only one page per scroll
      // gesture so reaching the bottom never runs away with the list.
      if(typeof IntersectionObserver==='function'){
        listObserver?.disconnect();
        listObserver=new IntersectionObserver(entries=>{
          if(entries.some(e=>e.isIntersecting))tryAutoLoad();
        },{root:innerWidth>=700?root:null,rootMargin:'200px'});
        listObserver.observe(load);
      }
    }
    load.textContent=`＋ ${Math.min(PAGE_STEP,rest)}개 더 보기 (남은 ${rest}개)`;
  }
  function noteSearch(){
    const term=state.query.trim();if(term.length<2)return Promise.resolve();
    state.prefs.searches=[term,...state.prefs.searches.filter(x=>x!==term)].slice(0,5);
    return savePrefs();
  }
  function listRow(item,after){
    const pick=el('button',{type:'button',class:'pick',onClick:()=>run(async()=>{const content=await repo.content(item);const expected={...C.clone(item),content};state.selected={...expected,_catalogExpected:C.clone(expected)};await noteSearch();goto('detail');})});
    const subtitle=subtitleOf(item),meta=metaOf(item);
    pick.append(el('span',{class:'r-title'},display(item.comment)));
    if(subtitle)pick.append(el('span',{class:'r-sum'},display(subtitle)));
    pick.append(el('span',{class:'r-meta'},...tags(item),meta?el('span',{class:'dim'},meta):null));
    return el('article',{class:'row-item'},pick,starButton(item,after));
  }
  async function openMenu(){
    const items=[
      ['＋ 직접 저장',()=>edit(null)],
      ['＋ 폴더 추가',()=>addFolder()],
      C.folders(state.mod).some(f=>f.key===state.filter)?['폴더 이름 변경',renameFolder]:null,
      ['작성 중인 인풋카드',()=>goto('compose')],
      state.cart.length?[`담은 상황극 ${state.cart.length}개`,()=>goto('cart')]:null,
      ['JSON 가져오기',chooseImport],
      ['보관함 백업',backup],
      ['모듈에서 새로고침',refreshFromModule],
      ['저장소 관리',openStorageManager],
      ['보관함 닫기',exitNow],
    ].filter(Boolean);
    const sheet=el('dialog',{class:'dialog sheet','aria-label':'보관함 메뉴'});
    const body=el('div',{class:'sheet-body'});
    for(const [name,fn] of items)body.append(el('button',{type:'button',onClick:()=>{sheet.close();run(fn);}},name));
    body.append(el('button',{type:'button',class:'link',onClick:()=>sheet.close()},'취소'));
    sheet.append(body);sheet.addEventListener('close',()=>sheet.remove());document.body.append(sheet);sheet.showModal();
  }

  /* ---------- edit ---------- */
  async function edit(item){
    if(state.draft && state.draft.id!==item?.id && !await confirmAction('작성 중인 초안이 있습니다. 새 작업으로 바꿀까요?','초안 바꾸기'))return;
    if(item&&!item.content){const content=await repo.content(item);item={...item,content,_catalogExpected:{...C.clone(item),content}};}
    state.draft={id:item?.id||crypto.randomUUID(),comment:item?.comment||'',content:item?.content||'',folder:item?.folder||(C.folders(state.mod).some(f=>f.key===state.filter)?state.filter:'')||state.prefs.lastFolder||C.folders(state.mod)[0]?.key||'',expected:item?(item._catalogExpected||C.clone(item)):null};
    state.page='edit';await saveDraft();render();
  }
  function renderEdit(){
    const d=state.draft;if(!d){goto('list');return;}
    root.append(shell(d.expected?'상황극 수정':'새 상황극',iconButton('←','보관함으로',()=>goto('list'),'back'),[exitButton()]));
    root.append(errorBox);
    const body=el('textarea',{class:'editor-body',placeholder:'일반봇용 상황극 본문을 그대로 붙여넣으세요. {{char}}는 사용할 때 치환됩니다.','aria-label':'상황극 본문'});body.value=d.content;
    const title=el('input',{type:'text',placeholder:'상황극 제목',maxlength:'120'});title.value=d.comment;
    title.addEventListener('input',()=>{d.comment=title.value;scheduleDraft();});
    body.addEventListener('input',()=>{d.content=body.value;if(!d.comment){title.value=C.suggestTitle(body.value);d.comment=title.value;}scheduleDraft();});
    const chips=el('div',{class:'chips','aria-label':'저장할 폴더'});
    const updateChips=()=>{chips.replaceChildren();for(const f of C.folders(state.mod)){
      const b=button(f.comment,()=>{d.folder=f.key;updateChips();scheduleDraft();},'chip'+(d.folder===f.key?' active':''));b.setAttribute('aria-pressed',String(d.folder===f.key));chips.append(b);
    }chips.append(button('＋ 새 폴더',async()=>{await addFolder(false);updateChips();},'chip'));};updateChips();
    const save=async more=>{
      const snapshot=C.clone(d);
      state.mod=await repo.mutate(mod=>{if(!mod)throw new Error('보관함 모듈이 삭제되었습니다. 다시 열어 주세요.');return C.saveEntry(mod,snapshot,snapshot.expected);});
      state.prefs.lastFolder=snapshot.folder;const catalogItem=state.mod.lorebook.find(e=>e.id===snapshot.id);const expected={...C.clone(catalogItem),content:snapshot.content};state.selected={...expected,_catalogExpected:C.clone(expected)};
      state.draft=null;await saveDraft();await savePrefs();
      if(more){await edit(null);toast('저장했습니다. 다음 상황극을 붙여넣으세요.');}else{goto('detail');toast('모듈에 저장했습니다.');}
    };
    root.append(el('section',{class:'panel'},
      label('본문',body),label('제목 · Scenario 제목을 자동으로 제안합니다',title),
      el('div',{},el('p',{class:'muted'},'저장할 폴더'),chips),
      el('p',{class:'muted'},'일반봇용 원문 하나만 저장합니다. {{user}}와 {{char}}는 그대로 보존됩니다.'),
      button('초안 버리기',async()=>{if(await confirmAction('작성 중인 초안을 버릴까요?','버리기')){state.draft=null;await saveDraft();goto('list');}},'link')));
    root.append(el('footer',{class:'bar'},button('저장',()=>save(false),'primary'),button('저장하고 계속',()=>save(true))));
  }

  /* ---------- detail ---------- */
  function modeControls(update){
    const group=el('div',{class:'seg',role:'radiogroup','aria-label':'봇 유형'});
    const target=el('input',{type:'text',placeholder:'예: 백리설화','aria-label':'시뮬봇 대상 이름',maxlength:'160',autocomplete:'off'});target.value=state.target;
    const targetLabel=label('이 이름으로 바꿉니다',target);targetLabel.className='target';
    const recent=el('div',{class:'chips target-recent','aria-label':'최근 사용한 대상 이름'});
    const pick=mode=>{state.mode=mode;sync();update();if(mode)target.focus();return rememberMode();};
    const options=[[false,'일반봇','원문 그대로'],[true,'시뮬봇','{{char}}를 다른 이름으로']];
    const buttons=options.map(([value,name,hint])=>{
      const b=el('button',{type:'button',role:'radio',class:'seg-option',onClick:()=>run(()=>pick(value))},
        el('span',{class:'seg-name'},name),el('span',{class:'seg-hint'},hint));
      group.append(b);return [value,b];
    });
    const drawRecent=()=>{
      recent.replaceChildren();
      const names=state.prefs.targets.filter(n=>n&&n!==state.target.trim());
      recent.hidden=!state.mode||!names.length;
      for(const name of names.slice(0,6))recent.append(button(name,()=>{state.target=name;target.value=name;update();sync();return rememberMode();},'chip'));
    };
    const sync=()=>{
      for(const [value,b] of buttons){b.setAttribute('aria-checked',String(state.mode===value));b.classList.toggle('active',state.mode===value);b.tabIndex=state.mode===value?0:-1;}
      targetLabel.hidden=!state.mode;drawRecent();
    };
    sync();
    group.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();run(()=>pick(!state.mode)).then(()=>root.querySelector('.seg-option.active')?.focus());}});
    target.addEventListener('input',()=>{state.target=target.value;update();drawRecent();});
    target.addEventListener('change',()=>rememberMode().catch(error));
    return el('div',{class:'mode'},group,targetLabel,recent);
  }
  function rememberTarget(){
    const name=state.target.trim();if(!state.mode||!name)return;
    state.prefs.targets=[name,...state.prefs.targets.filter(n=>n!==name)].slice(0,6);
  }
  function renderDetail(){
    const item=state.selected;if(!item){goto('list');return;}
    root.append(shell(display(item.comment),iconButton('←','보관함으로',()=>goto('list'),'back'),
      [starButton(item),button('수정',()=>edit(item),'text-action'),exitButton()]));
    root.append(errorBox);
    const preview=el('pre',{class:'preview',tabindex:'0','aria-label':'채팅에 들어갈 본문'});
    const hint=el('p',{class:'muted mode-hint'});
    const input=inputOf(item),tokens=(input.match(/\{\{char\}\}/gi)||[]).length;
    const size=el('span',{class:'size-note muted'});
    const expand=button('전체 보기',()=>{preview.classList.toggle('open');expand.textContent=preview.classList.contains('open')?'접기':'전체 보기';},'link');
    const update=()=>{
      preview.textContent=state.mode&&!state.target.trim()?input:C.convert(input,state.mode,state.target);
      hint.textContent=!state.mode?`원문의 {{char}} ${tokens}곳을 그대로 둡니다.`
        :!state.target.trim()?'대상 이름을 입력하면 {{char}}가 바뀝니다.'
        :`{{char}} ${tokens}곳이 ‘${state.target.trim()}’${ro(state.target.trim())} 바뀝니다.`;
      for(const node of root.querySelectorAll('.detail-title,.top-title'))node.textContent=display(item.comment);
      size.textContent=`${preview.textContent.length}자 · 약 ${C.estimateTokens(preview.textContent).toLocaleString('ko')}토큰`;
    };
    const controls=modeControls(update);
    const source=item.scenarioLibrarySource;
    const sourceLink=source?.sourceUrl?el('a',{href:source.sourceUrl,target:'_blank',rel:'noopener noreferrer',class:'source-link',
      onClick:event=>openSource(event,source.sourceUrl)},'원문 ↗'):null;
    const meta=el('div',{class:'detail-meta'},...tags(item),
      metaOf(item)?el('span',{class:'dim'},metaOf(item)):null,
      sourceLink);
    const subtitle=subtitleOf(item);
    root.append(el('section',{class:'panel'},
      el('h2',{class:'detail-title'},display(item.comment)),meta,
      el('section',{class:'story-summary','aria-label':'간략한 상황극 줄거리'},el('strong',{},'줄거리'),el('p',{},display(subtitle))),
      controls,hint,
      el('div',{class:'preview-wrap'},el('div',{class:'row space'},el('strong',{class:'preview-title'},'채팅에 들어갈 본문'),el('div',{class:'row'},size,expand)),preview)));
    update();

    const busyGuard=fn=>async()=>{rememberTarget();await savePrefs();await rememberMode();await fn();};
    const toCompose=busyGuard(async()=>{
      const converted=C.convert(input,state.mode,state.target);
      const before=state.compose;state.compose=C.append(state.compose,converted);state.undo={before,after:state.compose};
      noteRecent(item);await savePrefs();await rememberMode();goto('compose');
    });
    const addNow=busyGuard(async()=>{
      const content=C.convert(input,state.mode,state.target);
      await commitToChat(content,item.comment);noteRecent(item);await savePrefs();
    });
    const addToCart=busyGuard(async()=>{
      const content=C.convert(input,state.mode,state.target);
      if(state.cart.some(row=>row.text===content))throw new Error('이미 담긴 상황극입니다.');
      if(state.cart.length>=30)throw new Error('한 번에 30개까지만 담을 수 있습니다.');
      state.cart=[...state.cart,{id:item.id,title:item.comment,text:content}];
      noteRecent(item);await savePrefs();await rememberMode();render();
      toast(`담았습니다. 현재 ${state.cart.length}개.`);
    });
    const bar=el('footer',{class:'bar'});
    if(state.context==='none'){
      bar.append(el('span',{class:'muted grow'},'채팅을 열면 바로 추가할 수 있습니다.'),button('다듬기',toCompose));
    }else if(state.compose.trim()){
      bar.append(button('인풋카드에 이어붙이기',toCompose,'primary'),el('span',{class:'muted grow'},`작성 중 ${state.compose.trim().length}자`));
    }else{
      bar.append(button('채팅에 추가',addNow,'primary'),button('다듬기',toCompose));
    }
    if(state.context!=='none')bar.append(button(state.cart.length?`담기 (${state.cart.length})`:'담기',addToCart,'link'));
    const clean=cleanControls();if(clean)root.append(clean);
    root.append(bar);
  }
  function noteRecent(item){state.prefs.recent=[item.id,...state.prefs.recent.filter(id=>id!==item.id)].slice(0,30);}
  async function commitToChat(content,label=''){
    if(!pendingAdd || pendingAdd.content!==content || pendingAdd.context!==state.context)
      pendingAdd={id:crypto.randomUUID(),content,context:state.context};
    await C.addUserMessage(api,state.context,content,pendingAdd.id);
    const mode=canAutoClean?C.oneShotMode(state.prefs.cleanMode):'off';
    if(mode!=='off'){
      pendingClean=[...pendingClean.filter(p=>p.messageId!==pendingAdd.id),
        {key:state.context,messageId:pendingAdd.id,addedAt:Date.now(),mode,label:String(label||'').slice(0,120)}].slice(-20);
      // The message is already committed; a failed queue write only loses the cleanup.
      try{await savePendingClean();}catch(e){console.warn('[scenario-library] auto-clean queue',e);}
    }
    state.compose='';state.undo=null;pendingAdd=null;state.cart=[];
    // A committed message must not be presented as failed just because preference storage failed.
    try{await rememberMode();}catch(e){console.warn('[scenario-library] draft cleanup',e);}
    await api.hideContainer();
    state.page='list';lastPage=null;render();
    toast(ONE_SHOT_TOAST[mode]||'유저 메시지로 추가했습니다. 전송 버튼으로 응답을 이어가세요.');
  }
  const ONE_SHOT_TOAST={off:'유저 메시지로 추가했습니다. 전송 버튼으로 응답을 이어가세요.',
    remove:'유저 메시지로 추가했습니다. 응답이 도착하면 지침 메시지는 자동으로 지워집니다.',
    mark:'유저 메시지로 추가했습니다. 응답이 도착하면 지침 앞에 [완료] 표시가 붙습니다.',
    collapse:'유저 메시지로 추가했습니다. 응답이 도착하면 지침은 한 줄 기록으로 줄어듭니다.'};
  const ONE_SHOT_OPTIONS=[['off','그대로 두기','지침이 채팅에 남아 이후 요청에도 함께 전송됩니다.'],
    ['remove','삭제','지침 메시지를 채팅에서 지웁니다. 문맥에서 완전히 사라집니다.'],
    ['mark','[완료] 표시','본문은 남기고 앞에 [완료]만 붙입니다. 나중에 직접 지울 수 있습니다.'],
    ['collapse','한 줄로 줄이기','‘[지침 적용됨: 제목]’ 한 줄만 남겨 어떤 상황극이었는지 기록합니다.']];
  // One-shot handling: what happens to the instruction message once the model
  // has replied to it, so it stops being resent with every following request.
  function cleanControls(){
    if(state.context==='none'||!canAutoClean)return null;
    const select=el('select',{'aria-label':'응답 후 지침 처리'});
    for(const [value,name] of ONE_SHOT_OPTIONS){const option=el('option',{value},name);option.selected=state.prefs.cleanMode===value;select.append(option);}
    const hint=el('small',{});
    const sync=()=>{hint.textContent=(ONE_SHOT_OPTIONS.find(([value])=>value===state.prefs.cleanMode)||ONE_SHOT_OPTIONS[0])[2];};
    select.addEventListener('change',()=>{state.prefs.cleanMode=C.oneShotMode(select.value);sync();savePrefs().catch(error);});
    sync();
    return el('div',{class:'clean-row'+(state.prefs.cleanMode==='off'?'':' on')},
      el('div',{class:'clean-copy'},el('strong',{},'응답 후 지침 처리 (일회용)'),hint),select);
  }
  /* ---------- compose ---------- */
  function renderCompose(){
    root.append(shell('인풋카드',iconButton('←','보관함으로',()=>goto('list'),'back'),[exitButton()]));
    root.append(errorBox);
    const text=el('textarea',{class:'compose-area','aria-label':'인풋카드 본문',placeholder:'선택한 상황극이 여기에 들어갑니다.'});text.value=state.compose;
    const counter=el('p',{class:'muted counter','aria-live':'polite'});
    // A rough token figure is what actually predicts context cost; characters alone hide it.
    const count=()=>{counter.textContent=`${text.value.length}자 · 약 ${C.estimateTokens(text.value).toLocaleString('ko')}토큰 (추정)`;};count();
    text.addEventListener('input',()=>{state.compose=text.value;count();});
    text.addEventListener('change',()=>rememberMode().catch(error));
    const copy=async()=>{
      if(!text.value.trim())throw new Error('복사할 내용이 없습니다.');
      if(await context()!==state.context)throw new Error('대화가 변경되었습니다. 보관함을 닫았다가 다시 열어 주세요.');
      // Clipboard must be invoked directly from a click. execCommand is the
      // fallback for iframe hosts that do not grant clipboard-write permission.
      let copied=false;
      try{await navigator.clipboard.writeText(text.value);copied=true;}catch{}
      if(!copied){text.focus();text.select();try{copied=document.execCommand('copy');}catch{}}
      if(!copied){text.focus();text.select();throw new Error('자동 복사를 사용할 수 없습니다. 선택된 본문을 복사한 뒤 채팅에 붙여넣어 주세요.');}
      state.compose=text.value;await rememberMode();
      toast('복사했습니다. 채팅 입력창에 붙여넣어 주세요.');
      await api.hideContainer();
    };
    const undo=button('되돌리기',async()=>{
      if(state.undo===null){toast('되돌릴 추가 작업이 없습니다.');return;}
      if(state.compose!==state.undo.after && !await confirmAction('추가 후 수정한 내용도 되돌릴까요?','되돌리기'))return;
      state.compose=state.undo.before;state.undo=null;await rememberMode();render();});
    const clear=button('비우기',async()=>{if(await confirmAction('작성한 입력을 비울까요?','비우기')){state.undo={before:state.compose,after:''};state.compose='';await rememberMode();render();}},'link');
    root.append(el('section',{class:'panel'},
      el('p',{class:'muted'},'내용을 다듬고 ‘채팅에 추가’를 누르면 유저 메시지가 됩니다. AI 응답은 기존 전송 버튼으로 이어가세요.'),
      text,el('div',{class:'row space'},counter,el('div',{class:'row'},undo,clear))));
    const bar=el('footer',{class:'bar'});
    if(state.context==='none')bar.append(el('span',{class:'muted grow'},'채팅을 열면 추가할 수 있습니다.'),button('복사',copy));
    else bar.append(button('채팅에 추가',()=>commitToChat(text.value,composeLabel()),'primary'),button('복사',copy),button('＋ 더 고르기',()=>goto('list'),'link'));
    const clean=cleanControls();if(clean)root.append(clean);
    root.append(bar);
  }

  // The cart is a staging list: several scenarios merged in a chosen order,
  // which the single-append flow could not express.
  function composeLabel(){
    if(state.cart.length)return state.cart.map(row=>row.title).join(' + ').slice(0,120);
    return state.selected?state.selected.comment:'';
  }
  function saveCart(){return rememberMode();}
  function renderCart(){
    root.append(shell(`담은 상황극 ${state.cart.length}개`,iconButton('←','보관함으로',()=>goto('list'),'back'),[exitButton()]));
    root.append(errorBox);
    const list=el('div',{class:'cart-list'});
    const move=async(index,step)=>{
      const next=[...state.cart],[row]=next.splice(index,1);next.splice(Math.max(0,Math.min(next.length,index+step)),0,row);
      state.cart=next;await saveCart();render();
    };
    const drop=async index=>{state.cart=state.cart.filter((_,i)=>i!==index);await saveCart();render();};
    state.cart.forEach((row,index)=>{
      const up=iconButton('↑','위로 옮기기',()=>move(index,-1));up.disabled=index===0;
      const down=iconButton('↓','아래로 옮기기',()=>move(index,1));down.disabled=index===state.cart.length-1;
      list.append(el('article',{class:'cart-row'},
        el('span',{class:'cart-order'},String(index+1)),
        el('div',{class:'cart-body'},el('strong',{},display(row.title)),
          el('span',{class:'muted'},`${row.text.length}자 · 약 ${C.estimateTokens(row.text).toLocaleString('ko')}토큰`)),
        el('div',{class:'cart-actions'},up,down,iconButton('×','담은 목록에서 빼기',()=>drop(index)))));
    });
    const merged=state.cart.map(row=>row.text).join('\n\n');
    root.append(el('section',{class:'panel'},
      state.cart.length?el('p',{class:'muted'},'위에서 아래 순서로 하나의 인풋카드에 합쳐집니다.')
        :el('div',{class:'empty'},el('h2',{},'담은 상황극이 없습니다'),el('p',{class:'muted'},'상세 화면의 ‘담기’로 여러 상황극을 모을 수 있습니다.'),button('보관함으로',()=>goto('list'),'primary')),
      state.cart.length?list:null,
      state.cart.length?el('p',{class:'muted'},`합계 ${merged.length}자 · 약 ${C.estimateTokens(merged).toLocaleString('ko')}토큰 (추정)`):null,
      state.cart.length?button('담은 목록 비우기',async()=>{if(await confirmAction('담은 상황극을 모두 뺄까요?','비우기')){state.cart=[];await saveCart();render();}},'link'):null));
    if(!state.cart.length)return;
    const toCard=async()=>{
      const before=state.compose;state.compose=C.append(state.compose,merged);state.undo={before,after:state.compose};
      await rememberMode();goto('compose');
    };
    root.append(el('footer',{class:'bar'},button('인풋카드에 합치기',toCard,'primary'),
      state.context==='none'?null:button('바로 채팅에 추가',()=>commitToChat(merged,composeLabel()))));
  }
  /* ---------- dialogs ---------- */
  async function ask(title,initial=''){
    return new Promise(resolve=>{
      const dialog=el('dialog',{class:'dialog'}),input=el('input',{type:'text',required:'',maxlength:'80','aria-label':title});input.value=initial;
      const cancel=el('button',{type:'button',onClick:()=>dialog.close()},'취소');
      const form=el('form',{},el('h2',{},title),input,el('div',{class:'row end'},cancel,el('button',{type:'submit',class:'primary'},'확인')));
      let answer=null;
      form.addEventListener('submit',e=>{e.preventDefault();if(!input.value.trim())return;answer=input.value.trim();dialog.close();});
      dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);});dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();
    });
  }
  async function confirmAction(title,action){
    return new Promise(resolve=>{
      const dialog=el('dialog',{class:'dialog'});let yes=false;
      dialog.append(el('h2',{},title),el('div',{class:'row end'},el('button',{type:'button',onClick:()=>dialog.close()},'취소'),el('button',{type:'button',class:'primary',onClick:()=>{yes=true;dialog.close();}},action)));
      dialog.addEventListener('close',()=>{dialog.remove();resolve(yes);});document.body.append(dialog);dialog.showModal();
    });
  }
  async function pickOption(title,options){
    return new Promise(resolve=>{
      const dialog=el('dialog',{class:'dialog sheet','aria-label':title});let answer=null;
      const body=el('div',{class:'sheet-body'},el('h2',{},title));
      for(const [value,name] of options)body.append(el('button',{type:'button',onClick:()=>{answer=value;dialog.close();}},name));
      body.append(el('button',{type:'button',class:'link',onClick:()=>dialog.close()},'취소'));
      dialog.append(body);dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);});document.body.append(dialog);dialog.showModal();
    });
  }
  async function addFolder(redraw=true){
    const name=await ask('새 폴더 이름');if(!name)return;
    const f=C.folder(name,crypto.randomUUID());
    state.mod=await repo.mutate(mod=>{if(!mod)throw new Error('보관함을 다시 열어 주세요.');if(C.folders(mod).some(x=>x.comment===name))throw new Error('같은 이름의 폴더가 있습니다.');mod.lorebook.push(f);return mod;});
    if(state.draft){state.draft.folder=f.key;await saveDraft();}
    if(redraw)render();
  }
  async function renameFolder(){
    const f=C.folders(state.mod).find(x=>x.key===state.filter);if(!f)return;
    const name=await ask('폴더 이름 변경',f.comment);if(!name||name===f.comment)return;
    state.mod=await repo.mutate(mod=>{if(!mod)throw new Error('보관함을 다시 열어 주세요.');const actual=C.folders(mod).find(x=>x.key===f.key);
      if(!actual||actual.comment!==f.comment)throw new Error('폴더가 변경되었습니다. 다시 열어 주세요.');
      if(C.folders(mod).some(x=>x.key!==f.key&&x.comment===name))throw new Error('같은 이름의 폴더가 있습니다.');actual.comment=name;return mod;});render();
  }
  // Backup scopes: the whole library, the starred subset, or the folder in view.
  async function backup(){
    const mod=await repo.export();if(!mod)throw new Error('보관함을 찾지 못했습니다.');
    const folder=C.folders(state.mod).find(f=>f.key===state.filter);
    const scopes=[['all','전체 보관함',()=>mod,'scenario-library-backup.json']];
    if(state.prefs.favorites.length){
      const starred=new Set(state.prefs.favorites);
      scopes.push(['favorites',`즐겨찾기 ${C.entries(mod).filter(item=>starred.has(item.id)).length}개`,
        ()=>C.filterModule(mod,item=>starred.has(item.id)),'scenario-library-favorites.json']);
    }
    if(folder)scopes.push(['folder',`현재 폴더 · ${folder.comment}`,
      ()=>C.filterModule(mod,item=>item.folder===folder.key),`scenario-library-${folder.comment}.json`]);
    const chosen=scopes.length>1?await pickOption('백업 범위 고르기',scopes.map(([value,name])=>[value,name])):'all';
    if(!chosen)return;
    const [,,build,filename]=scopes.find(([value])=>value===chosen);
    const payload=build(),total=C.entries(payload).length;
    if(!total)throw new Error('이 범위에 저장할 상황극이 없습니다.');
    const a=el('a',{download:filename}),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.href=url;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
    toast(`${total}개를 담은 보관함 JSON을 내려받습니다.`);
  }
  async function refreshFromModule(){state.mod=await repo.refresh();state.shown=PAGE_STEP;state.selected=null;state.page='list';render();toast('상황극 서고 모듈에서 목록과 본문 캐시를 새로 읽었습니다.');}
  const formatBytes=bytes=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;
  async function openStorageManager(){
    const usage=await repo.usage(),dialog=el('dialog',{class:'dialog storage-dialog','aria-label':'플러그인 저장소 관리'});
    const close=()=>dialog.close();
    const cache=async()=>{if(!await confirmAction('목록 캐시를 비울까요? 모듈은 그대로이며 다음 실행 때 자동으로 복구됩니다.','캐시 비우기'))return;
      await repo.clearCache();close();toast('목록 캐시를 비웠습니다. 다음 실행 때 자동 복구됩니다.');};
    const all=async()=>{if(!await confirmAction('즐겨찾기·최근 기록·초안·대상 이름과 캐시를 모두 비울까요? 상황극 서고 모듈은 삭제되지 않습니다.','전체 비우기'))return;
      await repo.clearAll();state.prefs={favorites:[],recent:[],lastFolder:'',sort:'newest',adult:'all',targets:[],searches:[],cleanMode:'off'};state.draft=null;pendingClean=[];state.cart=[];close();toast('플러그인 저장소를 비웠습니다. 모듈은 그대로 보존됩니다.');render();};
    dialog.append(el('h2',{},'플러그인 저장소'),
      el('div',{class:'storage-meter'},el('strong',{},formatBytes(usage.bytes)),el('span',{class:'muted'},`${usage.keys}개 항목`)),
      el('dl',{class:'storage-breakdown'},el('div',{},el('dt',{},'목록·출처 메타데이터'),el('dd',{},formatBytes(usage.catalogBytes))),
        el('div',{},el('dt',{},'환경설정·초안 등'),el('dd',{},formatBytes(Math.max(0,usage.bytes-usage.catalogBytes))))),
      el('p',{class:'notice'},'상황극 본문은 모듈에만 저장됩니다. 캐시를 비워도 모듈은 삭제되지 않으며, 내장 seed와 모듈에서 목록·출처 정보가 다시 만들어집니다.'),
      el('div',{class:'storage-actions'},button('목록 캐시 비우기',cache),button('설정 포함 전체 비우기',all,'danger')),
      el('div',{class:'row end'},button('닫기',close,'primary')));
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }

  /* ---------- bulk import ---------- */
  async function chooseImport(){
    const input=el('input',{type:'file',accept:'application/json,.json',hidden:true});
    input.addEventListener('change',()=>run(async()=>{
      const file=input.files?.[0];if(!file)return;
      if(file.size>80*1024*1024)throw new Error('가져오기 파일은 80MB 이하여야 합니다. 원문 아카이브가 아닌 import 파일을 골라 주세요.');
      const parsed=JSON.parse(await file.text());
      state.importItems=C.validateImport(parsed).map(item=>({...item,importId:crypto.randomUUID()}));
      state.importCoverage=C.normalizeCoverage(parsed.coverage);
      let folder=C.folders(state.mod).find(item=>item.comment==='아카 가져오기');
      if(!folder){
        folder=C.folder('아카 가져오기',crypto.randomUUID());
        state.mod=await repo.mutate(mod=>{if(!mod)throw new Error('보관함을 다시 열어 주세요.');mod.lorebook.push(folder);return mod;});
      }
      state.importFolder=folder.key;state.importQuery='';state.importView='candidates';state.importSearchBody=false;state.importPage=0;goto('import');
    }));
    input.addEventListener('cancel',()=>input.remove());input.addEventListener('change',()=>input.remove(),{once:true});
    document.body.append(input);input.click();
  }
  function renderImport(){
    if(!state.importItems){goto('list');return;}
    root.append(shell('일괄 가져오기',iconButton('←','취소',()=>{state.importItems=null;state.importCoverage=null;goto('list');},'back'),[exitButton()]));
    root.append(errorBox);
    const pageSize=50;
    const query=el('input',{type:'search',placeholder:'제목으로 검색','aria-label':'가져오기 검색'});query.value=state.importQuery;
    const list=el('div',{class:'import-list'}),count=el('p',{class:'muted'}),pager=el('nav',{class:'pager','aria-label':'가져오기 페이지'});
    const tabs=el('div',{class:'import-tabs','aria-label':'가져오기 보기'});
    const tabButtons={};
    for(const [key,name] of [['candidates','추천 후보'],['selected','선택됨'],['all','전체']]){
      tabButtons[key]=button(name,()=>{state.importView=key;state.importPage=0;draw();});tabs.append(tabButtons[key]);
    }
    const bodySearch=button('본문 검색 꺼짐',()=>{state.importSearchBody=!state.importSearchBody;bodySearch.textContent=state.importSearchBody?'본문 검색 켜짐':'본문 검색 꺼짐';bodySearch.setAttribute('aria-pressed',String(state.importSearchBody));state.importPage=0;draw();},'filter-toggle');
    bodySearch.setAttribute('aria-pressed','false');
    const selectVisible=button('',()=>{filtered().forEach(item=>item.selected=true);draw();},'link');
    const clearVisible=button('',()=>{filtered().forEach(item=>item.selected=false);draw();},'link');
    const filtered=()=>{
      const q=state.importQuery.trim().toLocaleLowerCase();
      return state.importItems.filter(item=>(state.importView==='all'||(state.importView==='candidates'&&item.candidate)||(state.importView==='selected'&&item.selected))&&
        (!q||item.title.toLocaleLowerCase().includes(q)||(state.importSearchBody&&item.content.toLocaleLowerCase().includes(q))));
    };
    const draw=()=>{
      for(const [key,control] of Object.entries(tabButtons)){control.classList.toggle('active',state.importView===key);control.setAttribute('aria-pressed',String(state.importView===key));}
      list.replaceChildren();pager.replaceChildren();
      const items=filtered(),selected=state.importItems.filter(item=>item.selected).length,pages=Math.max(1,Math.ceil(items.length/pageSize));
      state.importPage=Math.min(state.importPage,pages-1);
      const shown=items.slice(state.importPage*pageSize,(state.importPage+1)*pageSize);
      count.textContent=`파일 ${state.importItems.length}개 · 현재 ${items.length}개 · 선택 ${selected}개`;
      selectVisible.textContent=`현재 ${items.length}개 선택`;clearVisible.textContent=`현재 ${items.length}개 해제`;
      for(const item of shown){
        const box=el('input',{type:'checkbox','aria-label':item.title});box.checked=item.selected;
        box.addEventListener('change',()=>{item.selected=box.checked;draw();});
        const badges=el('span',{class:'import-badges'},item.isSensitive?el('span',{class:'tag adult'},'19+'):null,el('span',{class:'tag'},item.candidate?'상황극 후보':'일반 로어북'));
        const meta=[item.createdAt?.slice(0,10),item.author].filter(Boolean).join(' · ');
        list.append(el('article',{class:'import-row'},box,button('',()=>previewImport(item),'import-open'),badges));
        const opener=list.lastChild.querySelector('.import-open');opener.append(el('strong',{},item.title),meta?el('span',{class:'import-meta'},meta):null,el('span',{class:'r-sum'},item.content));
      }
      const prev=button('← 이전',()=>{state.importPage-=1;draw();});prev.disabled=state.importPage===0;
      const next=button('다음 →',()=>{state.importPage+=1;draw();});next.disabled=state.importPage>=pages-1;
      pager.append(prev,el('span',{class:'page-count'},`${state.importPage+1} / ${pages}`),next);
    };
    let searchTimer;query.addEventListener('input',()=>{state.importQuery=query.value;state.importPage=0;clearTimeout(searchTimer);searchTimer=setTimeout(draw,state.importSearchBody?300:80);});draw();
    const foldersSelect=el('select',{'aria-label':'가져올 폴더'});
    for(const folder of C.folders(state.mod)){const option=el('option',{value:folder.key},folder.comment);option.selected=folder.key===state.importFolder;foldersSelect.append(option);}
    foldersSelect.addEventListener('change',()=>{state.importFolder=foldersSelect.value;});
    const commit=async()=>{
      const chosen=state.importItems.filter(item=>item.selected);if(!chosen.length&&!state.importCoverage)throw new Error('가져올 글을 하나 이상 선택해 주세요.');
      if(chosen.length>100&&!await confirmAction(`${chosen.length}개를 모듈에 가져올까요? 저장 용량이 커질 수 있습니다.`,'가져오기'))return;
      let report;
      state.mod=await repo.mutate(mod=>{if(!mod)throw new Error('보관함을 다시 열어 주세요.');report=C.importEntries(mod,chosen,state.importFolder,state.importCoverage);return report.module;});
      state.filter=state.importFolder;state.importItems=null;state.importCoverage=null;state.shown=PAGE_STEP;goto('list');toast(`${report.added}개를 가져왔습니다. 중복 ${report.duplicates}개는 건너뛰었습니다.`);
    };
    root.append(el('section',{class:'panel'},
      el('p',{class:'notice'},'상황극 후보만 기본 선택되어 있습니다. 제목과 내용을 확인한 뒤 저장할 항목을 고르세요.'),tabs,
      el('div',{class:'search-row'},query,bodySearch),el('div',{class:'batch-row'},selectVisible,clearVisible),count,list,pager,label('저장할 폴더',foldersSelect)));
    root.append(el('footer',{class:'bar'},button(state.importCoverage?'선택 반영 및 수집 기준 저장':'선택한 글 가져오기',commit,'primary')));
  }
  function previewImport(item){
    const dialog=el('dialog',{class:'dialog import-preview'}),source=el('a',{href:item.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'원문 열기');
    dialog.append(el('div',{class:'row'},el('h2',{class:'grow'},item.title),item.isSensitive?el('span',{class:'tag adult'},'19+'):null),
      el('p',{class:'muted'},[item.createdAt?.slice(0,10),item.author].filter(Boolean).join(' · ')),el('pre',{class:'preview open'},item.content),
      el('footer',{class:'bar'},source,button(item.selected?'선택 해제':'선택',()=>{item.selected=!item.selected;dialog.close();render();},'primary'),button('닫기',()=>dialog.close())));
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||document.querySelector('dialog[open]'))return;
    if(state.page!=='list'&&state.page!=='import'){goto('list');return;}
    exitNow();
  });
  await ensureDatabasePermission();
  if(canAutoClean){
    const queued=await load(PENDING_CLEAN_KEY,[]);
    // Entries older than a week point at chats the user has moved past.
    pendingClean=(Array.isArray(queued)?queued:[]).filter(p=>p&&p.key&&p.messageId&&Date.now()-(p.addedAt||0)<7*24*3600*1000);
    await api.addRisuChatListener('output',event=>handleOutput(event));
  }
  try{await api.unregisterUIPart(LEGACY_ENTRY_ID);}catch(e){}
  registrations.push(await api.registerButton({name:'상황극 탐색기',icon:ENTRY_BADGE,iconType:'html',location:'chat',id:ENTRY_ID},()=>run(open)));
  registrations.push(await api.registerSetting('상황극 탐색기',()=>run(open),ENTRY_BADGE,'html'));
  await api.onUnload(async()=>{clearTimeout(draftTimer);listObserver?.disconnect();for(const r of registrations)if(r?.id)await api.unregisterUIPart(r.id);});
})().catch(e=>{console.error('[scenario-library]',e);});
