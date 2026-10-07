// Offline transformation and API boundary tests; never writes to GitHub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias:{'@':path.join(process.cwd(),'src')}, moduleCache:false });
const editor = await jiti.import('../src/lib/catalog-editor.ts');
const submissions = await jiti.import('../src/lib/submissions.ts');
const types = await jiti.import('../src/lib/types.ts');
const gdr = await jiti.import('../src/lib/gdr.ts');
const gdr2 = await jiti.import('../src/lib/gdr2.ts');
const assets = await jiti.import('../src/lib/publish/assetName.ts');
const { applyPublication } = await jiti.import('../src/lib/publish/catalog.ts');
const macro = {author:'Author',recorder:'xdBot',fps:240,testedAt:'2026-01-01',downloadType:'GitHub',downloadLink:'https://example.test/one.gdr2'};
const level = {name:'Level One',creator:'Creator',levelId:'123',description:'Keep this',macros:[macro,{...macro,author:'Other'}],custom:'preserve'};
const initial = JSON.stringify([level,{...level,name:'Second',levelId:'456',macros:[macro]}],null,2)+'\n';
const fields = editor.editorFields(level,macro);
let count=0;
async function test(name,fn){await fn();console.log(`ok ${++count} - ${name}`);}
await test('edit every supported field without losing unrelated macros or custom metadata',()=>{
 const changed={...fields,name:'Renamed',creator:'New creator',levelId:'789',slug:'new-page',description:'Updated',video:'https://youtu.be/dQw4w9WgXcQ',thumbnail:'https://example.test/img.png',addedAt:'2026-01-02',author:'New author',recorder:'zBot',fps:'59.94',downloadType:'Other',downloadLink:'https://example.test/new.gdr',testedAt:'2026-02-03'};
 const result=JSON.parse(editor.editCatalog(initial,0,0,'save',changed));
 for(const k of ['name','creator','levelId','slug','description','video','thumbnail','addedAt']) assert.equal(result[0][k],changed[k]);
 for(const k of ['author','recorder','downloadType','downloadLink','testedAt']) assert.equal(result[0].macros[0][k],changed[k]);
 assert.equal(result[0].macros[0].fps,59.94);assert.equal(result[0].custom,'preserve');assert.deepEqual(result[0].macros[1],level.macros[1]);assert.deepEqual(result[1],JSON.parse(initial)[1]);
});
await test('clearing optional values and removing first/last macros is precise',()=>{
 const result=JSON.parse(editor.editCatalog(initial,0,0,'save',{...fields,testedAt:'',description:''}));
 assert.equal(result[0].macros[0].testedAt,null);assert.ok(!('description' in result[0]));
 const removed=JSON.parse(editor.editCatalog(initial,0,0,'remove'));assert.equal(removed[0].macros[0].author,'Other');assert.equal(removed.length,2);
 assert.equal(JSON.parse(editor.editCatalog(initial,1,0,'remove')).length,1);
 for(const [li,mi] of [[-1,0],[0,-1],[0,0.5],[99,0]]) assert.throws(()=>editor.editCatalog(initial,li,mi,'remove'));
});
await test('invalid input, unsafe links, dates and duplicate identities cannot enter catalog',()=>{
 for(const patch of [{fps:'0'},{fps:'Infinity'},{testedAt:'2026-02-30'},{testedAt:'2999-01-01'},{downloadLink:'javascript:alert(1)'},{downloadLink:'https://user:pass@example.test/'},{video:'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'},{video:'https://youtube.com/watch?v=bad'},{thumbnail:'//evil.test/x'},{name:'<script>'},{levelId:'00123'},{levelId:'456'},{slug:'second'},{recorder:'Unknown'},{author:12}]) assert.throws(()=>editor.editCatalog(initial,0,0,'save',{...fields,...patch}),JSON.stringify(patch));
 assert.ok(editor.validateEditor(null));assert.ok(editor.validateEditor([]));
 assert.equal(editor.validDate('2024-02-29','2026-01-01'),true);assert.equal(editor.validDate('2025-02-29','2026-01-01'),false);
});
await test('publisher dates new uploads and editor accepts every current entry',()=>{
 const result=applyPublication('[]',{levelId:'1',levelName:'Test',levelCreator:'Creator',videoUrl:null,macroAuthor:'Author',recorder:'xdBot',fps:240,downloadLink:'https://example.test/a',addedAt:'2026-01-01'});
 assert.equal(JSON.parse(result.json)[0].macros[0].testedAt,'2026-01-01');
 for(const l of JSON.parse(fs.readFileSync('data/macros.json','utf8'))) for(const m of l.macros) assert.equal(editor.validateEditor(editor.editorFields(l,m),l.thumbnail),null,l.name);
});
let admin=true, reads=0, commits=[], uploads=0, conflict=false, revoke=false;
const sha='a'.repeat(40);
const code=ts.transpileModule(fs.readFileSync('src/app/api/admin/macros/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mocks={
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/admin':{isCurrentUserAdmin:async()=>admin},
 '@/lib/github/config':{isPublisherConfigured:true},
 '@/lib/github/contents':{getCatalogFile:async()=>{reads++;if(revoke)admin=false;return {text:initial,sha};},commitCatalog:async(...args)=>{if(conflict)throw Error('conflict');commits.push(args);return {commitSha:'b'.repeat(40)};},isConcurrencyConflict:e=>e.message==='conflict'},
 '@/lib/github/releases':{getReleaseByTag:async()=>({id:1}),createLevelRelease:async()=>{throw Error('unexpected creation');},uploadMacroAsset:async()=>{uploads++;return {asset:{browser_download_url:'https://github.com/example/replacement.gdr'}};},sha256Hex:()=> 'c'.repeat(64)},
 '@/lib/publish/assetName':assets,'@/lib/catalog-editor':editor,'@/lib/types':types,'@/lib/submissions':submissions,'@/lib/gdr':gdr,'@/lib/gdr2':gdr2,
};
const exports={};vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in mocks,n);return mocks[n];},URL,File,Uint8Array,FormData,JSON,Number,Error,console});
function request({origin='https://gdmacros.com',token=sha,confirmed='yes',operation='save',values={...fields,author:'Edited'},file}={}){
 const form=new FormData();for(const [k,v] of Object.entries({sha:token,confirmed,operation,levelIndex:'0',macroIndex:'0',fields:JSON.stringify(values)}))form.set(k,v);
 if(file)form.set('file',file);
 return new Request('https://gdmacros.com/api/admin/macros',{method:'POST',headers:origin?{origin}:{},body:form});
}
function reset(){admin=true;reads=0;commits=[];uploads=0;conflict=false;revoke=false;}
await test('non-admin GET and direct POST are denied before GitHub calls',async()=>{
 reset();admin=false;assert.equal((await exports.GET()).status,403);assert.equal((await exports.POST(request())).status,403);assert.equal(reads,0);assert.equal(uploads,0);assert.equal(commits.length,0);
});
await test('cross-origin requests, absent origin and missing confirmation are rejected',async()=>{
 reset();for(const origin of ['https://evil.test',null])assert.equal((await exports.POST(request({origin}))).status,403);
 assert.equal((await exports.POST(request({confirmed:'no'}))).status,400);assert.equal(reads,0);
});
await test('admin GET is private and metadata saves use the exact catalog SHA',async()=>{
 reset();const get=await exports.GET();assert.equal(get.status,200);assert.equal(get.headers.get('cache-control'),'private, no-store');
 assert.equal((await exports.POST(request())).status,200);assert.equal(commits.length,1);assert.equal(commits[0][1],sha);assert.equal(JSON.parse(commits[0][0])[0].macros[0].author,'Edited');assert.equal(uploads,0);
});
await test('stale snapshots and commit races return conflict without clobbering',async()=>{
 reset();assert.equal((await exports.POST(request({token:'d'.repeat(40)}))).status,409);assert.equal(commits.length,0);
 conflict=true;assert.equal((await exports.POST(request())).status,409);assert.equal(commits.length,0);
});
await test('invalid, empty and oversized replacement files never upload or commit',async()=>{
 reset();for(const file of [new File(['not a replay'],'bad.gdr2'),new File([],'empty.gdr2'),new File(['x'.repeat(submissions.MAX_FILE_BYTES+1)],'big.gdr2'),new File(['x'],'wrong.exe')])assert.equal((await exports.POST(request({file}))).status,400);
 assert.equal(uploads,0);assert.equal(commits.length,0);
});
await test('valid zBot replacement supplies the new link; old unrelated links survive',async()=>{
 reset();const bytes = [];
const str = (value) => {
  const encoded = Buffer.from(value, "utf8");
  assert.ok(encoded.length < 32);
  bytes.push(0xa0 | encoded.length, ...encoded);
};
const f32 = (value) => {
  const encoded = Buffer.alloc(5);
  encoded[0] = 0xca;
  encoded.writeFloatBE(value, 1);
  bytes.push(...encoded);
};

bytes.push(0x87);
str("version"); f32(1);
str("bot"); bytes.push(0x82); str("name"); str("zBot"); str("version"); str("3.0.0");
str("level"); bytes.push(0x82); str("id"); bytes.push(0xce, 0x04, 0x64, 0x2a, 0x4c); str("name"); str("Acheron");
str("inputs"); bytes.push(0x91, 0x84); str("2p"); bytes.push(0xc2); str("btn"); bytes.push(0x01); str("down"); bytes.push(0xc3); str("frame"); bytes.push(0x00);
str("duration"); f32(1);
str("framerate"); f32(240);
str("author"); str("Zoink");

 assert.ok(gdr.checkGdr(new Uint8Array(bytes)).ok);
 const response=await exports.POST(request({values:{...fields,recorder:'zBot'},file:new File([new Uint8Array(bytes)],'new.gdr')}));
 assert.equal(response.status,200,JSON.stringify(await response.json()));assert.equal(uploads,1);assert.equal(commits.length,1);
 const out=JSON.parse(commits[0][0]);assert.equal(out[0].macros[0].downloadLink,'https://github.com/example/replacement.gdr');assert.equal(out[0].macros[1].downloadLink,macro.downloadLink);
});
await test('revoked admin access stops commit; removal only edits the selected entry',async()=>{
 reset();revoke=true;assert.equal((await exports.POST(request())).status,403);assert.equal(commits.length,0);
 reset();assert.equal((await exports.POST(request({operation:'remove'}))).status,200);assert.equal(JSON.parse(commits[0][0])[0].macros.length,1);assert.equal(uploads,0);
});
console.log(`${count} catalog editor scenarios passed`);
