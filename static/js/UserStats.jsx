import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { useDebounce } from './Hooks';
import { LoadingRing } from './Misc';

/*
 * Torah Tracker: a reader's learning history as an explorable dashboard.
 * One request loads the history (/api/torah_tracker/<uid>); every chart below aggregates it
 * client-side against three shared filters that drill down and back up:
 *   time (all years > year > month), library (category > ... > book > chapter), study partner.
 */

// ---------- visual tokens (validated with the dataviz palette checks) ----------
// Sefaria's category colors are brand identities, not a chart palette (they fail colorblind separation),
// so charts never rely on them alone: every category mark is also labeled or faceted.
const CATEGORY_HEX = {
  "Tanakh": "#004E5F", "Mishnah": "#5A99B7", "Talmud": "#CCB479", "Midrash": "#5D956F",
  "Halakhah": "#802F3E", "Kabbalah": "#594176", "Liturgy": "#AB4E66", "Jewish Thought": "#7F85A9",
  "Tosefta": "#00827F", "Chasidut": "#97B386", "Musar": "#594176", "Responsa": "#CB6158",
  "Second Temple": "#C6A7B4", "Reference": "#D4896C", "Modern Works": "#7F85A9", "Other": "#9a9a96",
};
const catColor = cat => CATEGORY_HEX[cat] || "#7F85A9";
const SEQ = ["#86bcc5", "#5a9eaa", "#35808e", "#196373", "#003f4d"];  // single-hue teal, light -> dark
const EMPTY = "#ececea";
const ACCENT = "#196373";
const LANGS = ["English", "Bilingual", "Hebrew"];
const LANG_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];  // validated all-pairs; labeled + table for contrast relief
const INK = {primary: "#1f1f1f", secondary: "#5c5c5c", muted: "#8a8a8a", grid: "#e6e6e3"};
const COMMENTARY_BLUE = "#4B71B7";
const LANG_CODES = {e: "English", b: "Bilingual", h: "Hebrew"};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Shabbat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = d3.format(",");
const fmtDay = d3.timeFormat("%b %-d, %Y");
const fmtMonth = d3.timeFormat("%b %Y");
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const yearLabel = y => y < 0 ? `${-y} BCE` : y === 0 ? "0" : `${y} CE`;
const textUrl = ref => "/" + Sefaria.normRef(ref);

// Canonical Tanakh order with chapter counts (929 chapters)
const TANAKH = [
  ["Torah", [["Genesis", 50], ["Exodus", 40], ["Leviticus", 27], ["Numbers", 36], ["Deuteronomy", 34]]],
  ["Prophets", [["Joshua", 24], ["Judges", 21], ["I Samuel", 31], ["II Samuel", 24], ["I Kings", 22], ["II Kings", 25],
    ["Isaiah", 66], ["Jeremiah", 52], ["Ezekiel", 48], ["Hosea", 14], ["Joel", 4], ["Amos", 9], ["Obadiah", 1],
    ["Jonah", 4], ["Micah", 7], ["Nahum", 3], ["Habakkuk", 3], ["Zephaniah", 3], ["Haggai", 2], ["Zechariah", 14], ["Malachi", 3]]],
  ["Writings", [["Psalms", 150], ["Proverbs", 31], ["Job", 42], ["Song of Songs", 8], ["Ruth", 4], ["Lamentations", 5],
    ["Ecclesiastes", 12], ["Esther", 10], ["Daniel", 12], ["Ezra", 10], ["Nehemiah", 13], ["I Chronicles", 29], ["II Chronicles", 36]]],
];
const TANAKH_BOOKS = TANAKH.flatMap(([division, books]) => books.map(([book, chapters]) => ({book, chapters, division})));
const TANAKH_TOTAL = d3.sum(TANAKH_BOOKS, b => b.chapters);


// ---------- data ----------
const chapterOf = (ref, book) => {
  if (!ref.startsWith(book)) { return null; }
  const rest = ref.slice(book.length);
  if (rest.startsWith(" ")) { return rest.slice(1).split(":")[0].split("-")[0]; }
  if (rest.startsWith(", ")) { return rest.slice(2).split(",")[0].split(":")[0]; }
  return null;
};

const prepare = data => data.records.map(([ts, ref, book, sec, lang]) => {
  const date = new Date(ts * 1000);
  const info = data.books[book] || {};
  const cats = info.categories && info.categories.length ? info.categories : ["Other"];
  const chapter = chapterOf(ref, book);
  return {
    date, ref, book, info, chapter,
    sidebar: !!sec,
    lang: LANG_CODES[lang] || null,
    day: d3.timeDay.floor(date),
    year: date.getFullYear(), month: date.getMonth(), dow: date.getDay(), hour: date.getHours(),
    cat: cats[0],
    path: chapter ? [...cats, book, chapter] : [...cats, book],
    partner: info.partner || null,
    // Where a commentary's base text lives (Rashi on Genesis -> Tanakh > Torah > Genesis), so partners follow the library filter
    basePath: info.partner && info.base && info.base[0] ? [...((data.books[info.base[0]] || {}).categories || []), info.base[0]] : null,
  };
});

const streaks = rows => {
  const days = Array.from(new Set(rows.map(r => +r.day))).sort((a, b) => a - b).map(t => new Date(t));
  let best = {length: 0}, run = null;
  days.forEach((d, i) => {
    run = (i && d3.timeDay.count(days[i - 1], d) === 1) ? {start: run.start, end: d, length: run.length + 1} : {start: d, end: d, length: 1};
    if (run.length > best.length) { best = run; }
  });
  const today = d3.timeDay.floor(new Date());
  const current = run && d3.timeDay.count(run.end, today) <= 1 ? run.length : 0;
  return {days, best, current};
};


// ---------- building blocks ----------
const useWidth = () => {
  const ref = useRef();
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) { return; }  // card rendered its empty state instead of a chart
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [!ref.current]);
  return [ref, width];
};

// Renders an Observable Plot figure. Clicks report the datum under the pointer (Plot's figure.value).
const PlotFigure = ({options, onClick}) => {
  const ref = useRef();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  useEffect(() => {
    if (!options) { return; }
    const figure = Plot.plot({style: {fontFamily: "var(--english-sans-serif-font-family)", fontSize: "12px", color: INK.secondary}, ...options});
    if (clickRef.current) {
      figure.classList.add("clickable");
      figure.addEventListener("click", () => { if (figure.value != null && clickRef.current) { clickRef.current(figure.value); } });
    }
    ref.current.replaceChildren(figure);
    return () => figure.remove();
  }, [options]);
  return <div ref={ref} className="plotFigure"/>;
};

// A dashboard card. Every chart has a table-view twin (the accessible equivalent).
const Card = ({title, subtitle, table, wide, children, className = ""}) => {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`ttCard ${wide ? "wide" : ""} ${className}`}>
      <header className="ttCardHeader">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="ttSubtitle">{subtitle}</p>}
        </div>
        {table && <button className="ttLinkButton" onClick={() => setShowTable(!showTable)}>{showTable ? "Show chart" : "Show table"}</button>}
      </header>
      {showTable && table ? <DataTable {...table}/> : children}
    </section>
  );
};

const DataTable = ({columns, rows}) => (
  <div className="ttTableWrap">
    <table className="ttTable">
      <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{typeof v === "number" ? fmt(v) : v}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const Breadcrumb = ({label, items, onSelect}) => (
  <div className="ttCrumbs">
    <span className="ttCrumbLabel">{label}</span>
    {items.map((item, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="ttCrumbSep">›</span>}
        {i === items.length - 1 ? <span className="ttCrumbCurrent">{item}</span> :
          <button className="ttCrumb" onClick={() => onSelect(i)}>{item}</button>}
      </React.Fragment>
    ))}
  </div>
);


// ---------- page ----------
const UserStats = () => {
  const [uid, setUid] = useState(null);
  const debouncedUid = useDebounce(uid, 500);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const target = debouncedUid || Sefaria._uid;
    setLoading(true);
    setError(null);
    $.getJSON("/api/torah_tracker/" + target)
      .then(d => { setData(d); setLoading(false); })
      .fail(xhr => { setError((xhr.responseJSON && xhr.responseJSON.error) || "We couldn't load your learning history."); setLoading(false); });
  }, [debouncedUid]);

  return (
    <div className="homeFeedWrapper userStats torahTracker">
      <div className="content">
        <div className="contentInner">
          <div className="ttTop">
            <div>
              <div className="ttEyebrow">Torah Tracker</div>
              <h1>{data ? data.name : " "}</h1>
            </div>
            <div className="ttTopControls">
              {Sefaria.torahTrackerDemo && <label className="ttToggle">
                <input type="checkbox" checked={uid === "ploni"} onChange={e => setUid(e.target.checked ? "ploni" : null)}/>
                <span>View as Ploni</span>
              </label>}
              {Sefaria.is_moderator && <label className="ttToggle">
                <span>User ID</span>
                <input type="text" size="7" onChange={e => setUid(parseInt(e.target.value) || null)}/>
              </label>}
            </div>
          </div>
          {error && <div className="ttEmpty">{error}</div>}
          {!data && !error && <div className="ttEmpty"><LoadingRing/></div>}
          {data && <div style={{opacity: loading ? 0.45 : 1, transition: "opacity .2s"}}>
            <Dashboard key={data.name} data={data}/>
          </div>}
        </div>
      </div>
    </div>
  );
};


const Dashboard = ({data}) => {
  const rows = useMemo(() => prepare(data), [data]);
  const [time, setTime] = useState({year: null, month: null});
  const [path, setPath] = useState([]);
  const [partner, setPartner] = useState(null);
  const [day, setDay] = useState(null);

  const inTime = r => (time.year === null || r.year === time.year) && (time.month === null || r.month === time.month);
  const inPath = r => path.every((p, i) => r.path[i] === p);
  const inPartner = r => !partner || r.partner === partner;
  // With a partner selected, the library filter matches the commentary's base text too
  const inScopePath = r => inPath(r) || (partner && r.basePath && path.every((p, i) => r.basePath[i] === p));
  const scoped = useMemo(() => rows.filter(r => inTime(r) && inScopePath(r) && inPartner(r)), [rows, time, path, partner]);
  const scopedAnyPath = useMemo(() => rows.filter(r => inTime(r) && inPartner(r)), [rows, time, partner]);
  const inBasePath = r => r.basePath && path.every((p, i) => r.basePath[i] === p);
  const scopedAnyPartner = useMemo(() => rows.filter(r => inTime(r) && (inPath(r) || inBasePath(r))), [rows, time, path]);
  const calendarRows = useMemo(() => rows.filter(r => (time.year === null || r.year === time.year) && inPath(r) && inPartner(r)), [rows, time.year, path, partner]);

  if (!rows.length) {
    return <div className="ttEmpty">No reading history yet. Read a few texts while logged in and they'll show up here.</div>;
  }

  const drillTime = d => setTime(time.year === null ? {year: d.getFullYear(), month: null} : {year: time.year, month: d.getMonth()});
  const timeItems = ["All years", ...(time.year !== null ? [String(time.year)] : []), ...(time.month !== null ? [MONTHS[time.month]] : [])];
  const libraryItems = ["All texts", ...path];
  const filtered = time.year !== null || path.length || partner;

  return (
    <>
      <div className="ttFilters">
        <Breadcrumb label="When" items={timeItems} onSelect={i => setTime(i === 0 ? {year: null, month: null} : {year: time.year, month: null})}/>
        <Breadcrumb label="What" items={libraryItems} onSelect={i => setPath(path.slice(0, i))}/>
        {partner && <div className="ttCrumbs"><span className="ttCrumbLabel">With</span>
          <button className="ttChip" onClick={() => setPartner(null)}>{partner} ✕</button></div>}
        {filtered && <button className="ttLinkButton" onClick={() => { setTime({year: null, month: null}); setPath([]); setPartner(null); setDay(null); }}>Reset</button>}
      </div>

      {scoped.length === 0 ? <div className="ttEmpty">Nothing read in this slice. Try widening the filters above.</div> : <>
        <StatTiles rows={scoped}/>
        <Insights rows={scoped}/>
        <div className="ttGrid">
          <TimelineCard rows={scoped} time={time} onDrill={drillTime} onDay={setDay}/>
          <CategoryMultiplesCard rows={scoped} path={path} time={time} onDrill={name => setPath([...path, name])}/>
          <CalendarCard rows={calendarRows} time={time} selectedDay={day} onDay={setDay} onYear={y => setTime({year: y, month: null})}/>
          {day && <DayDetail rows={scoped.filter(r => +r.day === +day)} day={day} onClose={() => setDay(null)}/>}
          <LibraryCard rows={scopedAnyPath} path={path} setPath={setPath}/>
          <PartnersCard rows={scopedAnyPartner} partner={partner} setPartner={setPartner}/>
          <TanakhCard rows={scopedAnyPath}/>
          <ErasCard rows={scoped} onBook={r => setPath(r.path.slice(0, r.path.indexOf(r.book) + 1))}/>
          <RhythmCard rows={scoped}/>
          <LanguageCard rows={scoped} time={time}/>
          <TopPassagesCard rows={scoped}/>
        </div>
      </>}
    </>
  );
};


// ---------- summary ----------
const StatTiles = ({rows}) => {
  const {days, best, current} = streaks(rows);
  const tiles = [
    ["Sections read", new Set(rows.map(r => r.ref)).size],
    ["Books opened", new Set(rows.map(r => r.book)).size],
    ["Study partners", new Set(rows.map(r => r.partner).filter(Boolean)).size],
    ["Longest streak", best.length, best.length === 1 ? "day" : "days"],
    ["Current streak", current, current === 1 ? "day" : "days"],
  ];
  return (
    <div className="ttStats">
      <div className="ttHero">
        <div className="ttHeroValue">{fmt(days.length)}</div>
        <div className="ttHeroLabel">days of learning · {fmt(rows.length)} page views</div>
      </div>
      {tiles.map(([label, value, unit]) => (
        <div className="ttTile" key={label}>
          <div className="ttTileLabel">{label}</div>
          <div className="ttTileValue">{fmt(value)}{unit && <span className="ttTileUnit"> {unit}</span>}</div>
        </div>
      ))}
    </div>
  );
};

const Insights = ({rows}) => {
  const first = rows[0];
  const byDay = d3.rollups(rows, v => v.length, r => +r.day).sort((a, b) => b[1] - a[1])[0];
  const topBook = d3.rollups(rows.filter(r => !r.sidebar), v => v.length, r => r.book).sort((a, b) => b[1] - a[1])[0];
  const topPartner = d3.rollups(rows.filter(r => r.partner), v => v.length, r => r.partner).sort((a, b) => b[1] - a[1])[0];
  const {best} = streaks(rows);
  const shabbat = rows.filter(r => r.dow === 6).length;
  const facts = [
    first && ["First step", `${first.ref}`, fmtDay(first.date)],
    byDay && ["Biggest day", `${fmt(byDay[1])} page views`, fmtDay(new Date(byDay[0]))],
    best.length > 1 && ["Longest streak", `${best.length} days in a row`, `${fmtDay(best.start)} – ${fmtDay(best.end)}`],
    topBook && ["Most-read book", topBook[0], `${fmt(topBook[1])} views`],
    topPartner && ["Closest study partner", topPartner[0], `${fmt(topPartner[1])} times`],
    rows.length > 100 && pct(shabbat, rows.length) < 2 && ["Rhythm", "Rests on Shabbat", `${pct(shabbat, rows.length)}% of reading falls on Shabbat`],
  ].filter(Boolean);
  return (
    <div className="ttInsights">
      {facts.map(([label, value, note]) => (
        <div className="ttInsight" key={label}>
          <div className="ttInsightLabel">{label}</div>
          <div className="ttInsightValue">{value}</div>
          <div className="ttInsightNote">{note}</div>
        </div>
      ))}
    </div>
  );
};


// ---------- time ----------
const timeBuckets = (rows, time) => {
  let interval, start, end;
  if (time.year === null) {
    interval = d3.timeMonth;
    [start, end] = d3.extent(rows, r => r.date);
    end = d3.timeMonth.offset(end, 1);
  } else if (time.month === null) {
    interval = d3.timeWeek;
    start = new Date(time.year, 0, 1); end = new Date(time.year + 1, 0, 1);
  } else {
    interval = d3.timeDay;
    start = new Date(time.year, time.month, 1); end = new Date(time.year, time.month + 1, 1);
  }
  const counts = d3.rollup(rows, v => v.length, r => +interval.floor(r.date));
  const unit = interval === d3.timeMonth ? "month" : interval === d3.timeWeek ? "week" : "day";
  return {unit, interval, buckets: interval.range(interval.floor(start), end).map(date => ({date, count: counts.get(+date) || 0}))};
};

const TimelineCard = ({rows, time, onDrill, onDay}) => {
  const [ref, width] = useWidth();
  const {unit, buckets} = useMemo(() => timeBuckets(rows, time), [rows, time]);
  const peak = d3.greatest(buckets, d => d.count);
  const label = d => unit === "month" ? fmtMonth(d) : unit === "week" ? `Week of ${fmtDay(d)}` : fmtDay(d);
  const peakAt = peak ? buckets.indexOf(peak) / Math.max(1, buckets.length - 1) : 0.5;
  const peakAnchor = peakAt < 0.15 ? "start" : peakAt > 0.85 ? "end" : "middle";  // keep the label inside the plot
  const options = useMemo(() => width && ({
    width, height: 260, marginLeft: 44, marginTop: 24,
    x: {type: "time", label: null},
    y: {grid: true, label: null, nice: true},
    marks: [
      Plot.gridY({stroke: INK.grid, strokeOpacity: 1}),
      Plot.areaY(buckets, {x: "date", y: "count", fill: ACCENT, fillOpacity: 0.1, curve: "monotone-x"}),
      Plot.lineY(buckets, {x: "date", y: "count", stroke: ACCENT, strokeWidth: 2, curve: "monotone-x"}),
      Plot.ruleY([0], {stroke: INK.grid}),
      Plot.dot(peak && peak.count ? [peak] : [], {x: "date", y: "count", r: 4, fill: ACCENT, stroke: "white", strokeWidth: 2}),
      Plot.text(peak && peak.count ? [peak] : [], {x: "date", y: "count", text: d => `Peak: ${label(d.date)}`, dy: -12, fill: INK.primary, fontWeight: 600,
        textAnchor: peakAnchor}),
      Plot.ruleX(buckets, Plot.pointerX({x: "date", stroke: INK.muted})),
      Plot.dot(buckets, Plot.pointerX({x: "date", y: "count", r: 4, fill: ACCENT, stroke: "white", strokeWidth: 2})),
      Plot.tip(buckets, Plot.pointerX({x: "date", y: "count", title: d => `${fmt(d.count)} page views\n${label(d.date)}${unit !== "day" ? "\nClick to zoom in" : "\nClick to see the day"}`})),
    ],
  }), [buckets, width]);
  return (
    <Card wide title="Learning over time" subtitle={`Page views per ${unit}. Click the line to zoom into a ${unit === "month" ? "year" : unit === "week" ? "month" : "day"}.`}
          table={{columns: [unit[0].toUpperCase() + unit.slice(1), "Page views"], rows: buckets.filter(b => b.count).map(b => [label(b.date), b.count])}}>
      <div ref={ref}><PlotFigure options={options} onClick={d => unit === "day" ? onDay(d.date) : onDrill(d.date)}/></div>
    </Card>
  );
};

// Children of the current library node as small multiples, so each gets its own labeled line
const CategoryMultiplesCard = ({rows, path, time, onDrill}) => {
  const [ref, width] = useWidth();
  const depth = path.length;
  const {buckets} = useMemo(() => timeBuckets(rows, time), [rows, time]);
  const groups = useMemo(() => d3.rollups(rows.filter(r => r.path.length > depth), v => v, r => r.path[depth])
    .map(([name, v]) => ({name, rows: v, cat: v[0].cat})).sort((a, b) => b.rows.length - a.rows.length).slice(0, 8), [rows, depth]);
  const max = d3.max(groups, g => d3.max(timeBuckets(g.rows, time).buckets, b => b.count)) || 1;
  const sparkWidth = Math.max(120, width - 250);
  return (
    <Card wide title={depth ? `Inside ${path[depth - 1]}` : "By category"} subtitle="Same time scale on every row. Click a row to drill in."
          table={{columns: ["Name", "Page views"], rows: groups.map(g => [g.name, g.rows.length])}}>
      <div ref={ref} className="ttMultiples">
        {groups.map(g => <MultipleRow key={g.name} group={g} time={time} domain={[buckets[0].date, buckets[buckets.length - 1].date]}
                                      max={max} width={sparkWidth} onClick={() => onDrill(g.name)}/>)}
        {!groups.length && <div className="ttMuted">This is as deep as it goes.</div>}
      </div>
    </Card>
  );
};

const MultipleRow = ({group, time, domain, max, width, onClick}) => {
  const {buckets} = timeBuckets(group.rows, time);
  const color = catColor(group.cat);
  const options = useMemo(() => ({
    width, height: 44, margin: 2, marginBottom: 2, axis: null,
    x: {type: "time", domain}, y: {domain: [0, max]},
    marks: [
      Plot.areaY(buckets, {x: "date", y: "count", fill: color, fillOpacity: 0.12, curve: "monotone-x"}),
      Plot.lineY(buckets, {x: "date", y: "count", stroke: color, strokeWidth: 2, curve: "monotone-x"}),
      Plot.ruleY([0], {stroke: INK.grid}),
      Plot.tip(buckets, Plot.pointerX({x: "date", y: "count", title: d => `${group.name}: ${fmt(d.count)}\n${fmtMonth(d.date)}`})),
    ],
  }), [group, width, max, domain[0], domain[1]]);
  return (
    <button className="ttMultiple" onClick={onClick}>
      <span className="ttSwatch" style={{background: color}}/>
      <span className="ttMultipleName">{group.name}</span>
      <span className="ttMultipleValue">{fmt(group.rows.length)}</span>
      <PlotFigure options={options}/>
    </button>
  );
};


// ---------- calendar ----------
const CalendarCard = ({rows, time, selectedDay, onDay, onYear}) => {
  const [ref, width] = useWidth();
  const counts = useMemo(() => d3.rollup(rows, v => v.length, r => +r.day), [rows]);
  const years = time.year !== null ? [time.year] : d3.range(d3.min(rows, r => r.year), d3.max(rows, r => r.year) + 1).reverse();
  const cells = useMemo(() => years.flatMap(y => d3.timeDays(new Date(y, 0, 1), new Date(y + 1, 0, 1)).map(d => ({
    date: d, year: y, week: d3.timeWeek.count(d3.timeYear(d), d), dow: d.getDay(), month: d.getMonth(), count: counts.get(+d) || 0,
  }))), [counts, years.join()]);
  const monthTicks = d3.range(12).map(m => d3.timeWeek.count(new Date(2024, 0, 1), new Date(2024, m, 1)));
  const cell = Math.max(6, Math.min(16, Math.floor((width - 70) / 54)));
  const options = useMemo(() => width && ({
    width: cell * 54 + 70, height: years.length * (cell * 7 + 18) + 30, marginLeft: 70, marginTop: 24, marginBottom: 4,
    padding: 0, fy: {label: null, domain: years, tickFormat: d => String(d), padding: 0.25},
    x: {axis: "top", label: null, ticks: monthTicks, tickFormat: w => MONTHS[monthTicks.indexOf(w)], tickSize: 0},
    y: {label: null, tickFormat: d => ["Sun", "", "Tue", "", "Thu", "", "Shab"][d], tickSize: 0},
    color: {type: "threshold", domain: [1, 3, 6, 11, 21], range: [EMPTY, ...SEQ]},
    marks: [
      Plot.cell(cells, {x: "week", y: "dow", fy: "year", fill: "count", inset: 1, rx: 2,
        fillOpacity: d => time.month === null || d.month === time.month ? 1 : 0.25}),
      Plot.cell(cells.filter(d => selectedDay && +d.date === +selectedDay), {x: "week", y: "dow", fy: "year", stroke: INK.primary, strokeWidth: 2, fill: "none"}),
      Plot.tip(cells, Plot.pointer({x: "week", y: "dow", fy: "year", title: d => `${d.count ? fmt(d.count) + " page views" : "No reading"}\n${fmtDay(d.date)}`})),
    ],
  }), [cells, width, selectedDay, time.month]);
  const active = cells.filter(c => c.count).length;
  return (
    <Card wide title={time.year !== null ? `${time.year}, day by day` : "Every day you learned"}
          subtitle={`${fmt(active)} active days. Click a day to see what you read${time.year === null ? ", or a year to zoom in" : ""}.`}
          table={{columns: ["Date", "Page views"], rows: cells.filter(c => c.count).map(c => [fmtDay(c.date), c.count])}}>
      <div ref={ref} className="ttCalendar">
        <PlotFigure options={options} onClick={d => onDay(d.date)}/>
        <div className="ttLegend">
          <span>Less</span>{[EMPTY, ...SEQ].map(c => <span key={c} className="ttLegendCell" style={{background: c}}/>)}<span>More</span>
          {time.year === null && <span className="ttYearJump">Zoom to year: {years.map(y =>
            <button key={y} className="ttLinkButton" onClick={() => onYear(y)}>{y}</button>)}</span>}
        </div>
      </div>
    </Card>
  );
};

const DayDetail = ({rows, day, onClose}) => {
  const byBook = d3.groups(rows, r => r.book);
  return (
    <section className="ttCard wide ttDay">
      <header className="ttCardHeader">
        <div><h2>{d3.timeFormat("%A, %B %-d, %Y")(day)}</h2>
          <p className="ttSubtitle">{rows.length ? `${fmt(rows.length)} page views across ${byBook.length} ${byBook.length === 1 ? "book" : "books"}` : "Nothing read on this day in the current filters."}</p></div>
        <button className="ttLinkButton" onClick={onClose}>Close</button>
      </header>
      <div className="ttDayBooks">
        {byBook.map(([book, v]) => (
          <div key={book} className="ttDayBook">
            <div className="ttDayBookTitle"><span className="ttSwatch" style={{background: catColor(v[0].cat)}}/>{book}</div>
            {Array.from(new Set(v.map(r => r.ref))).map(ref => (
              <a key={ref} href={textUrl(ref)} className="ttDayRef">{ref}{v.some(r => r.ref === ref && r.sidebar) ? " · sidebar" : ""}</a>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};


// ---------- library ----------
const RINGS = 3;
const LibraryCard = ({rows, path, setPath}) => {
  const [hover, setHover] = useState(null);
  const depth = path.length;
  const inNode = rows.filter(r => path.every((p, i) => r.path[i] === p));
  const root = useMemo(() => {
    const tree = {name: path[depth - 1] || "All texts", children: new Map(), own: 0};
    inNode.forEach(r => {
      let node = tree;
      const steps = r.path.slice(depth, depth + RINGS);
      steps.forEach((name, i) => {
        if (!node.children.has(name)) { node.children.set(name, {name, children: new Map(), own: 0, cat: r.cat}); }
        node = node.children.get(name);
        if (i === steps.length - 1) { node.own += 1; }
      });
      if (!steps.length) { tree.own += 1; }
    });
    const h = d3.hierarchy(tree, d => Array.from(d.children.values())).sum(d => d.own).sort((a, b) => b.value - a.value);
    return d3.partition().size([2 * Math.PI, RINGS + 1])(h);
  }, [inNode, depth]);

  const size = 440, radius = size / 2, ring = radius / (RINGS + 1);
  const arc = d3.arc().startAngle(d => d.x0).endAngle(d => d.x1).padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.006)).padRadius(radius)
    .innerRadius(d => d.y0 * ring).outerRadius(d => d.y1 * ring - 2);
  const nodePath = n => [...path, ...n.ancestors().reverse().slice(1).map(a => a.data.name)];
  // Color by top-level category: fixed once we're inside one, else the slice's own ring-1 ancestor
  const sliceColor = d => catColor(depth ? path[0] : d.ancestors().reverse()[1].data.name);
  const current = path[depth - 1];
  const isBook = current && rows.some(r => r.book === current);
  const shown = hover || root;
  const children = root.children || [];
  return (
    <Card title="Your library" subtitle="Rings go deeper: category, section, book, chapter. Click a slice to drill in, the center to go back up."
          table={{columns: ["Name", "Page views", "Share"], rows: children.map(c => [c.data.name, c.value, `${pct(c.value, root.value)}%`])}}>
      <div className="ttLibrary">
        <svg viewBox={`${-radius} ${-radius} ${size} ${size}`} className="ttSunburst" role="img" aria-label="Library sunburst">
          {root.descendants().slice(1).map((d, i) => (
            <path key={i} d={arc(d)} fill={sliceColor(d)}
                  fillOpacity={[1, 0.72, 0.5][d.depth - 1]} className="ttSlice"
                  onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)}
                  onClick={() => setPath(nodePath(d))}>
              <title>{`${nodePath(d).join(" › ")}: ${fmt(d.value)}`}</title>
            </path>
          ))}
          {root.descendants().slice(1).filter(d => (d.x1 - d.x0) * (d.y0 + 0.5) * ring > 58 && d.depth <= 2).map((d, i) => {
            const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI, r = (d.y0 + d.y1) / 2 * ring;
            const name = d.data.name.length > 14 ? d.data.name.slice(0, 13) + "…" : d.data.name;
            return <text key={i} transform={`rotate(${angle - 90}) translate(${r},0) rotate(${angle < 180 ? 0 : 180})`}
                         className="ttSliceLabel" fill={d.depth === 1 ? "white" : INK.primary}>{name}</text>;
          })}
          <circle r={ring - 4} className="ttCenter" onClick={() => depth && setPath(path.slice(0, -1))}/>
          <text className="ttCenterValue" dy="-0.1em">{fmt(shown.value)}</text>
          <text className="ttCenterLabel" dy="1.4em">{shown.data.name.length > 18 ? shown.data.name.slice(0, 17) + "…" : shown.data.name}</text>
          {depth > 0 && !hover && <text className="ttCenterHint" dy="3em">↑ back up</text>}
        </svg>
        <div className="ttBars">
          {children.slice(0, 10).map(c => (
            <button key={c.data.name} className="ttBarRow" onClick={() => setPath([...path, c.data.name])}>
              <span className="ttBarName">{c.data.name}</span>
              <span className="ttBarTrack"><span className="ttBar" style={{width: `${100 * c.value / children[0].value}%`, background: sliceColor(c)}}/></span>
              <span className="ttBarValue">{fmt(c.value)}</span>
            </button>
          ))}
          {isBook && <a className="ttOpenLink" href={textUrl(current)}>Open {current} ›</a>}
        </div>
      </div>
    </Card>
  );
};


// ---------- study partners ----------
const PartnersCard = ({rows, partner, setPartner}) => {
  const [ref, width] = useWidth();
  const partners = useMemo(() => d3.rollups(rows.filter(r => r.partner), v => ({
    count: v.length,
    he: v[0].info.hePartner,
    era: v[0].info.era,
    compDate: v[0].info.compDate,
    bases: d3.rollups(v, w => w.length, r => (r.info.base || [])[0] || r.book).sort((a, b) => b[1] - a[1]).slice(0, 3).map(b => b[0]),
    years: d3.rollup(v, w => w.length, r => r.year),
  }), r => r.partner).map(([name, p]) => ({name, ...p})).sort((a, b) => b.count - a.count), [rows]);
  const top = partners.slice(0, 8);
  const cells = top.flatMap(p => Array.from(p.years, ([year, count]) => ({partner: p.name, year, count})));
  const options = useMemo(() => width && cells.length && ({
    width, height: top.length * 30 + 40, marginLeft: 110, marginRight: 12,
    x: {label: null, tickFormat: d => String(d), ticks: Array.from(new Set(cells.map(c => c.year))).sort(), inset: 18},
    y: {label: null, domain: top.map(p => p.name)},
    r: {range: [2, 13]},
    marks: [
      Plot.gridY({stroke: INK.grid, strokeOpacity: 1}),
      Plot.dot(cells, {x: "year", y: "partner", r: "count", fill: COMMENTARY_BLUE, fillOpacity: 0.85, stroke: "white", strokeWidth: 2}),
      Plot.tip(cells, Plot.pointer({x: "year", y: "partner", title: d => `${fmt(d.count)} times with ${d.partner}\n${d.year}`})),
    ],
  }), [cells.length, width, rows]);
  if (!partners.length) {
    return <Card title="Study partners" subtitle="The commentators you learn with."><div className="ttMuted">No commentaries opened in this slice yet.</div></Card>;
  }
  const max = partners[0].count;
  return (
    <Card title="Study partners" subtitle="The commentators you learn with. Click one to see only your learning together."
          table={{columns: ["Commentator", "Times", "Mostly on"], rows: partners.map(p => [p.name, p.count, p.bases.join(", ")])}}>
      <div className="ttPartners">
        {top.map(p => (
          <button key={p.name} className={`ttPartner ${partner === p.name ? "selected" : ""}`} onClick={() => setPartner(partner === p.name ? null : p.name)}>
            <span className="ttAvatar" lang="he">{(p.he || p.name).replace(/["״]/g, "״")}</span>
            <span className="ttPartnerMain">
              <span className="ttPartnerName">{p.name}{p.compDate ? <span className="ttMuted"> · {yearLabel(p.compDate)}</span> : null}</span>
              <span className="ttBarTrack"><span className="ttBar" style={{width: `${100 * p.count / max}%`, background: COMMENTARY_BLUE}}/></span>
              <span className="ttMuted">on {p.bases.join(", ")}</span>
            </span>
            <span className="ttBarValue">{fmt(p.count)}</span>
          </button>
        ))}
      </div>
      <h3 className="ttSubhead">Who you learned with, year by year</h3>
      <div ref={ref}><PlotFigure options={options}/></div>
    </Card>
  );
};


// ---------- Tanakh coverage ----------
const TanakhCard = ({rows}) => {
  const [ref, width] = useWidth();
  const counts = useMemo(() => d3.rollup(rows.filter(r => !r.sidebar && r.chapter), v => v.length, r => `${r.book}|${r.chapter}`), [rows]);
  const cells = useMemo(() => TANAKH_BOOKS.flatMap(b => d3.range(1, b.chapters + 1).map(ch => ({...b, ch, count: counts.get(`${b.book}|${ch}`) || 0}))), [counts]);
  const read = cells.filter(c => c.count).length;
  const options = useMemo(() => width && ({
    width, height: TANAKH_BOOKS.length * 13 + 40, marginLeft: 96, marginTop: 20, marginBottom: 8,
    x: {axis: "top", label: null, ticks: [1, 25, 50, 75, 100, 125, 150], tickSize: 0},
    y: {label: null, domain: TANAKH_BOOKS.map(b => b.book), tickSize: 0},
    color: {type: "threshold", domain: [1, 2, 4, 8, 16], range: [EMPTY, ...SEQ]},
    marks: [
      Plot.cell(cells, {x: "ch", y: "book", fill: "count", inset: 0.5}),
      Plot.tip(cells, Plot.pointer({x: "ch", y: "book", title: d => `${d.book} ${d.ch}\n${d.count ? `Read ${fmt(d.count)}×` : "Not read yet"} · click to open`})),
    ],
  }), [cells, width]);
  return (
    <Card wide title="Your Tanakh map" subtitle={`${fmt(read)} of ${TANAKH_TOTAL} chapters read (${pct(read, TANAKH_TOTAL)}%). Each square is a chapter; click one to open it.`}
          table={{columns: ["Book", "Chapters read", "Chapters"], rows: TANAKH_BOOKS.map(b => [b.book, cells.filter(c => c.book === b.book && c.count).length, b.chapters])}}>
      <div className="ttDivisions">
        {TANAKH.map(([division, books]) => {
          const total = d3.sum(books, b => b[1]);
          const done = cells.filter(c => c.division === division && c.count).length;
          return (
            <div key={division} className="ttDivision">
              <div className="ttTileLabel">{division}</div>
              <div className="ttMeter"><span style={{width: `${pct(done, total)}%`}}/></div>
              <div className="ttMuted">{fmt(done)} / {fmt(total)}</div>
            </div>
          );
        })}
      </div>
      <div ref={ref} className="ttScroll"><PlotFigure options={options} onClick={d => window.open(textUrl(`${d.book} ${d.ch}`), "_blank")}/></div>
    </Card>
  );
};


// ---------- eras ----------
const ErasCard = ({rows, onBook}) => {
  const [ref, width] = useWidth();
  const books = useMemo(() => d3.rollups(rows.filter(r => r.info.compDate !== undefined), v => ({row: v[0], count: v.length}), r => r.book)
    .map(([book, b]) => ({book, compDate: b.row.info.compDate, cat: b.row.cat, count: b.count, row: b.row}))
    .sort((a, b) => b.count - a.count).slice(0, 80), [rows]);
  const cats = Array.from(new Set(books.map(b => b.cat)));
  const [oldest, newest] = [d3.least(books, b => b.compDate), d3.greatest(books, b => b.compDate)];
  const options = useMemo(() => width && books.length && ({
    width, height: cats.length * 42 + 50, marginLeft: 110, marginRight: 20,
    x: {label: null, tickFormat: yearLabel, nice: true},
    y: {label: null, domain: cats},
    r: {range: [3, 18]},
    marks: [
      Plot.gridX({stroke: INK.grid, strokeOpacity: 1}),
      Plot.dot(books, {x: "compDate", y: "cat", r: "count", fill: d => catColor(d.cat), fillOpacity: 0.85, stroke: "white", strokeWidth: 2}),
      Plot.tip(books, Plot.pointer({x: "compDate", y: "cat", title: d => `${d.book}\nc. ${yearLabel(d.compDate)} · ${fmt(d.count)} page views\nClick to drill in`})),
    ],
  }), [books, width]);
  if (!books.length) { return null; }
  const span = newest.compDate - oldest.compDate;
  return (
    <Card wide title={span > 500 ? `Your reading spans ${fmt(Math.round(span / 100) * 100)} years` : "When your texts were written"}
          subtitle={`From ${oldest.book} (c. ${yearLabel(oldest.compDate)}) to ${newest.book} (${yearLabel(newest.compDate)}). Dot size is how much you read it.`}
          table={{columns: ["Book", "Written", "Page views"], rows: books.map(b => [b.book, yearLabel(b.compDate), b.count])}}>
      <div ref={ref}><PlotFigure options={options} onClick={d => onBook(d.row)}/></div>
    </Card>
  );
};


// ---------- rhythm ----------
const RhythmCard = ({rows}) => {
  const [ref, width] = useWidth();
  const cells = useMemo(() => {
    const counts = d3.rollup(rows, v => v.length, r => r.dow, r => r.hour);
    return d3.range(7).flatMap(dow => d3.range(24).map(hour => ({dow, hour, count: (counts.get(dow) || new Map()).get(hour) || 0})));
  }, [rows]);
  const byDow = d3.range(7).map(d => d3.sum(cells.filter(c => c.dow === d), c => c.count));
  const byHour = d3.range(24).map(h => d3.sum(cells.filter(c => c.hour === h), c => c.count));
  const busiestDow = byDow.indexOf(d3.max(byDow)), busiestHour = byHour.indexOf(d3.max(byHour));
  const hourLabel = h => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
  const options = useMemo(() => width && ({
    width, height: 230, marginLeft: 70, marginTop: 10,
    x: {label: null, domain: d3.range(24), tickFormat: h => h % 3 === 0 ? hourLabel(h) : "", type: "point"},
    y: {label: null, domain: d3.range(7), tickFormat: d => DOW[d], type: "point"},
    r: {range: [0, Math.min(11, width / 60)]},
    marks: [
      Plot.dot(cells.filter(c => c.count), {x: "hour", y: "dow", r: "count", fill: ACCENT, fillOpacity: 0.85, stroke: "white", strokeWidth: 1.5}),
      Plot.tip(cells, Plot.pointer({x: "hour", y: "dow", title: d => `${fmt(d.count)} page views\n${DOW[d.dow]}, ${hourLabel(d.hour)}–${hourLabel((d.hour + 1) % 24)}`})),
    ],
  }), [cells, width]);
  return (
    <Card title="When you learn" subtitle={`Busiest: ${DOW[busiestDow]}s around ${hourLabel(busiestHour)}. Times are in your local time zone.`}
          table={{columns: ["Day", "Hour", "Page views"], rows: cells.filter(c => c.count).map(c => [DOW[c.dow], hourLabel(c.hour), c.count])}}>
      <div ref={ref}><PlotFigure options={options}/></div>
    </Card>
  );
};


// ---------- language ----------
const LanguageCard = ({rows, time}) => {
  const [ref, width] = useWidth();
  const byYear = time.year === null;
  const key = r => byYear ? new Date(r.year, 0, 1) : new Date(r.year, r.month, 1);
  const data = useMemo(() => {
    const counts = d3.rollup(rows.filter(r => r.lang), v => v.length, key, r => r.lang);
    return Array.from(counts, ([date, m]) => LANGS.map(lang => ({date, lang, count: m.get(lang) || 0}))).flat().sort((a, b) => a.date - b.date);
  }, [rows, byYear]);
  const periods = Array.from(new Set(data.map(d => +d.date)));
  const share = (t, lang) => { const p = data.filter(d => +d.date === t); return pct(d3.sum(p.filter(d => d.lang === lang), d => d.count), d3.sum(p, d => d.count)); };
  const options = useMemo(() => width && periods.length > 1 && ({
    width, height: 230, marginLeft: 40, marginRight: 70,
    x: {type: "time", label: null}, y: {label: "Share of reading", percent: true, labelAnchor: "top"},
    color: {domain: LANGS, range: LANG_COLORS},
    marks: [
      Plot.areaY(data, Plot.stackY({offset: "normalize", order: LANGS, x: "date", y: "count", fill: "lang", stroke: "white", strokeWidth: 2, curve: "monotone-x"})),
      Plot.text(data.filter(d => +d.date === periods[periods.length - 1]), Plot.stackY({offset: "normalize", order: LANGS, x: "date", y: "count", z: "lang",
        text: d => d.count ? d.lang : "", textAnchor: "start", dx: 6, fill: INK.primary})),
      Plot.ruleX(data, Plot.pointerX({x: "date", stroke: INK.primary, strokeOpacity: 0.5})),
      Plot.tip(periods.map(t => ({date: new Date(t)})), Plot.pointerX({x: "date",
        title: d => `${byYear ? d.date.getFullYear() : fmtMonth(d.date)}\n` + LANGS.map(l => `${l}: ${share(+d.date, l)}%`).join("\n")})),
    ],
  }), [data, width]);
  const first = periods[0], last = periods[periods.length - 1];
  return (
    <Card title="How you read" subtitle={periods.length > 1 ? `Hebrew went from ${share(first, "Hebrew")}% to ${share(last, "Hebrew")}%, bilingual from ${share(first, "Bilingual")}% to ${share(last, "Bilingual")}%.` : "Language mix in this period."}
          table={{columns: ["Period", ...LANGS], rows: periods.map(t => [byYear ? new Date(t).getFullYear() : fmtMonth(new Date(t)), ...LANGS.map(l => `${share(t, l)}%`)])}}>
      <div className="ttLegendInline">{LANGS.map((l, i) => <span key={l}><span className="ttSwatch" style={{background: LANG_COLORS[i]}}/>{l}</span>)}</div>
      <div ref={ref}>{periods.length > 1 ? <PlotFigure options={options}/> :
        <div className="ttMuted">{LANGS.map(l => `${l} ${share(first, l)}%`).join(" · ")}</div>}</div>
    </Card>
  );
};


// ---------- top passages ----------
const TopPassagesCard = ({rows}) => {
  const top = d3.rollups(rows.filter(r => !r.sidebar), v => ({count: v.length, cat: v[0].cat}), r => r.ref).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (!top.length) { return null; }
  const max = top[0][1].count;
  return (
    <Card title="Passages you keep returning to" table={{columns: ["Passage", "Visits"], rows: top.map(([ref, t]) => [ref, t.count])}}>
      <div className="ttBars">
        {top.map(([ref, t]) => (
          <a key={ref} className="ttBarRow" href={textUrl(ref)}>
            <span className="ttBarName">{ref}</span>
            <span className="ttBarTrack"><span className="ttBar" style={{width: `${100 * t.count / max}%`, background: catColor(t.cat)}}/></span>
            <span className="ttBarValue">{fmt(t.count)}</span>
          </a>
        ))}
      </div>
    </Card>
  );
};


export default UserStats;
