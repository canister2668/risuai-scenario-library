import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../src/core.js');

const plain=value=>String(value||'').replace(/<[^>]+>/g,' ').replace(/\{\{(?:char|user)\}\}/gi,match=>match.toLowerCase()==='{{char}}'?'캐릭터':'사용자')
  .replace(/\[(?:OOC|System)[^\]]*:?/gi,' ').replace(/[#*_`>|]+/g,' ').replace(/\s+/g,' ').trim();

export function cleanContent(value){return C.cleanInput(value);}
export function summarize(item){
  const content=cleanContent(item.content),title=plain(item.title).replace(/\[?(?:로어북|lorebook)\]?/gi,'상황극').replace(/\s+/g,' ').trim();
  const lines=content.split(/\n+/).filter(line=>!/^\s*[\[(]\s*(?:OOC|System)\s*:/i.test(line)).map(plain)
    .filter(line=>line.length>8&&!/^(scenario|reference|guideline|참조|다음|응답|출력|작성|describe|write|output|portray|ensure|maintain)/i.test(line));
  const extra=lines.find(line=>line.length>=16&&!title.includes(line)&&!line.includes(title)),text=title.length>=20||!extra?title:`${title} — ${extra}`;
  return text.length>180?text.slice(0,177).trimEnd()+'…':text;
}
export function categorize(item){
  const content=cleanContent(item.content),text=(item.title+'\n'+content.slice(0,2400)).toLowerCase();
  if(item.isSensitive||/🔞|nsfw|섹스|성관계|성기|야동|정액|펠라|정조대|금욕|난교|ntr/.test(text))return '성인';
  if(/연인|연애|사랑|고백|키스|뽀뽀|데이트|결혼|부부|짝사랑|로맨스|순애/.test(text))return '로맨스';
  if(/싸움|갈등|이별|질투|서운|불안|화해|배신|다툼|피폐|죽음|거절|복수/.test(text))return '갈등·화해';
  if(/전투|사건|모험|납치|추격|재난|괴물|던전|살인|공포|미스터리|판타지|세계관|전쟁/.test(text))return '사건·모험';
  if(/일상|코미디|개그|장난|게임|요리|술|사진|휴대폰|문자|메신저|직장|학교|고양이|햄스터|웃/.test(text))return '일상·코미디';
  return '기타';
}
export function seedEntry(item,collectedAt=null){const content=cleanContent(item.content);const normalized={...item,content};return{
  sourceArticleId:String(item.sourceArticleId),sourceUrl:item.sourceUrl,title:item.title,author:item.author||null,createdAt:item.createdAt||null,
  isSensitive:Boolean(item.isSensitive),rawHtmlSha256:item.rawHtmlSha256||null,collectedAt:item.collectedAt||collectedAt||null,
  category:item.category||categorize(normalized),summary:item.summary||summarize(normalized),content};}
