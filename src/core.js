/* Shared by the importable plugin and its tests. No host side effects. */
(function (root) {
  'use strict';
  const MODULE_ID = '4e97d516-4b97-45bc-b0b2-1e0cd0a4c34a';
  const MODULE_NAMESPACE = 'risuai-scenario-library';
  const MODULE_NAME = '상황극 서고';
  const DEFAULTS = ['일상·코미디', '로맨스', '갈등·화해', '사건·모험', '성인', '기타'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const base = () => ({key:'', secondkey:'', insertorder:100, alwaysActive:false, selective:false, mode:'normal', bookVersion:2});
  const folder = (name, id) => ({...base(), mode:'folder', key:'\uf000folder:' + id, comment:name, content:'', id});
  function normalizeCoverage(value) {
    if(!value || value.source!=='arca.live')return null;
    const scannedAt=typeof value.scannedAt==='string'?value.scannedAt:'';
    const newestArticleId=String(value.newestArticleId||'').trim();
    const newestCreatedAt=typeof value.newestCreatedAt==='string'?value.newestCreatedAt:'';
    if(!scannedAt||!newestArticleId||!newestCreatedAt)return null;
    return {source:'arca.live',board:value.board||'characterai',category:value.category||'로어북',scannedAt,
      newestArticleId,newestCreatedAt,checkedArticles:Math.max(0,Number(value.checkedArticles)||0)};
  }
  function mergeCoverage(current,next) {
    const a=normalizeCoverage(current),b=normalizeCoverage(next);
    if(!a)return b;if(!b)return a;
    return Date.parse(b.scannedAt)>=Date.parse(a.scannedAt)?b:a;
  }
  function cleanInput(value) {
    let text=String(value||'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n')
      .replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    // Arca series posts commonly put their actual payload after a ▼ / ▲ divider.
    const divider=/\n\s*▼\s*\n\s*▲\s*\n/g;let match,last=-1;
    while((match=divider.exec(text)))last=match.index+match[0].length;
    if(last>=0)text=text.slice(last).trim();
    // Author chatter and language labels belong to the post, not to the prompt.
    // Cut only at an explicit line-level OOC marker; prompt-internal prose remains untouched.
    const markers=[/^\s*[\[(]\s*OOC\s*:/im,/^\s*OOC\s*:/im];
    let start=-1;
    for(const marker of markers){const found=text.search(marker);if(found>=0&&(start<0||found<start))start=found;}
    if(start>0)text=text.slice(start).trim();
    return text.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function seedEntry(item, folderKey) {
    return {...base(),id:'scenario-arca-'+item.sourceArticleId,comment:item.title,content:cleanInput(item.content),folder:folderKey};
  }
  function sourceId(item) {
    const explicit=String(item?.scenarioLibrarySource?.sourceArticleId||'').trim();
    if(explicit)return explicit;
    const match=String(item?.id||'').match(/^scenario-arca-(\d+)$/);return match?.[1]||'';
  }
  function sourceMeta(item, importedAt=null) {
    const id=String(item.sourceArticleId||'').trim();
    return {source:'arca.live',sourceArticleId:id,sourceUrl:item.sourceUrl||`https://arca.live/b/characterai/${id}`,
      author:item.author||null,createdAt:item.createdAt||null,isSensitive:Boolean(item.isSensitive),
      importedAt:item.collectedAt||importedAt||null,rawHtmlSha256:item.rawHtmlSha256||null};
  }
  function decorateEntry(entry,item,importedAt=null) {
    const result=clone(entry);result.scenarioLibrarySummary=item.summary||'';result.scenarioLibrarySource=sourceMeta(item,importedAt);return result;
  }
  function standardizeModule(mod) {
    const result=clone(mod);
    delete result.scenarioLibraryCoverage;delete result.scenarioLibrarySeedVersion;delete result.scenarioLibraryStorage;
    for(const item of result.lorebook||[]){delete item.scenarioLibrarySummary;delete item.scenarioLibrarySource;}
    return result;
  }
  function hydrateSeed(mod, seed={version:0,entries:[]}) {
    const result=standardizeModule(mod);
    const byName=new Map(folders(result).map(item=>[item.comment,item]));
    DEFAULTS.forEach((name,index)=>{if(!byName.has(name)){const item=folder(name,'scenario-folder-'+index);result.lorebook.push(item);byName.set(name,item);}});
    const existingBySource=new Map(entries(result).flatMap(item=>{const id=sourceId(item);return id?[[id,item]]:[];}));
    for(const item of seed.entries||[]){
      const sourceId=String(item.sourceArticleId||'');if(!sourceId)continue;
      const existing=existingBySource.get(sourceId);
      if(existing)continue;
      if(!String(item.content||'').trim())continue;
      const target=byName.get(item.category)||byName.get('기타');result.lorebook.push(seedEntry(item,target.key));
      existingBySource.set(sourceId,result.lorebook.at(-1));
    }
    return result;
  }
  function newModule(seed) {
    const mod={id:MODULE_ID, namespace:MODULE_NAMESPACE, name:MODULE_NAME, description:'상황극 지침 저장소. 상황극 탐색기에서 검색하고 선택해 현재 채팅에 넣습니다. 자동 발동하지 않습니다.',
      lorebook:DEFAULTS.map((name,i) => folder(name, 'scenario-folder-' + i))};
    return hydrateSeed(mod,seed);
  }
  function isLibraryModule(mod) {
    if(!mod || !Array.isArray(mod.lorebook))return false;
    if(mod.namespace===MODULE_NAMESPACE || mod.id===MODULE_ID)return true;
    return mod.name===MODULE_NAME && mod.lorebook.some(item=>item?.mode==='folder' && item?.key==='\uf000folder:scenario-folder-0');
  }
  function folders(mod) { return mod.lorebook.filter(x => x.mode === 'folder'); }
  function entries(mod) { return mod.lorebook.filter(x => x.mode !== 'folder'); }
  function suggestTitle(body) {
    const match = body.match(/^\s*(?:#{1,6}\s*)?(?:\*\*)?Scenario\s*:\s*(.+)$/im);
    return (match ? match[1].replace(/[\s*`]+$/g,'') : body.split('\n').find(s=>s.trim()) || '').trim().slice(0,120);
  }
  function convert(body, simulation, target) {
    if (!simulation) return body;
    const name = target.trim();
    if (!name) throw new Error('대상 이름을 입력해 주세요.');
    return body.replace(/\{\{char\}\}/gi, () => name);
  }
  function append(before, body, replace=false) {return replace || !before ? body : before + '\n\n' + body;}
  function validateImport(payload) {
    if(!payload || payload.format!=='scenario-library-import' || payload.version!==1 || !Array.isArray(payload.entries))
      throw new Error('상황극 보관함 가져오기 파일이 아닙니다.');
    if(payload.entries.length>10000) throw new Error('한 번에 10,000개보다 많은 항목은 가져올 수 없습니다.');
    return payload.entries.map((item,index)=>{
      const title=typeof item.title==='string'?item.title.trim():'';
      const content=typeof item.content==='string'?item.content:'';
      const sourceArticleId=String(item.sourceArticleId||'').trim();
      const sourceUrl=typeof item.sourceUrl==='string'?item.sourceUrl:'';
      if(!title || !content.trim() || !sourceArticleId || !/^https:\/\/arca\.live\//.test(sourceUrl))
        throw new Error(`${index+1}번째 가져오기 항목의 형식이 올바르지 않습니다.`);
      return {...item,title:title.slice(0,120),content,sourceArticleId,sourceUrl,
        selected:item.selected!==false,candidate:Boolean(item.candidate)};
    });
  }
  function importEntries(mod, items, folderKey, coverage=null) {
    const result=clone(mod);
    if(!folders(result).some(item=>item.key===folderKey)) throw new Error('가져올 폴더가 변경되었습니다. 다시 선택해 주세요.');
    const known=new Set(entries(result).map(sourceId).filter(Boolean));
    let added=0,duplicates=0;
    for(const item of items) {
      if(known.has(item.sourceArticleId)){duplicates+=1;continue;}
      result.lorebook.push(decorateEntry({...base(),id:'scenario-arca-'+item.sourceArticleId,comment:item.title,
        content:cleanInput(item.content),folder:folderKey},item,new Date().toISOString()));
      known.add(item.sourceArticleId);added+=1;
    }
    result.scenarioLibraryCoverage=mergeCoverage(result.scenarioLibraryCoverage,coverage);
    return {module:result,added,duplicates};
  }
  function saveEntry(mod, draft, expected=null) {
    const result = clone(mod);
    if (!draft.comment.trim() || !draft.content.trim()) throw new Error('제목과 본문을 입력해 주세요.');
    if (!folders(result).some(f => f.key === draft.folder)) throw new Error('폴더가 변경되었습니다. 다시 선택해 주세요.');
    const index = result.lorebook.findIndex(x => x.id === draft.id);
    if (expected && (index < 0 || JSON.stringify(result.lorebook[index]) !== JSON.stringify(expected)))
      throw new Error('다른 곳에서 이 항목을 수정했습니다. 본문을 복사해 보관한 뒤 다시 열어 주세요.');
    if (!expected && index >= 0) throw new Error('같은 ID의 항목이 이미 존재합니다.');
    const entry = {...(expected || {}), ...base(), id:draft.id, comment:draft.comment.trim(), content:draft.content,folder:draft.folder};
    if (index < 0) result.lorebook.push(entry); else result.lorebook[index] = entry;
    return result;
  }
  // The public API writes a whole module array. Re-read immediately before write,
  // reject a changed snapshot, and verify acknowledgement; never retry a write blindly.
  class Repository {
    constructor(api,seed={version:0,entries:[]}) {this.api=api;this.seed=seed;this.busy=false;}
    async readModules() {
      const db=await this.api.getDatabase(['modules']);
      if (!db || !Array.isArray(db.modules)) throw new Error('모듈 읽기 권한이 필요합니다. Risu 권한 창을 확인해 주세요.');
      return clone(db.modules);
    }
    find(modules) {
      const found=modules.filter(isLibraryModule);
      if(found.length>1) throw new Error('상황극 서고 모듈이 중복되어 있습니다. 모듈 설정에서 확인해 주세요.');
      const mod=found[0];
      if(mod && !Array.isArray(mod.lorebook)) throw new Error('보관함의 로어북 형식이 올바르지 않습니다.');
      return mod;
    }
    async read() { return this.find(await this.readModules()); }
    async mutate(transform) {
      if(this.busy) throw new Error('저장 중입니다. 잠시만 기다려 주세요.');
      this.busy=true;
      try {
        const modules=await this.readModules();
        const mod=this.find(modules);
        const next=transform(mod ? clone(mod) : null);
        if(mod && JSON.stringify(mod)===JSON.stringify(next)) return mod;
        const fresh=await this.readModules();
        if(JSON.stringify(fresh)!==JSON.stringify(modules)) throw new Error('모듈이 변경되었습니다. 다시 저장해 주세요.');
        const idx=mod ? modules.findIndex(x=>x.id===mod.id) : -1;
        if(idx<0)modules.push(next);else modules[idx]=next;
        await this.api.setDatabaseLite({modules});
        const saved=await this.read();
        if(JSON.stringify(saved)!==JSON.stringify(next)) throw new Error('저장 결과를 확인하지 못했습니다. 다시 열어 확인해 주세요.');
        return saved;
      } finally {this.busy=false;}
    }
    async initialize() {return this.mutate(mod=>hydrateSeed(mod || newModule(),this.seed));}
  }
  async function chatContext(api) {
    let ci=await api.getCurrentCharacterIndex();
    const ti=await api.getCurrentChatIndex(),char=await api.getCharacter();
    // New stock builds may expose selected character UUID while the indexed
    // chat methods still require an ordinal. Resolve via the documented DB API.
    if(typeof ci!=='number') {
      const db=await api.getDatabase(['characters']);
      if(!db?.characters) throw new Error('캐릭터 목록을 읽지 못했습니다.');
      ci=Array.isArray(db.characters) ? db.characters.findIndex(c=>c.chaId===char?.chaId)
        : Object.keys(db.characters).indexOf(char?.chaId);
    }
    if(!Number.isInteger(ci)||ci<0) throw new Error('현재 대화를 찾지 못했습니다.');
    const indexed=await api.getCharacterFromIndex(ci);
    if(indexed?.chaId!==char?.chaId) throw new Error('대화가 변경되었습니다. 다시 열어 주세요.');
    const chat=await api.getChatFromIndex(ci,ti);
    if(!char?.chaId || !chat || !Array.isArray(chat.message)) throw new Error('대화를 먼저 열어 주세요.');
    return {ci,ti,charId:char.chaId,chatId:chat.id || null, key:JSON.stringify([char.chaId,chat.id || 'index:'+ti]),chat:clone(chat)};
  }
  async function addUserMessage(api, expectedContext, content, messageId) {
    if(!content.trim()) throw new Error('추가할 내용이 없습니다.');
    const first=await chatContext(api);
    if(first.key!==expectedContext) throw new Error('대화가 변경되었습니다. 보관함을 다시 열어 주세요.');
    const existing=first.chat.message.find(m=>m.chatId===messageId);
    if(existing) {
      if(existing.role!=='user'||existing.data!==content) throw new Error('메시지 ID가 충돌했습니다. 채팅을 확인해 주세요.');
      return {duplicate:true};
    }
    const fresh=await chatContext(api);
    if(fresh.key!==first.key || JSON.stringify(fresh.chat)!==JSON.stringify(first.chat))
      throw new Error('대화 내용이 변경되고 있습니다. 응답이 끝난 뒤 다시 시도해 주세요.');
    const next=clone(fresh.chat);
    next.message.push({role:'user',data:content,time:Date.now(),chatId:messageId});
    await api.setChatToIndex(fresh.ci,fresh.ti,next);
    const saved=await api.getChatFromIndex(fresh.ci,fresh.ti);
    const actual=saved?.message?.find(m=>m.chatId===messageId);
    if(!actual || actual.role!=='user' || actual.data!==content)
      throw new Error('추가 결과를 확인하지 못했습니다. 채팅을 확인한 뒤 다시 시도해 주세요.');
    return {duplicate:false};
  }
  // One-shot instructions: remove the plugin's own user message once a model
  // reply exists after it. Uses stored ci/ti so it works even when the user has
  // navigated elsewhere, and follows the same read-verify-write discipline.
  async function removeUserMessage(api, ci, ti, expectedKey, messageId) {
    const read=async()=>{const chat=await api.getChatFromIndex(ci,ti);
      if(!chat || !Array.isArray(chat.message)) throw new Error('대화를 읽지 못했습니다.');return chat;};
    const first=await read();
    const char=await api.getCharacterFromIndex(ci);
    if(JSON.stringify([char?.chaId,first.id||'index:'+ti])!==expectedKey) return {removed:false,reason:'moved'};
    const index=first.message.findIndex(m=>m.chatId===messageId && m.role==='user');
    if(index<0) return {removed:false,reason:'missing'};
    if(!first.message.slice(index+1).some(m=>m.role==='char')) return {removed:false,reason:'waiting'};
    const fresh=await read();
    if(JSON.stringify(fresh)!==JSON.stringify(first)) return {removed:false,reason:'busy'};
    const next=clone(fresh);next.message.splice(index,1);
    await api.setChatToIndex(ci,ti,next);
    const saved=await read();
    if(saved.message.some(m=>m.chatId===messageId))
      throw new Error('지침 삭제 결과를 확인하지 못했습니다. 채팅을 확인해 주세요.');
    return {removed:true};
  }
  root.ScenarioCore = {MODULE_ID, MODULE_NAMESPACE, MODULE_NAME, DEFAULTS, clone, folder, folders, entries, isLibraryModule, normalizeCoverage, mergeCoverage, cleanInput,
    seedEntry,sourceId,sourceMeta,decorateEntry,standardizeModule,hydrateSeed,newModule,suggestTitle,convert,append,validateImport,
    importEntries,saveEntry,Repository,chatContext,addUserMessage,removeUserMessage};
  if(typeof module !== 'undefined' && module.exports) module.exports=root.ScenarioCore;
})(globalThis);
