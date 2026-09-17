import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {seedEntry} from './library-transform.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),at=args.indexOf('--input');
if(at<0||!args[at+1])throw new Error('--input <scenario-library-import JSON>이 필요합니다.');
const input=path.resolve(args[at+1]),payload=JSON.parse(fs.readFileSync(input,'utf8'));
if(payload.format!=='scenario-library-import'||!Array.isArray(payload.entries)||!payload.coverage)throw new Error('증분 가져오기 파일 형식이 아닙니다.');
const seedPath=path.join(root,'src/seed.json'),seed=JSON.parse(fs.readFileSync(seedPath,'utf8')),byId=new Map(seed.entries.map(item=>[String(item.sourceArticleId),item]));
let added=0;
for(const item of payload.entries.filter(item=>item.candidate)){const id=String(item.sourceArticleId);if(!byId.has(id))added++;byId.set(id,seedEntry(item,payload.collectedAt));}
const entries=[...byId.values()].sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
const canonical=JSON.stringify(entries),coverage=payload.coverage,version=Number.parseInt(crypto.createHash('sha256').update(canonical+JSON.stringify(coverage)).digest('hex').slice(0,12),16);
const output={...seed,version,sourceFile:path.basename(input),count:entries.length,coverage,entries};fs.writeFileSync(seedPath,JSON.stringify(output));
console.log(JSON.stringify({input,added,total:entries.length,coverage},null,2));
