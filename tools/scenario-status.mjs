import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const seed=JSON.parse(fs.readFileSync(path.join(root,'src/seed.json'),'utf8'));
const index=JSON.parse(fs.readFileSync(path.join(root,'maintenance/arcalive-index.json'),'utf8'));
const newestStored=[...seed.entries].filter(x=>x.createdAt).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
const inbox=path.join(root,'maintenance/inbox');
let pending=null;
if(fs.existsSync(inbox)){
  const manifests=fs.readdirSync(inbox).filter(x=>x.endsWith('-manifest.json')).sort();
  if(manifests.length){
    const file=manifests.at(-1),value=JSON.parse(fs.readFileSync(path.join(inbox,file),'utf8'));
    const indexed=new Set(index.articles.map(item=>String(item.sourceArticleId||item.id||'')));
    const remaining=(value.articles||[]).filter(item=>!indexed.has(String(item.sourceArticleId||item.id||''))).length;
    if(remaining||Date.parse(value.coverage?.scannedAt||0)>Date.parse(index.coverage?.scannedAt||0))
      pending={file,newArticles:remaining,scanned:value.scanned||0,overlap:value.overlap||0,coverage:value.coverage||null};
  }
}
console.log(JSON.stringify({storedScenarios:seed.entries.length,newestStored:newestStored?{
  sourceArticleId:newestStored.sourceArticleId,createdAt:newestStored.createdAt,title:newestStored.title}:null,
  tabCoverage:index.coverage,indexedArticles:index.articles.length,pending},null,2));
