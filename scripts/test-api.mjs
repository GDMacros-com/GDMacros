import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  alias: { '@': path.join(process.cwd(), 'src') }, moduleCache: false,
});
const { publicApi, apiOptions } = await jiti.import('../src/lib/public-api.ts');
const { getAllLevels } = await jiti.import('../src/lib/macros.ts');
const levels = getAllLevels();
const request = (query = '', init = {}) => new Request(`https://example.test/api/v1/levels${query}`, init);
const list = (query = '') => publicApi(request(query), 'levels');

const first = list();
assert.equal(first.status, 200);
assert.equal(first.headers.get('access-control-allow-origin'), '*');
assert.match(first.headers.get('cache-control'), /s-maxage=300/);
const firstBody = await first.json();
assert.equal(firstBody.data.length, 20);
assert.equal(firstBody.pagination.total, levels.length);
assert.equal(firstBody.pagination.totalPages, Math.ceil(levels.length / 20));
assert.equal(typeof firstBody.data[0].levelId, 'string');
assert.equal('searchIndex' in firstBody.data[0], false);
assert.equal('position' in firstBody.data[0].macros[0], false);
assert.deepEqual(Object.keys(firstBody.data[0].macros[0]).sort(),
  ['author','recorder','fps','testedAt','downloadType','downloadUrl'].sort());

const page2 = await list('?limit=1&page=2').json();
assert.equal(page2.data[0].levelId, String(levels[1].levelId));
assert.deepEqual((await list('?page=1000000').json()).data, []);
for (const query of ['?page=0','?page=1.5','?limit=101','?limit=-1','?fps=0','?fps=Infinity',
  '?fps=0x100','?recorder=other','?page=1&page=2','?unknown=1',`?search=${'a'.repeat(101)}`]) {
  const response = list(query);
  assert.equal(response.status, 400, query);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal((await response.json()).error.code, 'INVALID_QUERY');
}
const known = levels[0];
const search = await list(`?search=${encodeURIComponent(String(known.levelId))}&limit=100`).json();
assert.ok(search.data.some(level => level.levelId === String(known.levelId)));
const detail = publicApi(request(), 'level', String(known.levelId));
assert.equal(detail.status, 200);
assert.equal((await detail.json()).data.macros.length, known.macros.length);
assert.equal(publicApi(request(), 'level', 'bad').status, 400);
assert.equal(publicApi(request(), 'level', '999999999999').status, 404);
assert.equal(publicApi(request('?page=1'), 'level', String(known.levelId)).status, 400);

for (const recorder of ['Mega Hack','xdBot','zBot']) {
  const filtered = await publicApi(request(`?recorder=${encodeURIComponent(recorder)}&fps=240&limit=100`), 'macros').json();
  assert.ok(filtered.data.every(macro => macro.recorder === recorder && macro.fps === 240));
  const matchedLevels = await list(`?recorder=${encodeURIComponent(recorder)}&fps=240&limit=100`).json();
  assert.ok(matchedLevels.data.every(level => level.macros.some(macro => macro.recorder === recorder && macro.fps === 240)));
}
// Search must match the returned recording, not another author on the same level.
const allRecordings = await publicApi(request('?limit=100'), 'macros').json();
assert.equal(allRecordings.pagination.total, levels.reduce((sum, level) => sum + level.macros.length, 0));
const author = known.macros[0].author;
const authorResult = await publicApi(request(`?search=${encodeURIComponent(author)}&limit=100`), 'macros').json();
assert.ok(authorResult.data.length > 0);
assert.ok(authorResult.data.every(macro => [macro.level.name, macro.level.creator, macro.level.levelId, macro.author, macro.recorder]
  .join(' ').toLowerCase().includes(author.toLowerCase())));
const stats = await publicApi(request(), 'stats').json();
assert.equal(stats.data.levels, levels.length);
assert.equal(stats.data.macros, allRecordings.pagination.total);
assert.equal(stats.data.recorders.reduce((sum, row) => sum + row.macros, 0), stats.data.macros);

assert.equal(first.headers.get('etag'), null);
for (const value of ['"previous-version"', '*']) {
  const response = publicApi(request('', { headers: { 'if-none-match': value } }), 'levels');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.ok((await response.json()).data.length);
}
assert.equal(await publicApi(request('', { method: 'HEAD' }), 'levels').text(), '');
assert.equal(apiOptions().status, 204);
assert.equal(apiOptions().headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');

// Exercise actual route exports, including the asynchronous Next.js route params.
for (const endpoint of ['', 'levels', 'macros', 'stats']) {
  const route = await jiti.import(`../src/app/api/v1/${endpoint ? endpoint + '/' : ''}route.ts`);
  assert.equal((await route.GET(request())).status, 200);
  assert.equal((await route.HEAD(request('', { method: 'HEAD' }))).status, 200);
  assert.equal(route.OPTIONS().status, 204);
  const denied = route.POST(request('', { method: 'POST' }));
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.equal((await denied.json()).error.code, 'METHOD_NOT_ALLOWED');
}
const route = await jiti.import('../src/app/api/v1/levels/[levelId]/route.ts');
assert.equal((await route.GET(request(), { params: Promise.resolve({ levelId: String(known.levelId) }) })).status, 200);
const unknown = await jiti.import('../src/app/api/v1/[...path]/route.ts');
assert.equal((await unknown.GET(request()).json()).error.code, 'NOT_FOUND');
console.log('Public API: search, filters, pagination, DTO boundaries, errors, CORS, cache headers and route handlers passed.');
