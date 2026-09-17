// The runtime bundle carries no update URL, so the notice path can only be
// exercised against the distributable, with the update server faked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const version=require('../package.json').version;
const plugin=fs.readFileSync(path.join(root,'dist/scenario-library.plugin.js'),'utf8');
const packed=JSON.parse(fs.readFileSync(path.join(root,'dist/scenario-library.storage.json'),'utf8'));
const moduleFixture=JSON.parse(fs.readFileSync(path.join(root,'dist/scenario-library.module.json'),'utf8'));
const header=v=>`//@name scenario_library\n//@display-name 상황극 탐색기 v${v}\n//@api 3.0\n//@version ${v}\n`;
const bump=(v,part)=>{const p=v.split('.').map(Number);p[part]+=1;return p.slice(0,3).join('.');};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const checks=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://scenario.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><head></head><body></body></html>'}));
  await page.goto('https://scenario.test/');
  await page.evaluate(fixture=>{
   const storage={[fixture.key]:JSON.stringify(fixture.catalog)};
   const h=window.testHost={modules:[structuredClone(fixture.module)],storage,fetched:[],updateBody:fixture.older,failFetch:false};
   window.Risuai={
    getDatabase:async()=>({modules:structuredClone(h.modules)}),setDatabaseLite:async p=>{h.modules=structuredClone(p.modules)},
    getCharacter:async()=>null,getCharacterFromIndex:async()=>({chaId:'c'}),getCurrentCharacterIndex:async()=>0,getCurrentChatIndex:async()=>0,
    getChatFromIndex:async()=>({id:'chat-1',message:[]}),setChatToIndex:async()=>{},
    pluginStorage:{getItem:async k=>storage[k]??null,setItem:async(k,v)=>{storage[k]=v},removeItem:async k=>{delete storage[k]},keys:async()=>Object.keys(storage),length:async()=>Object.keys(storage).length,clear:async()=>{for(const k of Object.keys(storage))delete storage[k]}},
    requestPluginPermission:async()=>true,showContainer:async()=>{document.body.style.display=''},hideContainer:async()=>{document.body.style.display='none'},
    registerButton:async(a,cb)=>{h.open=cb;return{id:'b'}},registerSetting:async()=>({id:'s'}),onUnload:async()=>{},unregisterUIPart:async()=>{},addRisuChatListener:async()=>{},
    nativeFetch:async url=>{h.fetched.push(url);if(h.failFetch)throw new Error('offline');return{ok:true,text:async()=>h.updateBody}}
   };
  },{key:packed.key,catalog:packed.catalog,module:moduleFixture,older:header('0.9.0')});

  await page.addScriptTag({content:plugin});await page.waitForFunction(()=>!!window.testHost.open);
  await page.evaluate(()=>testHost.open());
  await page.getByLabel('상황극 검색').waitFor();
  await page.waitForFunction(()=>testHost.fetched.length>0);
  assert.match(await page.evaluate(()=>testHost.fetched[0]),/^https:\/\/raw\.githubusercontent\.com\/.+\/update\/scenario-library\.plugin\.js\?at=\d+$/,'the check reads the published update file');
  assert.equal(await page.locator('.update-notice').isVisible(),false,'an older server version never claims an update');
  assert.equal(await page.locator('.version-line button').innerText(),`상황극 탐색기 v${version}`);
  checks.push('older-server-is-silent');

  // A newer published version surfaces a notice in the list and in the menu.
  const next=bump(version,2);
  await page.evaluate(v=>{testHost.updateBody=`//@name scenario_library\n//@version ${v}\n`;},next);
  await page.getByRole('button',{name:new RegExp('^상황극 탐색기 v')}).click();
  const about=page.getByRole('dialog',{name:'상황극 탐색기 정보'});await about.waitFor();
  await about.getByRole('button',{name:'업데이트 확인'}).click();
  await page.waitForFunction(t=>document.querySelector('dialog .update-status')?.textContent.includes(t),`v${next}`);
  await about.getByRole('button',{name:'닫기'}).click();
  const notice=page.locator('.update-notice');
  await notice.waitFor({state:'visible'});
  assert.match(await notice.innerText(),new RegExp(`새 버전 v${next.replace(/\./g,'\\.')}`));
  assert.match(await notice.innerText(),new RegExp(`설치된 버전은 v${version.replace(/\./g,'\\.')}`));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'update notice does not overflow');
  await page.evaluate(()=>{scrollTo(0,0);document.querySelector('.app')?.scrollTo(0,0);});
  await page.screenshot({path:path.join(root,'artifacts/update-notice-390.png')});
  checks.push('newer-server-raises-notice');

  // Dismissal is remembered for that version and survives a reopen.
  await notice.getByRole('button',{name:'확인함'}).click();
  await notice.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'상황극 탐색기 닫기'}).click();
  await page.evaluate(()=>testHost.open());
  await page.getByLabel('상황극 검색').waitFor();
  assert.equal(await page.locator('.update-notice').isVisible(),false,'a dismissed version stays dismissed');
  assert.match(await page.locator('.version-line button').innerText(),new RegExp(`새 버전 v${next.replace(/\./g,'\\.')}`),'the footer still states it');
  checks.push('dismissal-is-per-version');

  // The next release speaks up again even though the previous one was dismissed.
  const later=bump(next,1);
  await page.evaluate(v=>{testHost.updateBody=`//@version ${v}\n`;},later);
  await page.getByRole('button',{name:new RegExp('^상황극 탐색기 v')}).click();
  await about.getByRole('button',{name:'업데이트 확인'}).click();
  await about.getByRole('button',{name:'닫기'}).click();
  await page.locator('.update-notice').waitFor({state:'visible'});
  assert.match(await page.locator('.update-notice').innerText(),new RegExp(`새 버전 v${later.replace(/\./g,'\\.')}`));
  checks.push('later-release-speaks-again');

  // An unreachable update server must never block the library or claim an update.
  await page.evaluate(()=>{testHost.failFetch=true;});
  await page.getByRole('button',{name:new RegExp('^상황극 탐색기 v')}).click();
  await about.getByRole('button',{name:'업데이트 확인'}).click();
  await page.getByRole('alert').waitFor();
  assert(await page.getByRole('alert').isVisible(),'a failed manual check reports the failure');
  await about.getByRole('button',{name:'닫기'}).click();
  await page.evaluate(()=>{testHost.storage['scenario.v1.update']=JSON.stringify({latest:'',checkedAt:0});});
  await page.getByRole('button',{name:'상황극 탐색기 닫기'}).click();
  await page.evaluate(()=>testHost.open());
  await page.getByLabel('상황극 검색').waitFor();
  assert.equal(await page.locator('.update-notice').isVisible(),false,'an offline check leaves the library usable and quiet');
  checks.push('offline-check-is-silent');

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({version,checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
