import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),at=args.indexOf('--input');
if(at<0||!args[at+1])throw new Error('--input <scenario-library-import JSON>이 필요합니다.');
const input=path.resolve(args[at+1]);
const payload=JSON.parse(fs.readFileSync(input,'utf8'));
if(payload.format!=='scenario-library-import'||!Array.isArray(payload.entries)||!payload.coverage)throw new Error('증분 가져오기 파일 형식이 아닙니다.');
const indexPath=path.join(root,'maintenance/arcalive-index.json');
const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const previousIds=new Set(index.articles.map(item=>String(item.sourceArticleId)));
const byId=new Map(index.articles.map(item=>[String(item.sourceArticleId),item]));
for(const item of payload.entries)byId.set(String(item.sourceArticleId),{sourceArticleId:String(item.sourceArticleId),createdAt:item.createdAt||null,
  rawHtmlSha256:item.rawHtmlSha256||null,candidate:Boolean(item.candidate)});
index.coverage=payload.coverage;index.articles=[...byId.values()].sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
fs.writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify({input,added:payload.entries.filter(item=>!previousIds.has(String(item.sourceArticleId))).length,
  indexedArticles:index.articles.length,coverage:index.coverage},null,2));
