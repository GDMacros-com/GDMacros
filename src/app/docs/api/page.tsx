import type { Metadata } from "next";
import CopyButton from "@/components/CopyButton";
import spec from "../../../../public/openapi.json";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "API documentation",
  description: "Search Geometry Dash levels and recordings with the free GDMacros public API. Endpoints, examples, fields, limits and OpenAPI reference.",
  alternates: { canonical: "/docs/api" },
};

const base = "https://www.gdmacros.com";
const sections = ["quick-start", "endpoints", "filters", "responses", "fields", "examples", "errors", "limits"];
const headings = ["Quick start", "Endpoints", "Filters & pagination", "Response shapes", "Field reference", "Code examples", "Errors", "Limits & caching"];
const linkStyle = "text-accent-soft underline-offset-4 hover:underline";

function Code({ title, value }: { title: string; value: string }) {
  return <div className="my-4 min-w-0 overflow-hidden rounded-xl border border-border bg-surface-2">
    <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-2.5">
      <span className="text-xs font-semibold text-text-dim">{title}</span>
      <CopyButton value={value} label={`Copy ${title}`} />
    </div>
    <pre translate="no" className="notranslate overflow-x-auto p-4 text-xs leading-6 text-text-dim"><code>{value}</code></pre>
  </div>;
}

function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return <div className="my-4 overflow-x-auto rounded-xl border border-border">
    <table className="w-full min-w-[560px] text-left text-[13px] leading-6">
      <thead className="bg-surface-2 text-text"><tr>{columns.map(column => <th key={column} scope="col" className="px-4 py-3 font-semibold">{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-border-soft">{row.map((cell, j) => <td key={j} className="px-4 py-3 align-top">{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

const curl = `curl "${base}/api/v1/levels?search=acheron&limit=5"`;
const js = `const params = new URLSearchParams({ recorder: "xdBot", fps: "240", limit: "20" });
const response = await fetch("${base}/api/v1/macros?" + params);
if (!response.ok) {
  // Firewall errors may be plain text or HTML: do not assume JSON.
  throw new Error("GDM API returned HTTP " + response.status);
}
const { data, pagination } = await response.json();
for (const macro of data) {
  console.log(macro.level.name, macro.fps, macro.downloadUrl);
}
console.log(pagination);`;
const python = `import json
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

query = urlencode({"search": "acheron", "limit": 5})
try:
    with urlopen("${base}/api/v1/levels?" + query, timeout=15) as response:
        result = json.load(response)
    for level in result["data"]:
        print(level["name"], level["url"])
except HTTPError as error:
    print("GDM API returned HTTP", error.code)
except URLError as error:
    print("Connection failed:", error.reason)`;
const powershell = `$uri = "${base}/api/v1/levels?search=acheron&limit=5"
try {
    $result = Invoke-RestMethod -Uri $uri -TimeoutSec 15
    $result.data | Select-Object levelId, name, url
    $result.pagination
} catch {
    Write-Error "The API request failed: $($_.Exception.Message)"
}`;
const paginated = `// Fetch pages sequentially, with a pause to stay below the shared IP limit.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const levels = [];
for (let page = 1; ; page++) {
  const response = await fetch("${base}/api/v1/levels?limit=100&page=" + page);
  if (!response.ok) throw new Error("HTTP " + response.status);
  const result = await response.json();
  levels.push(...result.data);
  if (page >= result.pagination.totalPages) break;
  await sleep(1500);
}
console.log(levels);`;

export default function ApiDocumentation() {
  const schemas = spec.components.schemas;
  const fieldRows = (properties: Record<string, { type?: string | string[]; description?: string }>) =>
    Object.entries(properties).map(([name, field]) => [<code key={name}>{name}</code>, Array.isArray(field.type) ? field.type.join(" | ") : field.type ?? "object", field.description ?? ""]);
  return <div className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:px-6 sm:py-14">
    <header className="mb-8 max-w-3xl">
      <p className="text-xs font-bold tracking-[0.16em] text-accent-soft uppercase">Developers · v1</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Build with the GDM catalog</h1>
      <p className="mt-4 text-[15px] leading-7 text-text-dim">Find levels, compare recordings and link people to the right macro. The public API is free to access, read-only and requires no account or API key.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
        <a href="/openapi.json" className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-accent">OpenAPI 3.1 specification</a>
        <a href={`${base}/api/v1`} className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-accent">API discovery</a>
      </div>
    </header>
    <div className="grid min-w-0 gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
      <aside><nav aria-label="API documentation sections" className="flex flex-wrap gap-2 text-[13px] lg:sticky lg:top-24 lg:flex-col">
        {sections.map((id, i) => <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2 text-text-dim hover:bg-surface-2 hover:text-text">{headings[i]}</a>)}
      </nav></aside>
      <article className="min-w-0 space-y-12 text-[14px] leading-7 text-text-dim [&_section]:scroll-mt-24 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-text [&_p+p]:mt-3">
        <section id="quick-start"><h2>Quick start</h2>
          <p>Base URL: <code translate="no" className="notranslate">{base}/api/v1</code>. Use HTTPS and GET requests. Responses are JSON; you can use the API from a browser, server, bot or command-line tool.</p>
          <Code title="cURL" value={curl} />
          <p>For a known Geometry Dash level ID, request <a className={linkStyle} href="/api/v1/levels/73667628"><code>/api/v1/levels/73667628</code></a>. The ID identifies a level, which can contain several recordings.</p>
        </section>
        <section id="endpoints"><h2>Endpoints</h2>
          <Table columns={["GET path", "Returns", "Query parameters"]} rows={[
            [<code key="index">/api/v1</code>, "API version and endpoint paths", "None"],
            [<code key="levels">/api/v1/levels</code>, "Matching levels, including every recording on each level", "search, recorder, fps, page, limit"],
            [<code key="level">/api/v1/levels/{"{levelId}"}</code>, "One level and all its recordings", "None; levelId is 1–12 digits"],
            [<code key="macros">/api/v1/macros</code>, "Only matching recordings, each with its level metadata", "search, recorder, fps, page, limit"],
            [<code key="stats">/api/v1/stats</code>, "Level count, recording count and counts by recorder", "None"],
          ]} />
          <p>HEAD returns the same status and headers without a response body. OPTIONS supports browser preflight requests. POST, PUT, PATCH and DELETE return 405. This API does not provide submissions, account data, moderation or file conversion.</p>
        </section>
        <section id="filters"><h2>Filters &amp; pagination</h2>
          <Table columns={["Parameter", "Default / allowed values", "Behavior"]} rows={[
            ["search", "Optional; at most 100 characters after trimming", "Case-insensitive literal substring. Not fuzzy search, a regex, or the website’s multi-word search."],
            ["recorder", "Mega Hack, xdBot, zBot", "Exact spelling and case. Encode spaces with URLSearchParams or %20."],
            ["fps", "Positive finite number, including 59.94 or 360", "Exact recording-rate match. Scientific notation is accepted; zero, negatives and Infinity are rejected."],
            ["page", "1; integer from 1 to 1,000,000", "One-based page number; plain digits with no leading zero."],
            ["limit", "20; integer from 1 to 100", "Maximum number of levels or recordings on a page."],
          ]} />
          <p>Filters combine with AND. A level matches recorder and FPS only when the same recording satisfies both. Level results include all recordings for that level; use <code>/macros</code> if you want only the matching recordings.</p>
          <p>Level search checks name, creator, level ID and recording author, recorder and hosting label. Recording search checks level name, creator and ID plus that recording’s author and recorder. Empty search matches everything. Unknown query parameters and repeated parameters return 400, including parameters added to endpoints that accept none.</p>
          <p>Levels are ordered alphabetically by name. Recordings follow that level order and then their order in the catalog. There is no sort parameter. No matches, or a page beyond the end, returns 200 with an empty data array. With no matches, total and totalPages are both zero.</p>
          <p>Catalog changes can move entries between pages. Pagination does not provide a frozen snapshot across deployments; keep multi-page fetches short and refresh your cached copy periodically.</p>
        </section>
        <section id="responses"><h2>Response shapes</h2>
          <p>The following examples illustrate the structure; names and counts are examples, not current catalog totals. Missing optional values are returned as null.</p>
          <Code title="Level list response" value={JSON.stringify({data:[{levelId:"12345678",name:"Example Level",creator:"LevelCreator",slug:"example-level",url:`${base}/macro/example-level`,description:null,videoUrl:null,thumbnailUrl:null,addedAt:"2026-10-27",macros:[{author:"MacroAuthor",recorder:"xdBot",fps:240,testedAt:null,downloadType:"GitHub",downloadUrl:"https://github.com/OWNER/REPO/releases/download/TAG/FILE.gdr2"}]}],pagination:{page:1,limit:20,total:1,totalPages:1}},null,2)} />
          <p>A single level response is <code>{'{ "data": { ...level fields, "macros": [...] } }'}</code> with no pagination. Recording lists use <code>{'{ "data": [{ ...recording fields, "level": { ...level fields } }], "pagination": { ... } }'}</code>; their nested level has no macros array.</p>
          <Code title="Statistics response" value={JSON.stringify({data:{levels:1,macros:2,recorders:[{recorder:"Mega Hack",macros:0},{recorder:"xdBot",macros:2},{recorder:"zBot",macros:0}]}},null,2)} />
        </section>
        <section id="fields"><h2>Field reference</h2>
          <h3>Level fields</h3><Table columns={["Field", "Type", "Meaning"]} rows={fieldRows(schemas.LevelSummary.properties)} />
          <p>Level list and detail responses also include <code>macros</code>, an array containing at least one recording. Every field listed above is present, including nullable fields.</p>
          <h3>Recording fields</h3><Table columns={["Field", "Type", "Meaning"]} rows={fieldRows(schemas.Recording.properties)} />
          <p>Individual recordings do not have permanent API IDs. Do not use array position as a permanent identifier. Slugs, author credits and download URLs may change after catalog edits. Level IDs are strings; preserve their representation when constructing requests.</p>
          <p>Mega Hack and xdBot submissions use .gdr2; zBot uses .gdr. The API returns existing URLs without converting files. Download directly from downloadUrl and retain author credits. A tested date or FPS label is metadata, not a guarantee of compatibility with every game or tool version.</p>
          <h3>Pagination fields</h3><Table columns={["Field", "Meaning"]} rows={[["page","Requested one-based page"],["limit","Requested page size"],["total","Number of matching levels or recordings across all pages"],["totalPages","Ceiling of total ÷ limit; zero when there are no matches"]]} />
        </section>
        <section id="examples"><h2>Code examples</h2>
          <p>These examples make requests only when you run them. The documentation does not automatically query the API. Download links may redirect to the hosting provider.</p>
          <Code title="JavaScript" value={js} /><Code title="Python (standard library)" value={python} /><Code title="PowerShell" value={powershell} /><Code title="JavaScript pagination" value={paginated} />
          <p>Browser fetches need no Authorization header or credentials. Public application responses allow all origins. If an edge/firewall error lacks CORS headers, the browser may expose a generic network failure rather than its HTTP response.</p>
        </section>
        <section id="errors"><h2>Errors</h2>
          <Code title="Application error response" value={JSON.stringify({error:{code:"INVALID_QUERY",message:"limit must be an integer between 1 and 100."}},null,2)} />
          <Table columns={["HTTP status", "Code", "What to do"]} rows={[["400","INVALID_QUERY","Correct the parameters or malformed level ID; do not retry unchanged."],["404","NOT_FOUND","Check the level ID/path. Removed levels may no longer exist."],["405","METHOD_NOT_ALLOWED","Use GET, HEAD or OPTIONS."],["429","Platform-controlled","Pause requests. Honor Retry-After if present; otherwise wait at least 60 seconds, then retry with backoff and jitter."],["500","INTERNAL_ERROR","Temporary catalog failure. Retry later with a bounded backoff."]]} />
          <p>Application errors are JSON and marked no-store. Hosting/firewall errors can be text or HTML and may not include Retry-After or the application error shape. Check status before parsing JSON; handle timeouts and network errors too. Avoid infinite retries.</p>
        </section>
        <section id="limits"><h2>Limits &amp; caching</h2>
          <p>The production firewall is configured for <strong className="text-text">60 requests per IP per 60-second fixed window</strong>, shared across the API prefix. OPTIONS is excluded. Shared networks share the allowance; the fixed window can also produce bursts near a boundary. This is a firewall setting, not an API key quota or a guaranteed global counter.</p>
          <p>Cache results in your integration and avoid polling on every keystroke. Fetch pages sequentially and leave headroom for other users on the same IP. Use a timeout and bounded retries. API access is free, but availability remains subject to hosting allowances; there is no uptime SLA.</p>
          <p>Successful responses permit a 300-second CDN cache and 60-second stale revalidation. Browser max-age is zero. Updates appear after website deployment and cache refresh; do not assume instant visibility. Responses intentionally omit ETags and do not offer a 304 conditional-request contract.</p>
          <p>The v1 URL versions the interface. Clients should tolerate additional response fields and handle null values. Breaking interface changes should use a new version. The catalog itself can change or remove entries without changing the API version.</p>
          <p>Read the <a href="/terms" className={linkStyle}>Terms</a> and <a href="/privacy" className={linkStyle}>Privacy Policy</a>. Questions or broken metadata can be reported through <a href="/support/new" className={linkStyle}>support</a> or the <a href="https://github.com/GDMacros-com/GDMacros/issues" className={linkStyle}>GitHub issue tracker</a>.</p>
        </section>
      </article>
    </div>
  </div>;
}
