import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {seedEntry} from './library-transform.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readdirSync(path.join(root,'crawl-output')).filter(name=>name.startsWith('scenario-library-import-')).sort().at(-1);
if(!source)throw new Error('scenario-library import JSON not found');
const payload=JSON.parse(fs.readFileSync(path.join(root,'crawl-output',source),'utf8'));
const entries=payload.entries.filter(item=>item.candidate).map(item=>seedEntry(item,payload.collectedAt));
const canonical=JSON.stringify(entries);
const newest=[...payload.entries].filter(item=>item.createdAt).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
const coverage=payload.coverage||{source:'arca.live',board:'characterai',category:'로어북',scannedAt:payload.collectedAt,
  newestArticleId:String(newest?.sourceArticleId||''),newestCreatedAt:newest?.createdAt||'',checkedArticles:payload.entries.length};
const output={format:'scenario-library-seed',version:Number.parseInt(crypto.createHash('sha256').update(canonical+JSON.stringify(coverage)).digest('hex').slice(0,12),16),sourceFile:source,count:entries.length,coverage,entries};
fs.writeFileSync(path.join(root,'src','seed.json'),JSON.stringify(output));
const counts=Object.fromEntries([...new Set(entries.map(x=>x.category))].sort().map(name=>[name,entries.filter(x=>x.category===name).length]));
console.log(JSON.stringify({source,count:entries.length,counts,bytes:fs.statSync(path.join(root,'src','seed.json')).size},null,2));
