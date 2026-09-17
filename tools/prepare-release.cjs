const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const root=path.join(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
execFileSync(process.execPath,[path.join(root,'build.cjs')],{stdio:'inherit'});
const targetDir=path.join(root,'release');
fs.rmSync(targetDir,{recursive:true,force:true});
fs.mkdirSync(targetDir,{recursive:true});
const names=['scenario-library.plugin.js','scenario-library.module.json'];
const assets=names.map(name=>{const source=path.join(root,'dist',name),target=path.join(targetDir,name);fs.copyFileSync(source,target);const data=fs.readFileSync(target);return{name,data,digest:crypto.createHash('sha256').update(data).digest('hex')};});
fs.writeFileSync(path.join(targetDir,'SHA256SUMS'),assets.map(asset=>`${asset.digest}  ${asset.name}`).join('\n')+'\n');
const data=assets[0].data;
const header=data.subarray(0,512).toString('utf8');
if(!header.includes(`//@version ${pkg.version}\n`)) throw new Error('package.json과 플러그인 버전이 다릅니다.');
if(!header.includes('//@update-url https://raw.githubusercontent.com/canister2668/risuai-scenario-library/main/update/scenario-library.plugin.js\n')) throw new Error('업데이트 주소가 없습니다.');
console.log(`Prepared v${pkg.version}: `+assets.map(asset=>`${asset.name} ${asset.data.length} bytes, sha256 ${asset.digest}`).join('; '));
