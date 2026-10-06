"""Builds the Feature Atlas outputs from docs/features/features.json (the source of truth):
  - docs/features/FEATURES.md (+ mirrors features.json, FEATURES.md, CHANGELOG.md into Sefaria-Project/client-rebuild-inventory)
  - the single-file HTML atlas (published as an Artifact), path from $ATLAS_HTML or docs/features/build/atlas.html
Marks each feature `rebuild: true` when tests in this repo carry its `@feature` tag.
Usage: python3 docs/features/tools/build.py"""
import json, re, collections, os, pathlib, subprocess, shutil, datetime, html as H
HERE = pathlib.Path(__file__).resolve().parent
FEAT = HERE.parent
ROOT = FEAT.parents[1]
SHA = "bb47dd77a5d92b55814ba221199f1e39ad66d021"  # Sefaria-Project commit the atlas was read from
MIRROR = pathlib.Path(os.environ.get("ATLAS_MIRROR", "/Users/akiva/Sefaria/dev/Sefaria-Project/client-rebuild-inventory"))
OUT_HTML = pathlib.Path(os.environ.get("ATLAS_HTML", FEAT / "build" / "atlas.html"))
items = json.load(open(FEAT / "features.json"))
covered = set(json.loads(subprocess.run(["node", "scripts/feature-coverage.mjs", "--json"], cwd=ROOT, capture_output=True, text=True, check=True).stdout)["covered"])
keep = ["id","area","group","name","summary","details","audience","platform","status","tier","refs","src"]
# Rebuild status: docs/features/rebuild-status.json decides; otherwise tagged tests mean done; otherwise todo.
RB = json.load(open(FEAT / "rebuild-status.json")) if (FEAT / "rebuild-status.json").exists() else {}
def rb_status(i):
    if i["id"] in RB: return RB[i["id"]]["status"]
    if i["id"] in covered: return "done"
    if i["tier"] == "retire" or i["status"] in ("unused", "branch-only"): return "n/a"
    return "todo"
items = [{**{k: i[k] for k in keep}, "rebuild": i["id"] in covered, "rb": rb_status(i), "rbNote": RB.get(i["id"], {}).get("note", "")} for i in items]

def md_to_html(md):
    out, in_list = [], False
    def inline(t):
        t = H.escape(t, quote=False)
        t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
        t = re.sub(r"\*(.+?)\*", r"<i>\1</i>", t)
        t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
        return re.sub(r"\b([A-Z]{2,3}-\d{3})\b", r'<a href="#\1">\1</a>', t)
    for line in md.splitlines():
        if line.startswith("- "):
            if not in_list: out.append("<ul>"); in_list = True
            out.append("<li>" + inline(line[2:]) + "</li>"); continue
        if in_list: out.append("</ul>"); in_list = False
        if line.startswith("### "): out.append("<h3>" + inline(line[4:]) + "</h3>")
        elif line.startswith("## "): out.append("<h3>" + inline(line[3:]) + "</h3>")
        elif line.startswith("# "): out.append('<h2 id="changelogTitle">Changes to this atlas</h2>')
        elif line.strip(): out.append("<p>" + inline(line) + "</p>")
    if in_list: out.append("</ul>")
    return "\n".join(out)

changelog = open(FEAT / "CHANGELOG.md").read()
data = json.dumps(items, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = (open(HERE / "atlas_template.html").read().replace("__DATA__", data).replace("__SHA__", SHA)
        .replace("__CHANGELOG__", md_to_html(changelog)).replace("__BUILT__", datetime.date.today().isoformat()))
OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
OUT_HTML.write_text(html)
REPO = str(FEAT) + "/"
# Markdown
AREAS=[("Reader",[("reader-shell","Reader shell & panels"),("text-display","Text display & reading settings"),("text-types","Text types & special cases"),("connections","Connections & resources sidebar"),("versions","Versions & translations")]),
("Library & discovery",[("library-nav","Library navigation"),("book-pages","Book pages"),("topics","Topics"),("calendars","Calendars"),("search","Search & autocomplete")]),
("Voices (sheets & community)",[("sheets-view","Sheets: viewing"),("sheets-editor","Sheets: editing & publishing"),("collections","Collections"),("profile-social","Profiles & social"),("user-library","Saved, history & notes"),("notifications","Notifications & email")]),
("Site & accounts",[("global-ui","Global UI"),("accounts","Accounts & sign-in"),("promotions","Promotions & CMS"),("static-pages","Static pages"),("i18n-a11y","Language & accessibility"),("ai","AI features")]),
("Platform",[("routing","URLs & routing"),("platform-seo","SSR, SEO & platform"),("api-data","Public API & data exports"),("analytics","Analytics"),("linker-embeds","Linker & embeds")]),
("Internal & legacy",[("admin-tools","Admin & moderator tools"),("legacy-pages","Legacy pages")])]
def link(r):
    m=re.match(r'^([\w.\-/]+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$',r.strip())
    if not m: return f"`{r}`"
    u=f"https://github.com/Sefaria/Sefaria-Project/blob/{SHA}/{m[1]}"
    if m[2]: u+=f"#L{m[2]}"+(f"-L{m[3]}" if m[3] else "")
    return f"[`{r}`]({u})"
by=collections.defaultdict(list)
for i in items: by[i['area']].append(i)
T=collections.Counter(i['tier'] for i in items)
out=[f"# Sefaria Client Feature Atlas\n",
f"Master list of every feature in the current Sefaria web client, extracted from a full code read at commit `{SHA[:7]}` (master, 2026-10-04).\n",
f"**{len(items)} features**, {sum(len(i['details']) for i in items)} documented behaviors. Proposed tiers: core {T['core']}, standard {T['standard']}, optional {T['optional']}, retire {T['retire']}.\n",
"- **Tier** (proposal, for product to confirm): `core` can't launch without it · `standard` parity, can follow core · `optional` niche/rethink · `retire` unused, broken or superseded.",
"- **Status**: `live` · `legacy` (old Django/jQuery/CKEditor stack) · `unused` (code, no UI) · `broken` · `branch-only`.",
"- Detail bullets prefixed **BUG / DEAD / SECURITY** flag things not to port as-is.",
"- `features.json` is the same data, machine-readable. The `inv_*.md` files are the long-form write-ups each item's *Source* points to.\n",
"## Contents\n"]
for dn,lst in AREAS:
    out.append(f"- **{dn}**: "+" · ".join(f"[{l}](#{k}) ({len(by[k])})" for k,l in lst))
for dn,lst in AREAS:
    out.append(f"\n---\n\n# {dn}\n")
    for k,l in lst:
        out.append(f'\n<a id="{k}"></a>\n## {l}\n')
        g=None
        for i in by[k]:
            if i['group']!=g: g=i['group']; out.append(f"\n### {g}\n")
            tags=f"`{i['tier']}` `{i['status']}`"+(f" · rebuild: **{i['rb']}**" + (f" — {i['rbNote']}" if i['rbNote'] else "") + (" · *tested*" if i['rebuild'] else ""))+("" if i['audience']=="all" else f" `{i['audience']}`")+("" if i['platform']=="all" else f" `{i['platform']} only`")
            out.append(f"#### {i['id']} · {i['name']}\n{tags}\n\n{i['summary']}\n")
            for d in i['details']:
                d2=re.sub(r'^(BUG|DEAD|SECURITY):\s*',r'**\1:** ',d)
                out.append(f"- {d2}")
            if i['refs']: out.append("\nCode: "+", ".join(link(r) for r in i['refs']))
            out.append(f"\nSource: `{i['src']}`\n")
RBC = collections.Counter(i['rb'] for i in items)
out.insert(4, f"- **Rebuild status** (new reader): done {RBC['done']} · partial {RBC['partial']} · todo {RBC['todo']} · replaced {RBC['replaced']} · deferred {RBC['deferred']} · n/a {RBC['n/a']}; {sum(i['rebuild'] for i in items)} are covered by tagged tests. Corrections found while rebuilding are logged in [CHANGELOG.md](CHANGELOG.md).")
open(REPO+"FEATURES.md","w").write("\n".join(out))
if MIRROR.exists():
    for n in ["features.json", "FEATURES.md", "CHANGELOG.md"]:
        shutil.copy(FEAT / n, MIRROR / n)
print(len(html)//1024,"KB html")
