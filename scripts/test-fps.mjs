import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(),'src') }, moduleCache:false });
const { parseFps, fpsLabel } = await jiti.import('../src/lib/fps.ts');
const { validateSubmission, normaliseSubmission } = await jiti.import('../src/lib/submissions.ts');
const { applyPublication } = await jiti.import('../src/lib/publish/catalog.ts');
const valid = { levelName:'Test',levelId:'123',levelCreator:'Creator',videoUrl:'',recorder:'xdBot',macroAuthor:'Author',notes:'',fps:'59.94' };
for(const input of ['', ' ', '0','-1','NaN','Infinity','1e309','1e-400','0x100','240 fps']) {
  assert.equal(parseFps(input),null,input);
  assert.ok(validateSubmission({...valid,fps:input}).fps,input);
}
for(const rate of ['59.94','360','1000000.25','1e6','0.5']) {
  assert.equal(parseFps(rate),Number(rate));
  assert.deepEqual(validateSubmission({...valid,fps:rate}),{});
  assert.equal(normaliseSubmission({...valid,fps:rate}).fps,Number(rate));
}
assert.ok(validateSubmission({...valid,fps:undefined}).fps);
assert.equal(fpsLabel([{fps:240},{fps:240}]),'240 FPS');
assert.equal(fpsLabel([{fps:240},{fps:360}]),'Mixed FPS');
const input={levelId:'123',levelName:'Test',levelCreator:'Creator',videoUrl:null,macroAuthor:'Author',recorder:'xdBot',downloadLink:'https://example.test/macro.gdr2',addedAt:'2026-10-06',fps:59.94};
const first=applyPublication('[]',input);
assert.ok(first.ok);
assert.equal(JSON.parse(first.json)[0].macros[0].fps,59.94);
const second=applyPublication(first.json,{...input,fps:1000000.25,downloadLink:'https://example.test/other.gdr2'});
assert.ok(second.ok);
assert.deepEqual(JSON.parse(second.json)[0].macros.map(m=>m.fps),[59.94,1000000.25]);
for(const fps of [undefined,null,'240',0,-1,NaN,Infinity]) assert.equal(applyPublication('[]',{...input,fps}).ok,false);
const catalog=JSON.parse(fs.readFileSync('data/macros.json','utf8'));
assert.ok(catalog.length);
for(const level of catalog) for(const macro of level.macros) assert.ok(typeof macro.fps==='number' && Number.isFinite(macro.fps) && macro.fps>0);
console.log('FPS validation, decimal/high rates, mixed rates and catalog publication passed');
