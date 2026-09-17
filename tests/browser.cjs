const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const plugin=fs.readFileSync(path.join(__dirname,'../dist/scenario-library-runtime.plugin.js'),'utf8');
const purify=fs.readFileSync(require.resolve('dompurify/dist/purify.min.js'),'utf8');
assert(plugin.includes('//@version '+require('../package.json').version),'plugin version matches package metadata');
const packed=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/scenario-library.storage.json'),'utf8'));
const storageFixture={[packed.key]:JSON.stringify(packed.catalog)};
const moduleFixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/scenario-library.module.json'),'utf8'));
const folderNames=new Map(moduleFixture.lorebook.filter(x=>x.mode==='folder').map(x=>[x.key,x.comment]));
const totalCount=moduleFixture.lorebook.filter(x=>x.mode!=='folder').length,adultCount=moduleFixture.lorebook.filter(x=>x.mode!=='folder'&&folderNames.get(x.folder)==='성인').length;
const rows=page=>page.locator('.row-item');
const count=page=>page.locator('.result-count');
const waitCount=(page,text)=>page.waitForFunction(t=>document.querySelector('.result-count')?.textContent.includes(t),text);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const results=[];
 try{for(const width of [1100,800,390]){
  const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const noOverflow=async where=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow: '+where);
  await page.route('https://scenario.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><head></head><body></body></html>'}));
  await page.goto('https://scenario.test/');
  await page.evaluate(fixture=>{
   const storage=structuredClone(fixture.storage);window.testHost={modules:[{id:'other',name:'untouched',lorebook:[]},structuredClone(fixture.module)],chat:{id:'chat-1',message:[{role:'char',data:'Hello'}],scriptstate:{$keep:'yes'}},shows:0,hides:0,writes:0,sends:0,dbReads:0,storage,character:'char-1',delayCatalog:true,unregistered:[],permissionRequests:[],alerts:[]};
   const h=window.testHost;window.Risuai={
    getDatabase:async()=>{h.dbReads++;return{modules:structuredClone(h.modules)}},setDatabaseLite:async p=>{h.modules=structuredClone(p.modules);},
    getCharacter:async()=>({chaId:h.character}),getCharacterFromIndex:async()=>({chaId:h.character}),getCurrentCharacterIndex:async()=>0,getCurrentChatIndex:async()=>0,
    getChatFromIndex:async()=>structuredClone(h.chat),setChatToIndex:async(a,b,c)=>{h.writes++;h.chat=structuredClone(c)},
    pluginStorage:{getItem:async k=>{if(k==='scenario.v4.catalog'&&h.delayCatalog)await new Promise(resolve=>h.releaseCatalog=resolve);return storage[k]??null;},setItem:async(k,v)=>{storage[k]=v},removeItem:async k=>{delete storage[k]},keys:async()=>Object.keys(storage),length:async()=>Object.keys(storage).length,clear:async()=>{for(const key of Object.keys(storage))delete storage[key]}},
    requestPluginPermission:async permission=>{h.permissionRequests.push({permission,shows:h.shows});return true},
    showContainer:async()=>{h.shows++;document.body.style.display=''},hideContainer:async()=>{h.hides++;document.body.style.display='none'},
    registerButton:async(arg,cb)=>{h.buttonConfig=structuredClone(arg);h.open=cb;return{id:'button'}},registerSetting:async()=>({id:'setting'}),onUnload:async()=>{},unregisterUIPart:async id=>{h.unregistered.push(id)},sendChat:async()=>{h.sends++}
   };
  },{storage:storageFixture,module:moduleFixture});
  await page.addScriptTag({content:plugin});await page.waitForFunction(()=>!!window.testHost.open);
  assert.deepEqual(await page.evaluate(()=>testHost.permissionRequests),[{permission:'db',shows:0}],'DB permission is requested during plugin startup, before any overlay opens');
  // The button beside the chat textarea toggles DefaultChatScreen's own menu, and that menu
  // renders additionalChatMenu only. location 'hamburger' feeds additionalHamburgerMenu, which
  // Sidebar.svelte paints in the left icon rail instead, so the entry has to say 'chat'.
  const entry=await page.evaluate(()=>testHost.buttonConfig);assert.equal(entry.name,'상황극 탐색기');assert.equal(entry.location,'chat');assert.equal(entry.iconType,'html');assert.equal(entry.id,'scenario-library-chat-entry');assert(entry.icon.includes('<svg'),'chat menu entry has a badge icon');
  assert.equal(await page.evaluate(()=>testHost.unregistered[0]),'scenario-library-entry','the old sidebar registration is dropped before re-registering');

  assert.equal(await page.evaluate(()=>testHost.shows),0,'no automatic opening');
  await page.evaluate(()=>{testHost.open();});await page.getByRole('button',{name:'상황극 탐색기 닫기'}).click();
  assert.equal(await page.evaluate(()=>testHost.hides),1,'loading screen can always be closed');
  await page.evaluate(()=>{testHost.delayCatalog=false;testHost.releaseCatalog();document.body.style.display='';testHost.hides=0;});
  await page.getByLabel('상황극 검색').waitFor();
  assert.equal(await page.evaluate(()=>testHost.dbReads),0,'opening uses the cache without cloning the module database');
  assert.match(await page.getByLabel('상황극 서고 수집 범위').innerText(),/탭 확인 2026-09-17 · 당시 최신 #183252058 \(2026-09-17\) · 저장 532개/);

  // Replay the host's own render path: DefaultChatScreen's menu row wrapping PluginDefinedIcon,
  // which sanitises the icon with DOMPurify and confines it to a 20px box. Anything the plugin
  // relies on that this sanitiser strips would leave an empty square in the live menu.
  await page.addScriptTag({content:purify});
  const badge=await page.evaluate(async()=>{
   const clean=DOMPurify.sanitize(testHost.buttonConfig.icon,{
    FORBID_TAGS:['script','style','iframe','object','embed'],
    FORBID_ATTR:['onerror','onclick','onload','onmouseover','style','class']
   });
   const row=document.createElement('div');
   row.id='chat-menu-replica';
   row.setAttribute('style','position:fixed;left:0;bottom:0;display:flex;align-items:center;color:#e5e7eb;background:#23222c;padding:12px;z-index:2147483647;');
   const box=document.createElement('div');
   box.setAttribute('style','width:20px;height:20px;color:#e5e7eb;');
   box.innerHTML=clean;
   const label=document.createElement('span');
   label.textContent=testHost.buttonConfig.name;
   label.setAttribute('style','margin-left:8px;');
   row.append(box,label);
   row.onclick=()=>testHost.open();
   document.body.append(row);
   const svg=box.querySelector('svg');
   if(!svg)return{survived:false};
   const rect=svg.getBoundingClientRect();
   // Rasterise exactly what the menu paints and measure how much of the 20px box carries ink,
   // because a badge that survives sanitising can still be invisible at mobile icon size.
   const size=20,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
   const ctx=canvas.getContext('2d');
   const markup=new XMLSerializer().serializeToString(svg).replace(/currentColor/g,'#e5e7eb');
   await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,size,size);resolve()};img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup)});
   const data=ctx.getImageData(0,0,size,size).data;let inked=0;
   for(let i=0;i<data.length;i+=4)if(data[i+3]>40)inked++;
   return{survived:true,shapes:svg.querySelectorAll('rect,path,circle,polygon,line').length,width:rect.width,height:rect.height,ink:inked/(size*size)};
  });
  assert.equal(badge.survived,true,'the badge svg survives the host sanitiser');
  assert(badge.shapes>=2,'the badge keeps its shapes after sanitising: '+badge.shapes);
  assert(badge.width>=16&&badge.height>=16,'the badge fills the 20px icon box: '+badge.width+'x'+badge.height);
  assert(badge.ink>=0.2,'the badge is legible at mobile icon size: '+badge.ink);
  await page.screenshot({path:path.join(__dirname,`../artifacts/chat-menu-entry-${width}.png`),clip:{x:0,y:844-56,width:Math.min(width,260),height:56}});
  // The row itself is the only thing the user can press, so it must open the explorer.
  const showsBefore=await page.evaluate(()=>testHost.shows);
  await page.locator('#chat-menu-replica').click();
  await page.waitForFunction(n=>testHost.shows>n,showsBefore);
  await page.getByLabel('상황극 검색').waitFor();
  await page.evaluate(n=>{document.getElementById('chat-menu-replica').remove();testHost.shows=n},showsBefore);
    const appBox=await page.locator('.app').boundingBox();
  if(width>=700){assert(appBox.width<width&&appBox.height<844,'tablet and desktop use a centered panel');await page.mouse.click(4,4);assert.equal(await page.evaluate(()=>testHost.hides),1,'desktop backdrop closes the panel');await page.evaluate(async()=>{document.body.style.display='';testHost.hides=0;await testHost.open();});await page.getByLabel('상황극 검색').waitFor();}
  if(width>=700){const backdrop=await page.evaluate(()=>({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,filter:getComputedStyle(document.body).backdropFilter||getComputedStyle(document.body).webkitBackdropFilter}));assert.equal(backdrop.html,'rgba(0, 0, 0, 0)');assert.equal(backdrop.body,'rgba(0, 0, 0, 0)');assert.equal(backdrop.filter,'none','tablet/desktop area outside the panel is fully transparent');}

  // The bundled library opens on a short first page and grows on demand.
  await waitCount(page,`${totalCount}개 중 30개 표시`);
  assert.equal(await rows(page).count(),30);
  assert.equal(await page.getByLabel('19금 표시').inputValue(),'all','18+ material is listed by default');
  await noOverflow('list');
  await page.getByRole('button',{name:/더 보기/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.row-item').length>30);
  // Tapping and scrolling may both add a page; what matters is that the tap is
  // never swallowed and the header keeps telling the truth about the list.
  const grown=await rows(page).count();
  assert(grown>30&&grown%30===0,'load more appends whole pages: '+grown);
  assert((await count(page).innerText()).includes(`${totalCount}개 중 ${grown}개 표시`));
  await page.evaluate(()=>{const app=document.querySelector('.app');if(innerWidth>=700)app.scrollTo(0,app.scrollHeight);else scrollTo(0,document.body.scrollHeight);});
  await page.waitForFunction(n=>document.querySelectorAll('.row-item').length>n,grown);
  assert((await count(page).innerText()).includes(`${totalCount}개 중 ${await rows(page).count()}개 표시`));
  await page.evaluate(()=>{const app=document.querySelector('.app');if(innerWidth>=700)app.scrollTo(0,0);else scrollTo(0,0);});

  // The adult filter is a user choice in both directions and never loses entries.
  await page.getByLabel('19금 표시').selectOption('only');await waitCount(page,`${adultCount}개`);
  await page.getByLabel('19금 표시').selectOption('hide');await waitCount(page,`${totalCount-adultCount}개`);
  await page.getByLabel('19금 표시').selectOption('all');await waitCount(page,`${totalCount}개`);

  // Favourites are reachable as their own filter with a live count.
  await page.locator('.star').first().click();
  await page.getByRole('button',{name:/^★ 즐겨찾기/}).click();
  await waitCount(page,'1개 중 1개 표시');
  await page.getByRole('button',{name:/^전체/}).click();await waitCount(page,`${totalCount}개`);

  await page.getByLabel('상황극 검색').fill('37분');
  await page.locator('.pick').filter({hasText:'37분'}).first().click();
  await page.getByLabel('간략한 상황극 줄거리').waitFor();
  assert((await page.getByLabel('간략한 상황극 줄거리').innerText()).length>20);
  const sourceHref=await page.getByRole('link',{name:'원문 ↗'}).getAttribute('href');assert.match(sourceHref,/^https:\/\/arca\.live\/b\/characterai\/[0-9]+$/);
  await page.evaluate(()=>{window.open=()=>null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{testHost.copiedSource=value}}});});
  await page.evaluate(()=>document.querySelector('.source-link').click());await page.waitForFunction(()=>!!testHost.copiedSource);assert.equal(await page.evaluate(()=>testHost.copiedSource),sourceHref);
  assert((await page.getByRole('status').innerText()).includes('원문 주소를 복사했습니다.'));
  const cleanedSeed=await page.getByLabel('채팅에 들어갈 본문').textContent();
  assert(cleanedSeed.startsWith('[OOC:'),'post chatter is removed before input');
  assert(!cleanedSeed.includes('CHAR가 보내는 문자'),'post preface does not reach the chat');
  await page.getByRole('button',{name:'보관함으로'}).click();

  await page.getByRole('button',{name:'직접 저장',exact:true}).first().click();
  const original='[OOC: Keep current relationships.]\n### **Scenario: The Unending Authentication**\n{{user}} watches {{char}} fail authentication.\n{{CHAR}} sighs. Character and Char stay literal. {{charisma}} too.\n<script>window.BAD=true</script>';
  await page.getByRole('textbox',{name:'상황극 본문',exact:true}).fill(original);
  assert.equal(await page.getByLabel('제목 · Scenario 제목을 자동으로 제안합니다').inputValue(),'The Unending Authentication');
  await page.getByRole('button',{name:'로맨스',exact:true}).click();
  await noOverflow('edit');
  await page.getByRole('button',{name:'저장',exact:true}).click();

  // Two plain radios replace the ambiguous switch; only exact {{char}} changes.
  await page.getByRole('radio',{name:/시뮬봇/}).click();
  await page.getByRole('textbox',{name:'시뮬봇 대상 이름'}).fill('$&백리설화');
  const preview=page.getByLabel('채팅에 들어갈 본문');
  await page.waitForFunction(()=>document.querySelector('.preview')?.textContent.includes('$&백리설화 sighs.'));
  const converted=await preview.textContent();
  assert(converted.includes('{{user}} watches $&백리설화 fail authentication.'),'exact tokens replaced literally');
  assert(converted.includes('$&백리설화 sighs.'),'uppercase token replaced too');
  assert(!converted.includes('{{CHAR}}')&&!converted.includes('{{char}}'));
  assert(converted.includes('Character and Char stay literal.')&&converted.includes('{{charisma}}'),'lookalikes preserved');
  assert.equal(await page.evaluate(()=>window.BAD),undefined);
  const stored=await page.evaluate(()=>{const catalog=JSON.parse(testHost.storage['scenario.v4.catalog']),item=catalog.lorebook.find(x=>x.comment==='The Unending Authentication'),moduleItem=testHost.modules.find(x=>x.id===catalog.id).lorebook.find(x=>x.id===item.id);return{item,moduleItem};});
  assert.equal(stored.item.content,'');
  assert.equal(stored.moduleItem.content,original,'the module is the canonical full-content store');
  assert.equal(stored.moduleItem.scenarioLibrarySource,undefined,'stock module carries no plugin-only metadata');
  assert.equal(stored.item.key,'');assert.equal(stored.item.alwaysActive,false);
  await noOverflow('detail');
  await page.screenshot({path:path.join(__dirname,`../artifacts/detail-${width}.png`),fullPage:true});

  // Path A: refine in the input card, then add.
  await page.getByRole('button',{name:'다듬기'}).click();
  const card=page.getByRole('textbox',{name:'인풋카드 본문'});const composed=await card.inputValue();
  await card.fill(composed+'\n사용자가 편집한 내용');
  await noOverflow('compose');
  await page.screenshot({path:path.join(__dirname,`../artifacts/input-card-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'채팅에 추가',exact:true}).dblclick();
  await page.waitForFunction(()=>testHost.hides===1);
  const host=await page.evaluate(()=>({chat:testHost.chat,writes:testHost.writes,sends:testHost.sends}));
  assert.equal(host.writes,1);assert.equal(host.sends,0);assert.equal(host.chat.message.length,2);
  assert.equal(host.chat.message[1].role,'user');assert.equal(host.chat.message[1].data,composed+'\n사용자가 편집한 내용');
  assert.deepEqual(host.chat.scriptstate,{$keep:'yes'});

  await page.evaluate(()=>testHost.open());
  await page.getByRole('button',{name:/^전체/}).click();
  await page.getByLabel('상황극 검색').fill('The Unending Authentication');
  await page.locator('.pick').filter({hasText:'The Unending Authentication'}).first().click();
  await page.getByLabel('간략한 상황극 줄거리').waitFor();
  assert.equal(await page.getByRole('radio',{name:/시뮬봇/}).getAttribute('aria-checked'),'true','mode memory');
  assert.equal(await page.getByRole('textbox',{name:'시뮬봇 대상 이름'}).inputValue(),'$&백리설화');
  await page.getByRole('radio',{name:/일반봇/}).click();
  await page.waitForFunction(o=>document.querySelector('.preview')?.textContent===o,original);

  // Path B: one tap from the scenario to the chat when nothing is queued.
  await page.getByRole('button',{name:'채팅에 추가',exact:true}).click();
  await page.waitForFunction(()=>testHost.hides===2);
  const direct=await page.evaluate(()=>({chat:testHost.chat,writes:testHost.writes,sends:testHost.sends}));
  assert.equal(direct.writes,2);assert.equal(direct.sends,0);assert.equal(direct.chat.message.length,3);
  assert.equal(direct.chat.message[2].role,'user');assert.equal(direct.chat.message[2].data,original,'unmodified source reaches the chat');

  await page.evaluate(()=>testHost.open());
  await page.getByRole('button',{name:/^◷ 최근/}).click();
  await page.locator('.pick').filter({hasText:'The Unending Authentication'}).first().click();
  await page.getByRole('button',{name:'수정'}).click();
  await page.getByRole('textbox',{name:'상황극 본문',exact:true}).fill('local edited source');
  await page.evaluate(()=>{const mod=testHost.modules.find(x=>x.id==='4e97d516-4b97-45bc-b0b2-1e0cd0a4c34a'),item=mod.lorebook.find(x=>x.comment==='The Unending Authentication');item.comment='external edit';});
  await page.getByRole('button',{name:'저장',exact:true}).click();
  assert((await page.getByRole('alert').innerText()).includes('다른 곳'));
  assert.equal(await page.getByRole('textbox',{name:'상황극 본문',exact:true}).inputValue(),'local edited source');
  assert.equal(await page.evaluate(()=>testHost.modules.find(x=>x.id==='4e97d516-4b97-45bc-b0b2-1e0cd0a4c34a').lorebook.some(x=>x.comment==='external edit')),true);
  assert.equal(await page.evaluate(()=>testHost.modules[0].name),'untouched','unrelated module preserved');
  await page.getByRole('button',{name:'보관함으로'}).click();
  await page.getByRole('button',{name:'더보기 메뉴'}).click();
  await page.getByRole('button',{name:'모듈에서 새로고침'}).click();
  await page.getByLabel('상황극 검색').fill('external edit');
  assert.equal(await page.locator('.pick').filter({hasText:'external edit'}).count(),1,'manual module edits refresh into the cache');

  // Storage is a compact metadata cache. Clearing it never touches the module,
  // and a storage-free installation reconstructs it from the module plus seed.
  await page.getByRole('button',{name:'더보기 메뉴'}).click();
  await page.getByRole('button',{name:'저장소 관리'}).click();
  const storageDialog=page.getByRole('dialog',{name:'플러그인 저장소 관리'});await storageDialog.waitFor();
  assert((await storageDialog.innerText()).includes('상황극 본문은 모듈에만 저장됩니다.'));
  const moduleBefore=await page.evaluate(()=>JSON.stringify(testHost.modules.find(x=>x.id==='4e97d516-4b97-45bc-b0b2-1e0cd0a4c34a')));
  await storageDialog.getByRole('button',{name:'목록 캐시 비우기'}).click();
  await page.getByRole('button',{name:'캐시 비우기',exact:true}).click();
  await page.waitForFunction(()=>testHost.storage['scenario.v4.catalog']===undefined);
  assert.equal(await page.evaluate(()=>testHost.storage['scenario.v4.catalog']),undefined,'cache key is removed');
  assert.equal(await page.evaluate(()=>JSON.stringify(testHost.modules.find(x=>x.id==='4e97d516-4b97-45bc-b0b2-1e0cd0a4c34a'))),moduleBefore,'cache clear preserves module');
  await page.getByRole('button',{name:'상황극 탐색기 닫기'}).click();
  await page.evaluate(()=>testHost.open());await page.getByLabel('상황극 검색').waitFor();
  assert(await page.evaluate(()=>!!testHost.storage['scenario.v4.catalog']),'missing storage is rebuilt from module and bundled seed');
  assert.match(await page.getByLabel('상황극 서고 수집 범위').innerText(),/탭 확인 2026-09-17/,'seed restores crawl coverage');

  assert.deepEqual(errors,[]);
  results.push({width,pass:true,checks:['cache-only-open','module-canonical-save','module-cache-refresh','bundled-module-seed','compact-storage','cache-clear-preserves-module','storage-free-seed-rebuild','load-more','auto-load-on-scroll','adult-filter-both-ways','favorites','recent','search-summary','save','folder','literal-regex','source-preserved','mobile-overflow','input-card','one-tap-add','no-auto-generation','duplicate-click','mode-memory','concurrent-edit','chat-menu-location','badge-survives-sanitiser','badge-legible-at-20px','chat-menu-row-opens']});
  await page.close();
 }
 fs.writeFileSync(path.join(__dirname,'../artifacts/browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
