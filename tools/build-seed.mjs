import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readdirSync(path.join(root,'crawl-output')).filter(name=>name.startsWith('scenario-library-import-')).sort().at(-1);
if(!source)throw new Error('scenario-library import JSON not found');
const payload=JSON.parse(fs.readFileSync(path.join(root,'crawl-output',source),'utf8'));
const clean=value=>String(value||'').replace(/<[^>]+>/g,' ').replace(/\{\{(?:char|user)\}\}/gi,match=>match.toLowerCase()==='{{char}}'?'캐릭터':'사용자').replace(/\[(?:OOC|System)[^\]]*:?/gi,' ').replace(/[#*_`>|]+/g,' ').replace(/\s+/g,' ').trim();
function summary(item){
  const title=clean(item.title).replace(/\[?(?:로어북|lorebook)\]?/gi,'상황극').replace(/\s+/g,' ').trim();
  const lines=String(item.content||'').split(/\n+/).map(clean).filter(line=>line.length>8&&!/^(scenario|reference|guideline|참조|다음|응답|출력|작성|describe|write|output|portray|ensure|maintain)/i.test(line));
  const extra=lines.find(line=>line.length>=16&&!title.includes(line)&&!line.includes(title));
  const text=title.length>=20||!extra?title:`${title} — ${extra}`;
  return text.length>180?text.slice(0,177).trimEnd()+'…':text;
}
function category(item){
  const text=(item.title+'\n'+item.content.slice(0,2400)).toLowerCase();
  if(item.isSensitive||/🔞|nsfw|섹스|성관계|성기|야동|정액|펠라|정조대|금욕|난교|ntr/.test(text))return '성인';
  if(/연인|연애|사랑|고백|키스|뽀뽀|데이트|결혼|부부|짝사랑|로맨스|순애/.test(text))return '로맨스';
  if(/싸움|갈등|이별|질투|서운|불안|화해|배신|다툼|피폐|죽음|거절|복수/.test(text))return '갈등·화해';
  if(/전투|사건|모험|납치|추격|재난|괴물|던전|살인|공포|미스터리|판타지|세계관|전쟁/.test(text))return '사건·모험';
  if(/일상|코미디|개그|장난|게임|요리|술|사진|휴대폰|문자|메신저|직장|학교|고양이|햄스터|웃/.test(text))return '일상·코미디';
  return '기타';
}
const entries=payload.entries.filter(item=>item.candidate).map(item=>({sourceArticleId:String(item.sourceArticleId),sourceUrl:item.sourceUrl,title:item.title,
  author:item.author||null,createdAt:item.createdAt||null,isSensitive:Boolean(item.isSensitive),rawHtmlSha256:item.rawHtmlSha256||null,
  collectedAt:payload.collectedAt||null,category:category(item),summary:summary(item),content:item.content}));
const canonical=JSON.stringify(entries);
const output={format:'scenario-library-seed',version:Number.parseInt(crypto.createHash('sha256').update(canonical).digest('hex').slice(0,12),16),sourceFile:source,count:entries.length,entries};
fs.writeFileSync(path.join(root,'src','seed.json'),JSON.stringify(output));
const counts=Object.fromEntries([...new Set(entries.map(x=>x.category))].sort().map(name=>[name,entries.filter(x=>x.category===name).length]));
console.log(JSON.stringify({source,count:entries.length,counts,bytes:fs.statSync(path.join(root,'src','seed.json')).size},null,2));
