const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),plugin=fs.readFileSync(path.join(root,'dist/scenario-library-runtime.plugin.js'),'utf8');
const packed=JSON.parse(fs.readFileSync(path.join(root,'dist/scenario-library.storage.json'),'utf8'));
const storageFixture={[packed.key]:JSON.stringify(packed.catalog)};
const moduleFixture=JSON.parse(fs.readFileSync(path.join(root,'dist/scenario-library.module.json'),'utf8'));
const folderNames=new Map(moduleFixture.lorebook.filter(x=>x.mode==='folder').map(x=>[x.key,x.comment]));
const total=moduleFixture.lorebook.filter(x=>x.mode!=='folder').length,adult=moduleFixture.lorebook.filter(x=>x.mode!=='folder'&&folderNames.get(x.folder)==='성인').length;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://scenario.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('https://scenario.test/');
  await page.evaluate(fixture=>{const h=window.testHost={modules:[structuredClone(fixture.module)],storage:structuredClone(fixture.storage)};window.Risuai={getDatabase:async()=>({modules:structuredClone(h.modules)}),setDatabaseLite:async p=>{h.modules=structuredClone(p.modules)},getCharacter:async()=>null,pluginStorage:{getItem:async k=>h.storage[k]??null,setItem:async(k,v)=>{h.storage[k]=v},removeItem:async k=>{delete h.storage[k]},keys:async()=>Object.keys(h.storage),length:async()=>Object.keys(h.storage).length,clear:async()=>{for(const key of Object.keys(h.storage))delete h.storage[key]}},showContainer:async()=>{},hideContainer:async()=>{},registerButton:async(a,cb)=>{h.open=cb;return{id:'b'}},registerSetting:async()=>({id:'s'}),onUnload:async()=>{},unregisterUIPart:async()=>{}}},{storage:storageFixture,module:moduleFixture});
  await page.addScriptTag({content:plugin});await page.waitForFunction(()=>!!testHost.open);await page.evaluate(()=>testHost.open());
  await page.getByLabel('상황극 검색').waitFor();
  assert((await page.locator('.result-count').innerText()).includes(`${total}개 중 30개 표시`));
  assert.equal(await page.locator('.row-item').count(),30,'first page stays short on a phone');
  assert.equal(await page.evaluate(()=>JSON.parse(testHost.storage['scenario.v4.catalog']).lorebook.filter(x=>x.mode!=='folder').length),total);
  const cleanReport=await page.evaluate(()=>{const module=testHost.modules.find(x=>x.id==='4e97d516-4b97-45bc-b0b2-1e0cd0a4c34a'),inputs=module.lorebook.filter(x=>x.mode!=='folder').map(x=>x.content);return{
    missing:inputs.filter(x=>!x.trim()).length,zeroWidth:inputs.filter(x=>/[\u200B-\u200D\u2060\uFEFF]/.test(x)).length,
    divider:inputs.filter(x=>/\n\s*▼\s*\n\s*▲\s*\n/.test(x)).length};});
  assert.deepEqual(cleanReport,{missing:0,zeroWidth:0,divider:0});
  // Every folder carries its own count so the complete library stays navigable.
  assert.equal(await page.getByRole('button',{name:`성인 ${adult}`}).count(),1);
  await page.getByRole('button',{name:`성인 ${adult}`}).click();
  await page.waitForFunction(n=>document.querySelector('.result-count')?.textContent.includes(`${n}개`),adult);
  assert((await page.locator('.row-item').first().innerText()).includes('19+'),'adult entries stay marked');
  await page.getByRole('combobox',{name:'상황극 정렬'}).selectOption('title');
  await page.getByLabel('상황극 검색').fill('정조대');
  await page.locator('.pick').first().click();
  await page.getByLabel('간략한 상황극 줄거리').waitFor();
  assert((await page.getByLabel('간략한 상황극 줄거리').innerText()).length>20);
  assert.equal(await page.getByRole('button',{name:'전체 보기'}).count(),1,'source text is one tap away, not hidden');
  assert((await page.locator('.bar').innerText()).includes('채팅을 열면'),'no chat open is explained instead of failing on tap');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(root,'artifacts/library-390.png'),fullPage:true});
  await page.getByRole('button',{name:'보관함으로'}).click();
  await page.getByLabel('상황극 검색').waitFor();
  await page.screenshot({path:path.join(root,'artifacts/full-import-390.png'),fullPage:false});
  console.log(JSON.stringify({seeded:total,firstPage:30,adult,mobileOverflow:false},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
