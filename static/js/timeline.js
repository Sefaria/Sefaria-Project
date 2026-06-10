import "core-js/stable";
import "regenerator-runtime/runtime";
import * as d3 from './lib/d3.v5.min';
import Sefaria from 'sefaria';

/*****          Era columns              *****/
// Fixed columns.  A work belongs to the first era whose end year exceeds its date.
const ERAS = [
    {key: "biblical",  en: "Biblical",  he: "מקרא",    range: "to 70 CE",  end: 70},
    {key: "tannaim",   en: "Tannaim",   he: "תנאים",   range: "70–220",    end: 220},
    {key: "amoraim",   en: "Amoraim",   he: "אמוראים", range: "220–620",   end: 620},
    {key: "geonim",    en: "Geonim",    he: "גאונים",  range: "620–1040",  end: 1040},
    {key: "rishonim",  en: "Rishonim",  he: "ראשונים", range: "1040–1500", end: 1500},
    {key: "acharonim", en: "Acharonim", he: "אחרונים", range: "1500–1850", end: 1850},
    {key: "modern",    en: "Modern",    he: "עת חדשה", range: "1850–",     end: Infinity},
];
const eraIndex = year => ERAS.findIndex(e => year < e.end);
const eraKeyIndex = key => ERAS.findIndex(e => e.key === key);

/*****          The track map            *****/
// The genealogy of the library, hand-authored.  Array order is row order, top to bottom.
// fork: the era at which a line branches off its parent.
// merge: a line this one flows into instead of continuing.
// Every line also carries a latent "<line>/Commentary" branch, rendered thinner in the
// same color, directly below it.  Lines and branches render only when occupied (or when
// a descendant needs them as track).
const TRACK_MAP = [
    {line: "Tanakh",         end: "biblical"},
    {line: "Midrash",        parent: "Tanakh",         fork: "tannaim"},
    {line: "Mishnah",        parent: "Tanakh",         fork: "tannaim"},
    {line: "Tosefta",        merge: "Talmud"},
    {line: "Talmud",         parent: "Mishnah",        fork: "amoraim"},
    {line: "Halakhah",       parent: "Talmud",         fork: "geonim"},
    {line: "Responsa",       parent: "Halakhah",       fork: "rishonim"},
    {line: "Liturgy",        parent: "Talmud",         fork: "geonim"},
    {line: "Jewish Thought", parent: "Talmud",         fork: "geonim"},
    {line: "Musar",          parent: "Jewish Thought", fork: "rishonim"},
    {line: "Kabbalah",       parent: "Tanakh",         fork: "tannaim"},
    {line: "Chasidut",       parent: "Kabbalah",       fork: "acharonim"},
];
const TRACK_SPECS = TRACK_MAP.reduce((a, s) => { a[s.line] = s; return a; }, {});
const COMMENTARY_SUFFIX = "/Commentary";

const baseCategory = line => line.split("/")[0];
const isCommentaryLine = line => line.endsWith(COMMENTARY_SUFFIX);
const lineParent = line => {
    if (isCommentaryLine(line)) return baseCategory(line);
    const spec = TRACK_SPECS[line];
    return spec ? spec.parent : null;
};
const lineColor = line => {
    const cat = baseCategory(line);
    const spec = TRACK_SPECS[cat];
    return Sefaria.palette.categoryColor(spec && spec.color ? spec.color : cat);
};

/*****          Layout constants         *****/
const M = {top: 95, right: 36, bottom: 40, left: 36};
const ROW_H = 58;
const BEND = 14;            // length of each 45° segment in a fork
const MAIN_STROKE = 6;
const COMMENTARY_STROKE = 3;
const MAX_STATION_R = 16;

let w, colW, svg, lang, currentNet,
    popUpElem, textBox, heTitle, enTitle, heElems, enElems, linkerHeader, linkerFooter;

const urlParams = new URLSearchParams(window.location.search);
const startingRef = urlParams.get('ref');
let currentRef = startingRef || "Mishnah Berakhot 1:1";

/****           Initialization           *****/

(GLOBALS.interfaceLang === "hebrew") ? switchToHebrew() : switchToEnglish();
setupPopup({interfaceLang: GLOBALS.interfaceLang === "hebrew" ? "hebrew" : "english", contentLang: "bilingual"});
loadAndRender(currentRef);
window.addEventListener('resize', () => currentNet && render(currentNet));
window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    currentRef = params.get('ref') || currentRef;
    loadAndRender(currentRef);
});

async function fetchNetwork(ref) {
    const response = await fetch('/api/linknetwork/' + Sefaria.normRef(ref));
    return await response.json();
}

function loadAndRender(ref) {
    fetchNetwork(ref).then(net => {
        currentNet = net;
        changePageTitle((net.ref || ref) + " | Timeline");
        render(net);
    });
}

function refocusNetwork(ref) {
    hidePopup();
    currentRef = ref;
    history.pushState({ref}, "", "/visualize/timeline?ref=" + Sefaria.normRef(ref));
    loadAndRender(ref);
}

/*****          Model: nodes → stations → visible lines → rows          *****/

function buildModel(net) {
    const stationIndex = {};
    for (const n of (net.nodes || [])) {
        const e = eraIndex(n.year);
        if (e < 0) continue;
        const key = n.line + "|" + e + "|" + (n.stop || "");
        if (!stationIndex[key]) stationIndex[key] = {line: n.line, era: e, stop: n.stop || null, works: []};
        stationIndex[key].works.push(n);
    }
    const stations = Object.values(stationIndex);
    stations.forEach(st => st.works.sort((a, b) => b.refCount - a.refCount));

    const visible = new Set();
    const addWithAncestors = line => {
        while (line && !visible.has(line)) {
            visible.add(line);
            line = lineParent(line);
        }
    };
    stations.forEach(st => addWithAncestors(st.line));
    if (net.line) addWithAncestors(net.line);

    // A parentless line with no stations of its own and no non-commentary
    // descendants is just an orphaned stub (e.g. Tosefta when only a Tosefta
    // commentary is present) — drop it and let its commentary branch float.
    for (const spec of TRACK_MAP) {
        if (spec.parent || !visible.has(spec.line) || spec.line === net.line) continue;
        const hasStations = stations.some(st => st.line === spec.line);
        const hasLineChildren = TRACK_MAP.some(s => s.parent === spec.line && visible.has(s.line));
        if (!hasStations && !hasLineChildren) visible.delete(spec.line);
    }

    // Row order: each canonical line, then its commentary branch.
    const rows = [];
    for (const spec of TRACK_MAP) {
        if (visible.has(spec.line)) rows.push(spec.line);
        const comm = spec.line + COMMENTARY_SUFFIX;
        if (visible.has(comm)) rows.push(comm);
    }

    const lines = {};
    rows.forEach((line, i) => {
        lines[line] = {
            line,
            row: i,
            stations: stations.filter(st => st.line === line),
            children: [],
        };
    });
    for (const line of rows) {
        const p = lineParent(line);
        if (p && lines[p]) lines[p].children.push(lines[line]);
    }

    const hubEra = net.year != null ? eraIndex(net.year)
        : (lines[net.line] && lines[net.line].stations.length ? lines[net.line].stations[0].era : 0);

    return {lines, rows, hubEra, hubLine: net.line};
}

/*****          Geometry          *****/

const colX = i => M.left + colW * (i + 0.5);
const rowY = row => M.top + row * ROW_H + ROW_H / 2;

function computeGeometry(model) {
    const {lines, hubLine, hubEra} = model;

    // Fork departure point on the parent, arrival point on the child.
    // Children leaving the same parent toward the same era are staggered so
    // their diagonals don't overlap.
    const forkGroups = {};
    for (const line of model.rows) {
        const L = lines[line];
        let forkEra = null;
        if (isCommentaryLine(line)) {
            forkEra = L.stations.length ? L.stations.reduce((a, s) => Math.min(a, s.era), 99) : null;
            // a commentary branch can't fork later than its parent line's end
            const pSpec = TRACK_SPECS[baseCategory(line)];
            if (forkEra != null && pSpec && pSpec.end != null) {
                forkEra = Math.min(forkEra, eraKeyIndex(pSpec.end) + 1);
            }
        } else if (TRACK_SPECS[line] && TRACK_SPECS[line].fork) {
            forkEra = eraKeyIndex(TRACK_SPECS[line].fork);
        }
        const parent = lineParent(line);
        if (forkEra != null && parent && lines[parent]) {
            L.forkEra = forkEra;
            const gkey = parent + "|" + forkEra;
            (forkGroups[gkey] = forkGroups[gkey] || []).push(L);
        }
    }
    for (const group of Object.values(forkGroups)) {
        group.sort((a, b) => b.row - a.row);  // deeper children depart earlier
        group.forEach((L, i) => { L.forkStagger = i; });
    }

    for (const line of model.rows) {
        const L = lines[line];
        const y = rowY(L.row);
        L.y = y;

        // Multiple stops in the same era (e.g. Yerushalmi then Bavli on the Talmud
        // line) spread side by side within the column, ordered by date.
        const byEra = {};
        L.stations.forEach(st => { (byEra[st.era] = byEra[st.era] || []).push(st); });
        for (const group of Object.values(byEra)) {
            group.sort((a, b) => Math.min(...a.works.map(w => w.year)) - Math.min(...b.works.map(w => w.year)));
            group.forEach((st, i) => {
                st.x = colX(st.era) + (i - (group.length - 1) / 2) * 42;
                st.labelTier = group.length > 1 ? i % 2 : 0;
            });
        }
        const stationXs = L.stations.map(st => st.x);
        if (line === hubLine) stationXs.push(colX(hubEra));

        if (L.forkEra != null) {
            const parent = lines[lineParent(line)];
            const dy = Math.abs(y - parent.y);
            const bendSpan = Math.min(dy, 2 * BEND);
            L.departX = colX(L.forkEra) - colW * 0.5 - 14 * (L.forkStagger || 0) - bendSpan;
            L.arriveX = L.departX + bendSpan;
            L.forkPath = forkPath(L.departX, parent.y, y);
        }

        let startX = L.arriveX != null ? L.arriveX : null;
        if (stationXs.length) {
            const firstStation = Math.min(...stationXs) - 20;
            startX = startX == null ? firstStation : Math.min(startX, firstStation);
        }
        L.startX = startX;  // possibly null: track-only lines settle once children are placed
        L.endX = startX != null ? Math.max(startX + 26, ...stationXs.map(x => x + 20)) : null;
    }

    // Lines must extend to cover their children's departures.  A track-only line
    // (no stations, no fork of its own) exists just to carry its children, so it
    // spans only its children's departure points.
    for (const line of [...model.rows].reverse()) {
        const L = lines[line];
        const departs = L.children.map(c => c.departX).filter(x => x != null);
        if (L.startX == null) {
            L.startX = departs.length ? Math.min(...departs) - 26 : colX(0) - 20;
            L.endX = L.startX + 26;
        }
        if (departs.length) L.endX = Math.max(L.endX, Math.max(...departs) + 18);
    }

    // Merges: a line with content flows into another (Tosefta → Talmud).
    for (const line of model.rows) {
        const spec = TRACK_SPECS[line];
        if (spec && spec.merge && lines[spec.merge] && lines[line].stations.length) {
            const L = lines[line], T = lines[spec.merge];
            const joinX = Math.max(T.startX + 8, L.endX + 2 * BEND);
            L.mergePath = forkPath(L.endX, L.y, T.y, joinX - L.endX);
            T.endX = Math.max(T.endX, joinX + 12);
        }
    }
}

function forkPath(x0, fromY, toY, span) {
    const dir = toY > fromY ? 1 : -1;
    const dy = Math.abs(toY - fromY);
    const b = Math.min(BEND, dy / 2);
    const bendDx = dy <= 2 * b ? dy : 2 * b;  // horizontal distance the bend itself consumes
    const dx = span != null ? Math.max(span, bendDx) : bendDx;
    const tail = dx > bendDx ? ` H${x0 + dx}` : "";
    if (dy <= 2 * b) {
        return `M${x0},${fromY} L${x0 + bendDx},${toY}` + tail;
    }
    return `M${x0},${fromY} L${x0 + b},${fromY + b * dir} V${toY - b * dir} L${x0 + bendDx},${toY}` + tail;
}

/*****          Rendering          *****/

function render(net) {
    d3.select("#timelinePage svg").remove();
    const model = buildModel(net);
    w = window.innerWidth ? window.innerWidth - 4 : 1000;
    colW = (w - M.left - M.right) / ERAS.length;
    const h = M.top + model.rows.length * ROW_H + M.bottom;

    svg = d3.select("#timelinePage").append("svg")
        .attr("width", w)
        .attr("height", Math.max(h, 300))
        .attr("font-family", "sans-serif");
    svg.append("svg:desc").text("A subway-style map of works that cite, or are cited by, " + net.ref);

    drawEraGrid(model);
    if (!model.rows.length) {
        svg.append("text").attr("x", w / 2).attr("y", M.top + 60)
            .attr("text-anchor", "middle").attr("fill", "#999").attr("font-size", 16)
            .text(isHebrew() ? "לא נמצאו קשרים" : "No connections found for " + net.ref);
        return;
    }

    computeGeometry(model);
    drawTracks(model);
    drawStations(model);
    drawHub(model, net);
}

function drawEraGrid(model) {
    const gridBottom = M.top + Math.max(model.rows.length, 3) * ROW_H + 8;
    const grid = svg.append("g");
    ERAS.forEach((era, i) => {
        grid.append("line")
            .attr("x1", colX(i)).attr("x2", colX(i))
            .attr("y1", M.top - 14).attr("y2", gridBottom)
            .attr("stroke", "#e5e5e5").attr("stroke-dasharray", "2,6");
        grid.append("text")
            .attr("x", colX(i)).attr("y", 42)
            .attr("text-anchor", "middle").attr("fill", "#333")
            .attr("font-size", 14).attr("font-weight", model.hubEra === i ? "bold" : "normal")
            .text(isHebrew() ? era.he : era.en);
        grid.append("text")
            .attr("x", colX(i)).attr("y", 60)
            .attr("text-anchor", "middle").attr("fill", "#999").attr("font-size", 11)
            .text(era.range);
    });
}

function drawTracks(model) {
    const g = svg.append("g")
        .attr("fill", "none")
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round");

    for (const line of model.rows) {
        const L = model.lines[line];
        const color = lineColor(line);
        const width = isCommentaryLine(line) ? COMMENTARY_STROKE : MAIN_STROKE;
        if (L.forkPath) {
            g.append("path").attr("d", L.forkPath).attr("stroke", color).attr("stroke-width", width);
        }
        g.append("line")
            .attr("x1", L.startX).attr("y1", L.y)
            .attr("x2", L.endX).attr("y2", L.y)
            .attr("stroke", color).attr("stroke-width", width);
        if (L.mergePath) {
            g.append("path").attr("d", L.mergePath).attr("stroke", color).attr("stroke-width", width);
        }
        // Label just before the line's first station (or the hub), where it's
        // clear of the fork bundles that cross the line near its start.
        const anchorXs = L.stations.map(st => st.x);
        if (line === model.hubLine) anchorXs.push(colX(model.hubEra));
        const label = svg.append("text")
            .attr("y", L.y - 11)
            .attr("fill", color).attr("font-size", 12).attr("font-weight", "bold")
            .text(lineLabel(line));
        if (anchorXs.length) {
            label.attr("x", Math.min(...anchorXs) - 24).attr("text-anchor", "end");
        } else {
            label.attr("x", L.startX + 2).attr("text-anchor", "start");
        }
    }
}

function drawStations(model) {
    const g = svg.append("g");
    for (const line of model.rows) {
        const L = model.lines[line];
        for (const st of L.stations) {
            const x = st.x;
            const r = Math.min(MAX_STATION_R, 4.5 + 3.2 * Math.sqrt(st.works.length));
            const station = g.append("g").style("cursor", "pointer");
            station.append("circle")
                .attr("cx", x).attr("cy", L.y).attr("r", r)
                .attr("fill", "#fff")
                .attr("stroke", lineColor(line))
                .attr("stroke-width", isCommentaryLine(line) ? 2.5 : 3.5);
            station.append("text")
                .attr("x", x).attr("y", L.y + r + 14 + (st.labelTier ? 13 : 0))
                .attr("text-anchor", "middle").attr("fill", "#777").attr("font-size", 11)
                .text(st.stop ? stopLabel(st.stop) + " · " + st.works.length : st.works.length);
            station.on("click", () => showStationPopup(st, station.node().getBoundingClientRect()));
        }
    }
}

function drawHub(model, net) {
    const L = model.lines[model.hubLine];
    if (!L) return;
    const x = colX(model.hubEra), y = L.y;
    const hub = svg.append("g");
    hub.append("circle")
        .attr("cx", x).attr("cy", y).attr("r", 13)
        .attr("fill", "#fff").attr("stroke", "#333").attr("stroke-width", 4);
    hub.append("circle")
        .attr("cx", x).attr("cy", y).attr("r", 5.5)
        .attr("fill", "none").attr("stroke", lineColor(model.hubLine)).attr("stroke-width", 3);
    hub.append("text")
        .attr("x", x).attr("y", y + 32)
        .attr("text-anchor", "middle").attr("fill", "#333")
        .attr("font-size", 13).attr("font-weight", "bold")
        .text(isHebrew() && net.heRef ? net.heRef : net.ref);
}

/*****          Labels          *****/

function heTerm(name) {
    try {
        const he = Sefaria.hebrewTerm ? Sefaria.hebrewTerm(name) : null;
        return he || name;
    } catch (e) {
        return name;
    }
}

function lineLabel(line) {
    const cat = baseCategory(line);
    if (isHebrew()) {
        return isCommentaryLine(line) ? heTerm(cat) + " · " + heTerm("Commentary") : heTerm(cat);
    }
    return isCommentaryLine(line) ? cat + " · Commentary" : cat;
}

function stopLabel(stop) {
    return isHebrew() ? heTerm(stop) : stop;
}

/*****                   Popup                        *****/

function setupPopup(options) {
    popUpElem = document.createElement("div");
    popUpElem.id = "sefaria-popup";
    popUpElem.classList.add("interface-" + options.interfaceLang);
    popUpElem.classList.add("content-" + options.contentLang);

    var html = `<style scoped>
        @import url("https://fonts.googleapis.com/css?family=Crimson+Text|Frank+Ruhl+Libre|Heebo");
        #sefaria-popup {
            width: 400px;
            max-height: 560px;
            font-size: 16px;
            border-left: 1px #ddd solid;
            border-right: 1px #ddd solid;
            border-bottom: 1px #ddd solid;
            background-color: #fff;
            color: #222222;
        }
        .sefaria-text .en, .sefaria-text .he {
            padding: 10px 20px;
            text-align: justify;
        }
        .sefaria-text {
            max-height: 430px;
            overflow-y: auto;
            overflow-x: hidden;
        }
        .sefaria-text:focus {
            outline: none;
        }
        #sefaria-title {
            font-weight: bold;
            font-size: 16px;
            text-align: center;
            text-decoration: none;
        }
        .en {
            font-family: "Crimson Text";
        }
        .he {
            font-family: "Frank Ruhl Libre";
        }
        .content-hebrew .sefaria-text .en {
            display: none;
        }
        .content-english .sefaria-text .he {
            display: none
        }
        .content-hebrew .sefaria-text .en.enOnly {
            display: block;
        }
        .content-english .sefaria-text .he.heOnly {
            display: block
        }
        .sefaria-station-row {
            padding: 8px 20px;
            border-bottom: 1px solid #eee;
            font-family: "Helvetica Neue", "Helvetica", sans-serif;
        }
        .sefaria-station-work {
            font-weight: bold;
            cursor: pointer;
            font-size: 14px;
            color: #222;
        }
        .sefaria-station-work:hover {
            text-decoration: underline;
        }
        .sefaria-station-count {
            color: #999;
            font-weight: normal;
        }
        .sefaria-station-refs {
            margin-top: 2px;
            font-size: 12px;
        }
        .sefaria-station-refs a {
            color: #4871bf;
            text-decoration: none;
            margin-right: 8px;
            cursor: pointer;
        }
        .sefaria-station-refs a:hover {
            text-decoration: underline;
        }
        #sefaria-logo {
            background: url(\"data:image/svg+xml,%3Csvg id='Layer_1' data-name='Layer 1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 340.96 93.15'%3E%3Cdefs%3E%3Cstyle%3E.cls-1%7Bfill:none;%7D.cls-2%7Bclip-path:url(%23clip-path);%7D.cls-3%7Bfill:%23231f20;%7D%3C/style%3E%3CclipPath id='clip-path' transform='translate(-389 -337.85)'%3E%3Crect class='cls-1' x='389' y='337.85' width='340.96' height='93.15'/%3E%3C/clipPath%3E%3C/defs%3E%3Ctitle%3Esefarialogo%3C/title%3E%3Cg class='cls-2'%3E%3Cpath class='cls-3' d='M454,397.67c-2.41,11.31-10.59,16.11-28.82,16.11-44.79,0-28.92-36-22.66-43.42,2.63-3.29,4.47-6,11.15-6h12.71c17.72,0,21.1.84,25.54,9.9,2.4,4.88,3.79,15.41,2.08,23.43m4.81-22.48c-1.5-9.67-3.45-20.19-11.85-26-5.09-3.54-10.34-3.8-16.21-3.8-4,0-18.11-.17-24.29-.17-6,0-10-4.94-10-7.34-3.91,4.79-6.9,10.08-5.85,16.48.94,5.76,4.89,9.44,10.67,10.17-6.55,9.25-12.47,19.9-12.18,31.18.18,7.11,1.81,35.32,33.71,35.32h5.81c13.62,0,21.87-10.11,24.27-14,7.05-11.5,8.23-29.29,6-41.78' transform='translate(-389 -337.85)'/%3E%3Cpath class='cls-3' d='M722.79,402.89a12.32,12.32,0,0,1-9.74,5.06,11.59,11.59,0,0,1-11.78-11.7c0-6.19,4.53-11.7,11.4-11.7a12.78,12.78,0,0,1,10.12,5.06ZM723,414H730V378.51H723v3.24a16.65,16.65,0,0,0-11.1-4,16.87,16.87,0,0,0-8.69,2.27,19,19,0,0,0-.07,32.39,18.26,18.26,0,0,0,8.91,2.34,16.31,16.31,0,0,0,10.95-4ZM676,365.9a4.61,4.61,0,0,0,4.68,4.68,4.68,4.68,0,0,0,4.76-4.68,4.75,4.75,0,0,0-4.76-4.76A4.68,4.68,0,0,0,676,365.9M677.11,414h7.17V378.51h-7.17Zm-8.68-36a18.29,18.29,0,0,0-2.79-.23c-5.21,0-8.91,2.42-10.65,4.83v-4.07h-7V414h7.18V390.51c2-3.4,5.89-6,9.59-6a10.06,10.06,0,0,1,2.79.3ZM628,402.89A12.32,12.32,0,0,1,618.3,408a11.59,11.59,0,0,1-11.78-11.7c0-6.19,4.53-11.7,11.4-11.7A12.8,12.8,0,0,1,628,389.61Zm.22,11.1h7V378.51h-7v3.24a16.62,16.62,0,0,0-11.1-4,16.83,16.83,0,0,0-8.68,2.27,19,19,0,0,0-.07,32.39,18.2,18.2,0,0,0,8.91,2.34,16.3,16.3,0,0,0,10.94-4Zm-33.07-53.83a16.61,16.61,0,0,0-4.23-.53,13.88,13.88,0,0,0-11.62,5.89c-1.59,2.27-2.27,5.21-2.27,10v3h-8.3v6.41h8.3V414h7.18V384.92h10.94v-6.41H584.25v-3.25c0-3.25.37-5.06,1.35-6.34a7,7,0,0,1,5.44-2.49,11.64,11.64,0,0,1,2.64.3ZM546.65,384a9.92,9.92,0,0,1,9.36,7.7H536.68a10.31,10.31,0,0,1,10-7.7m16.76,13.74a14,14,0,0,0,.07-1.51c0-10.5-7.17-18.5-17.06-18.5s-17.29,7.85-17.29,18.5a18,18,0,0,0,18.35,18.5c7.24,0,12.3-3.25,14.95-6.65l-4.69-4.45a12.78,12.78,0,0,1-10.19,4.83,11.43,11.43,0,0,1-11.47-10.72Zm-75.58,8.15a23.68,23.68,0,0,0,18.5,8.84c9.21,0,16.38-6,16.38-15.33,0-6-3.32-9.74-6.87-12.08-6.79-4.53-18-6-18-12.68,0-4.61,4.38-7.1,8.75-7.1a14.55,14.55,0,0,1,9.44,3.62l4.46-5.51a21.76,21.76,0,0,0-14.2-5.28c-9.21,0-16,6.34-16,14,0,5.51,2.94,9.14,6.72,11.63,7,4.6,18.19,5.51,18.19,13.59,0,4.75-4.3,7.92-9.21,7.92-5.44,0-9.81-3-12.91-6.79Z' transform='translate(-389 -337.85)'/%3E%3C/g%3E%3C/svg%3E\") no-repeat;
            width: 70px;
            display: inline-block;
            margin-left: 3px;
            height: 18px;
            line-height: 18px;
            opacity: 0.6
        }
        .sefaria-footer {
            color: #999;
            padding:20px 20px 20px 20px;
            border-top: 1px solid #ddd;
            background-color: #FBFBFA;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: "Helvetica Neue", "Helvetica", sans-serif;
        }
        .sefaria-read-more-button {
            background-color: #fff;
            padding: 5px 10px;
            margin-top: -3px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .interface-hebrew .sefaria-powered-by-box {
            margin-top: -6px
        }
        .sefaria-read-more-button a {
            text-decoration: none;
            color: #666;
        }
        #sefaria-linker-header {
            border-top: 4px solid #ddd;
            border-bottom: 1px solid #ddd;
            background-color: #FBFBFA;
            text-align: center;
            padding-bottom: 3px;
        }
        .interface-hebrew .sefaria-footer {
            direction: rtl;
            font-family: "Heebo", sans-serif
        };

        #sefaria-close {
                font-family: "Crimson Text";
                font-size: 36px;
                height: 48px;
                line-height: 48px;
                position: absolute;
                top: -5px;
                left: 20px;
                cursor: pointer;
                color: #999;
                border: 0;
                outline: none;
            }
        </style>
        <div id="sefaria-close">×</div>`;

    const readMoreText = {
        "english": "Read More ›",
        "hebrew": "קרא עוד ›"
    }[options.interfaceLang];
    const poweredByText = {
        "english": "Powered by",
        "hebrew": '<center>מונע ע"י<br></center>'
    }[options.interfaceLang];

    html += `<div id="sefaria-linker-header">
            <h1 id="sefaria-title"><span class="he" dir="rtl"></span><span class="en"></span></h1>
        </div>
        <div class="sefaria-text" id="sefaria-linker-text" tabindex="0"></div>

        <div class="sefaria-footer">
            <div class="sefaria-powered-by-box">${poweredByText}<div id="sefaria-logo">&nbsp;</div></div>
            <span class="sefaria-read-more-button">
                <a class = "sefaria-popup-ref" href = "">${readMoreText}</a>
            </span>
        </div>`;

    popUpElem.innerHTML = html;

    // Apply function-critical styles
    popUpElem.style.position = "fixed";
    popUpElem.style.overflow = "hidden";
    popUpElem.style.display = "none";
    popUpElem.style.zIndex = 1000;

    // Accessibility Whatnot
    popUpElem.setAttribute('role', 'dialog');
    popUpElem.tabIndex = "0";
    popUpElem.style.outline = "none";

    popUpElem = document.body.appendChild(popUpElem);

    linkerHeader = popUpElem.querySelector("#sefaria-linker-header");
    linkerFooter = popUpElem.querySelector(".sefaria-footer");
    textBox = popUpElem.querySelector(".sefaria-text");
    heTitle = popUpElem.querySelector("#sefaria-title .he");
    enTitle = popUpElem.querySelector("#sefaria-title .en");
    heElems = popUpElem.querySelectorAll(".he");
    enElems = popUpElem.querySelectorAll(".en");

    popUpElem.querySelector('#sefaria-close').addEventListener('click', hidePopup, false);
    popUpElem.addEventListener('keydown', function (e) {
        var key = e.which || e.keyCode;
        if (key === 27) { // 27 is escape
          hidePopup();
        }
        else if (key === 9) { // 9 is tab
          e.preventDefault(); // this traps user in the dialog via tab
        }
    });
    document.addEventListener("click", function (e) {
        if (popUpElem.style.display === "none") return;
        for (let element = e.target; element; element = element.parentNode) {
            if (element.id === popUpElem.id) return;
            if (element.nodeName === "svg" || (element.classList && element.classList.contains("sefaria-station"))) return;
        }
        hidePopup();
    });
}

function positionPopup(rect) {
    popUpElem.style.top = (rect.top > 100) ? rect.top - 50 + "px" : rect.top + 30 + "px";
    if (rect.left < window.innerWidth / 2) {
        popUpElem.style.left = rect.right + 10 + "px";
        popUpElem.style.right = "auto";
    } else {
        popUpElem.style.left = "auto";
        popUpElem.style.right = window.innerWidth - rect.left + "px";
    }
    popUpElem.style.display = "block";

    const popUpRect = popUpElem.getBoundingClientRect();
    if (window.innerHeight < popUpRect.bottom) { // popup drops off the screen
        const pos = ((window.innerHeight - popUpRect.height) - 10);
        popUpElem.style.top = (pos > 0) ? pos + "px" : "10px";
    }
}

function clearTextBox() {
    while (textBox.firstChild) {
        textBox.removeChild(textBox.firstChild);
    }
}

function showStationPopup(station, rect) {
    if (d3.event) d3.event.stopPropagation();
    clearTextBox();

    linkerHeader.style["border-top-color"] = Sefaria.palette.categoryColor(baseCategory(station.line));
    enTitle.textContent = lineLabel(station.line)
        + (station.stop ? " · " + stopLabel(station.stop) : "")
        + " · " + (isHebrew() ? ERAS[station.era].he : ERAS[station.era].en);
    heTitle.textContent = "";
    linkerFooter.style.display = "none";

    for (const work of station.works) {
        const row = document.createElement("div");
        row.className = "sefaria-station-row";

        const title = document.createElement("div");
        title.className = "sefaria-station-work";
        title.innerHTML = (isHebrew() && work.heWork ? work.heWork : work.work) +
            ' <span class="sefaria-station-count">· ' + work.refCount + '</span>';
        title.title = isHebrew() ? "מרכז את המפה כאן" : "Re-center the map here";
        title.addEventListener("click", () => refocusNetwork(work.refs[0]));
        row.appendChild(title);

        const refs = document.createElement("div");
        refs.className = "sefaria-station-refs";
        for (const ref of work.refs.slice(0, 10)) {
            const a = document.createElement("a");
            a.textContent = ref;
            a.addEventListener("click", (e) => {
                e.stopPropagation();
                showTextPopup(ref, popUpElem.getBoundingClientRect());
            });
            refs.appendChild(a);
        }
        if (work.refs.length > 10) {
            const more = document.createElement("span");
            more.textContent = "+" + (work.refs.length - 10);
            more.style.color = "#999";
            refs.appendChild(more);
        }
        row.appendChild(refs);
        textBox.appendChild(row);
    }

    positionPopup(rect);
}

async function showTextPopup(ref, rect) {
    const source = await Sefaria.getText(ref);
    clearTextBox();

    linkerHeader.style["border-top-color"] = Sefaria.palette.categoryColor(source["primary_category"]);
    linkerFooter.style.display = "flex";

    if (typeof(source.text) === "string") {
        source.text = [source.text];
        source.he = [source.he];
    }
    if (typeof(source.text) === "object") {
        source.text = [].concat.apply([], source.text);
        source.he = [].concat.apply([], source.he);
    }

    for (let i = 0; i < source.text.length; i++) {
        const enBox = document.createElement('div');
        const heBox = document.createElement('div');
        enBox.innerHTML = source.text[i];
        heBox.innerHTML = source.he[i].replace(/[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]/g, "");
        enBox.className = "en" + (!heBox.innerHTML ? " enOnly" : "");
        heBox.className = "he" + (!enBox.innerHTML ? " heOnly" : "");
        heBox.setAttribute("dir", "rtl");
        textBox.appendChild(heBox);
        textBox.appendChild(enBox);
    }

    enTitle.textContent = source.ref;
    heTitle.textContent = source.heRef;

    positionPopup(rect);

    [].forEach.call(popUpElem.querySelectorAll(".sefaria-popup-ref"), function(link) {link.setAttribute('href', "/" + Sefaria.normRef(source.ref));});

    const scrollbarOffset = popUpElem.clientWidth - textBox.clientWidth;
    if (scrollbarOffset > 0) {
        const nodes = textBox.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].style.marginRight = -scrollbarOffset + "px";
        }
    }
}

// A function declaration (not a const) so it hoists: setupPopup wires it to the
// close button at module init, before this point in the file is reached.
function hidePopup() {
    popUpElem.style.display = "none";
}

/*****          Hebrew / English Handling              *****/

function isHebrew() { return lang === "he"; }
function isEnglish() { return lang === "en"; }
function switchToEnglish() { lang = "en"; }
function switchToHebrew() { lang = "he"; }

/*****          Page title                *****/

function changePageTitle(title) {
     d3.select("title").text(title);
}
