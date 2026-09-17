const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'reference',name),'utf8');

test('stock RisuAI routes the input-side menu through the chat location',()=>{
  const api=read('v3.svelte.ts');
  const chat=read('DefaultChatScreen.svelte');
  assert.match(api,/case 'chat':\s*{\s*additionalChatMenu\.push\(menuDef\)/);
  assert.match(api,/removeFromMenuStore\(additionalChatMenu\)/);
  assert.match(chat,/{#each additionalChatMenu as menu}/);
  assert.match(chat,/<PluginDefinedIcon ico={menu} \/>/);
  assert.match(chat,/<span class="ml-2">{menu\.name}<\/span>/);
});

test('stock RisuAI preserves the SVG badge in its 20px plugin icon slot',()=>{
  const icon=read('PluginDefinedIcon.svelte');
  assert.match(icon,/DOMPurify\.sanitize\(icon/);
  assert.match(icon,/FORBID_TAGS:\s*\['script', 'style', 'iframe', 'object', 'embed'\]/);
  assert.doesNotMatch(icon,/FORBID_TAGS:[^\n]*['"]svg['"]/);
  assert.match(icon,/"w-5 h-5": !className/);
});

test('the distributable uses only declared stock API v3 surfaces',()=>{
  const declarations=read('risuai.d.ts');
  const source=fs.readFileSync(path.join(root,'src','app.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src','core.js'),'utf8');
  const used=[...source.matchAll(/\bapi\.([A-Za-z_$][\w$]*)/g)].map(match=>match[1]);
  const expected=[...new Set(used)].sort();
  assert.deepEqual(expected,[
    'addRisuChatListener','getCharacter','getCharacterFromIndex','getChatFromIndex','getCurrentCharacterIndex',
    'getCurrentChatIndex','getDatabase','hideContainer','nativeFetch','onUnload','pluginStorage',
    'registerButton','registerSetting','requestPluginPermission','setChatToIndex','setDatabaseLite','showContainer',
    'unregisterUIPart'
  ]);
  for(const name of expected){
    if(name==='pluginStorage') assert.match(declarations,/pluginStorage:\s*PluginStorage;/);
    else assert.match(declarations,new RegExp('\\b'+name+'\\s*(?:\\(|:)'),name+' must be declared by stock API v3');
  }
  const plugin=fs.readFileSync(path.join(root,'dist','scenario-library.plugin.js'),'utf8');
  const version=require('../package.json').version;
  const escaped=version.replace(/\./g,'\\.');
  // The plugin tab shows only the display name, so the version has to ride along there.
  assert.match(plugin,new RegExp('^//\\@name scenario_library\\n//\\@display-name 상황극 탐색기 v'+escaped+'\\n//\\@api 3\\.0\\n//\\@version '+escaped+'\\n'));
  assert.match(plugin,new RegExp('\\nconst PLUGIN_VERSION = "'+escaped+'";\\n'),'the runtime can show its own version');
  assert.match(plugin,/\/\/@update-url https:\/\/raw\.githubusercontent\.com\/canister2668\/risuai-scenario-library\/main\/update\/scenario-library\.plugin\.js\n/);
  assert.equal(plugin,fs.readFileSync(path.join(root,'update','scenario-library.plugin.js'),'utf8'));
});

test('release module stays stock-only and synchronized storage stays compact',()=>{
  const module=JSON.parse(fs.readFileSync(path.join(root,'dist','scenario-library.module.json'),'utf8'));
  const seed=JSON.parse(fs.readFileSync(path.join(root,'src','seed.json'),'utf8'));
  const entries=module.lorebook.filter(item=>item.mode!=='folder');
  const allowed=['alwaysActive','bookVersion','comment','content','folder','id','insertorder','key','mode','secondkey','selective'].sort();
  assert.equal(entries.length,seed.count);
  for(const entry of entries)assert.deepEqual(Object.keys(entry).sort(),allowed);
  assert.equal(Object.keys(module).some(key=>key.startsWith('scenarioLibrary')),false);
  const storage=JSON.parse(fs.readFileSync(path.join(root,'dist','scenario-library.storage.json'),'utf8'));
  assert.equal(storage.key,'scenario.v4.catalog');
  assert.equal(storage.catalog.lorebook.filter(item=>item.mode!=='folder').length,seed.count);
  assert(fs.statSync(path.join(root,'dist','scenario-library.storage.json')).size<512*1024,'metadata cache must stay below 512 KiB');
  assert(fs.statSync(path.join(root,'dist','scenario-library.plugin.js')).size<512*1024,'normal plugin must not bundle module bodies');
});
