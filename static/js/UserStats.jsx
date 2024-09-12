import React, { useState, useEffect, useContext, useRef} from 'react';
import $  from './sefaria/sefariaJquery';
import * as d3 from './lib/d3.v5.min';
import Sefaria  from './sefaria/sefaria';
import {StorySheetList} from './Story';
import { useDebounce } from './Hooks';
import {
    SimpleLinkedBlock,
    SimpleInterfaceBlock,
    TextBlockLink,
    NBox,
    LoadingRing
} from './Misc';


const UserStats = () => {

    const [uid, setUid] = useState(null);
    const [user_data, setUserData] = useState({});
    const [site_data, setSiteData] = useState({});
    const [active_mode, setMode] = useState("profile.previous_year");

    const modes = ["profile.previous_year", "profile.all_time"];
    const modekeys = {
        "profile.previous_year": "currently",
        "profile.all_time": "alltime"
    };

    const debouncedUID = useDebounce(uid, 500);

    useEffect(() => {
        $.getJSON("/api/site_stats")
            .then(d => setSiteData(d));
    }, []);

    useEffect(() => {
        const uid = debouncedUID || Sefaria._uid;
        setUserData({});
        $.getJSON("/api/user_stats/" + uid)
            .then(d => setUserData(d));
    }, [debouncedUID]);


    const all_ready = !!(user_data.uid && site_data.alltime);
    let mode_user_data;
    let user_active;
    if (all_ready) {
        mode_user_data = user_data[modekeys[active_mode]];
        user_active = (mode_user_data.textsRead > 2) || (mode_user_data.sheetsRead > 2) || (mode_user_data.sheetsThisPeriod > 1);
    }
    // let user_active = true;
    return (
    <div className="homeFeedWrapper userStats">
      <div className="content" style={{padding: "0 40px 80px"}}>
          <div className="contentInner">
              <h1 style={{textAlign: "center"}}>
                  {all_ready? user_data.name : <LoadingRing />}
              </h1>
              {Sefaria.is_moderator && <UserChooser setter={setUid}/>}
              <UserStatModeChooser modes={modes} activeMode={active_mode} setMode={setMode}/>
              {all_ready && user_active &&  <UserDataBlock user_data={mode_user_data} site_data={site_data[modekeys[active_mode]]}/>}
              {all_ready && (!user_active) && <SiteDataBlock site_data={site_data[modekeys[active_mode]]}/>}
          </div>
      </div>
    </div>
    );
};

const UserStatModeChooser = ({modes, activeMode, setMode}) => (
  <div className="userStatModeChooser">
      {modes.map(m => <UserStatModeButton key={m} thisMode={m} activeMode={activeMode} setMode={setMode}/>)}
  </div>
);

const UserStatModeButton = ({thisMode, activeMode, setMode}) => (
    <div className={"userStatModeButton" + (thisMode === activeMode?" active":"")}
         onClick  ={()=>setMode(thisMode)}>
        <span>{Sefaria._(thisMode)}</span>
    </div>
);

const UserChooser = ({setter}) => (
    <div style={{textAlign: "center"}}>
      <label>
        <span className={`${Sefaria.languageClassFont()}`}> User ID: </span>
        <input type="text" onChange={e => setter(parseInt(e.target.value))}/>
      </label>
    </div>
);

const SiteDataBlock = ({site_data}) => (
    <div>
        <div className="chartRow centered">
            <div className="systemText statHeader">
                <span className={`${Sefaria.languageClassFont()}`}>
                    Looks like we haven’t seen you in a while!<br/>
                    Discover what other people are doing on Sefaria...
                </span>
            </div>
        </div>

        <div>
            <h2>
                <span className={`${Sefaria.languageClassFont()}`}>What People are Reading</span>
            </h2>
            {/* <div className="chartRow centered">
                <CategoriesDonut title="Average Sefaria User" heTitle="משתמש ממוצע בספריא" cats={site_data.categoriesRead}/>
            </div> */}
        </div>
        <div>
            <h2>
                <span className={`${Sefaria.languageClassFont()}`}>Top Categories</span>
            </h2>
            <div className="chartRow">
                <CategoryBars user_cats={site_data.categoriesRead} site_cats={site_data.categoriesRead}/>
            </div>
        </div>
    </div>
);
const UserDataBlock = ({user_data, site_data}) => (
    <div>
        <OverallActivityBlock user_data={user_data}/>
        <UserDonutsBlock user_data={user_data} site_data={site_data}/>
        <UserCategoryBarchartBlock user_data={user_data} site_data={site_data}/>
        <YourFavoriteTextsBlock user_data={user_data} />
        <YourFavoriteSheetsBlock user_data={user_data} />
        <MostPopularSheetsBlock user_data={user_data} />
    </div>
);

const OverallActivityBlock = ({user_data}) => (
        <div>
            <h2>
                <span className={`${Sefaria.languageClassFont()}`}>Your Overall Activity</span>
                <span className={`${Sefaria.languageClassFont()}`}>གང་བྱས་ཚང་མ།</span>
            </h2>
            <div className="statcardRow">
                <StatCard icon_file="book-icon-black.svg" number={user_data.textsRead} name={Sefaria._("profile.text_read")} />
                <StatCard icon_file="file-icon-black.svg" number={user_data.sheetsRead} name={Sefaria._("profile.sheet_read")} />
                <StatCard icon_file="plus-icon-black.svg" number={user_data.sheetsThisPeriod} name="profile.sheet_created"/>
            </div>
        </div>
);

const StatCard = ({icon_file, name, number}) => (
    <div className="statcard">
        <img src={"static/img/" + icon_file}/>
        <div className="statcardValue">{number}</div>
        <div className="statcardLabel">{Sefaria._(name)}</div>
    </div>
);

const UserDonutsBlock = ({user_data, site_data}) => (
        <div>
            {/* <h2>
                <span className="int-en">Your Reading by Category</span>
                <span className="int-he">לימוד לפי סוגה</span>
            </h2>
            <div className="chartRow">
                <CategoriesDonut title="Your Reading" heTitle="הלימוד שלך" cats={user_data.categoriesRead}/>
                <CategoriesDonut title="Average Sefaria User" heTitle="משתמש ממוצע בספריא" cats={site_data.categoriesRead}/>
            </div> */}
        </div>
);
const UserCategoryBarchartBlock = ({user_data, site_data}) => (
        <div>
            {/* <h2>
                <span className="int-en">Your Top Categories</span>
                <span className="int-he">מצעד סוגות הלימוד</span>
            </h2>
            <div className="chartRow">
                <CategoryBars user_cats={user_data.categoriesRead} site_cats={site_data.categoriesRead}/>
            </div> */}
        </div>
);
const YourFavoriteTextsBlock = ({user_data}) => (
    user_data.mostViewedRefs.length ?
        <div className="yourFavoriteTextsBlock">
            <h2>
                <span className="int-en">Your Favorite Texts</span>
                <span className="int-he">ཁྱེད་རང་དགའ་ཤོས་ཀྱི་ཡིག་ཆ།</span>
            </h2>
            <NBox n={3} content={user_data.mostViewedRefs.map((r,i) =>
                <TextBlockLink key={i} sref={r.en} title={r.en} heTitle={r.he} book={r.book} intlang={true}/>)}/>
        </div>
    : null
);
const YourFavoriteSheetsBlock = ({user_data}) => (
    user_data.mostViewedSheets.length ?
        <div className="yourFavoriteSheetsBlock">
            <h2>
                <span className="int-en">Your Favorite Sheets</span>
                <span className="int-he">דפי מקורות מועדפים</span>
            </h2>
            <div className="story">
                <StorySheetList sheets={user_data.mostViewedSheets} compact={true} smallfonts={true}/>
            </div>
        </div>
    : null
);
const MostPopularSheetsBlock = ({user_data}) => (
    user_data.popularSheets.length ?
        <div className="yourPopularSheetsBlock">
            <h2>
                <span className="int-en">Your Most Popular Sheets</span>
                <span className="int-he">דפי מקורות פופולריים שלך</span>
            </h2>
            {user_data.popularSheets.map((sheet, i) => <div key={i}>
                    <SimpleLinkedBlock classes="chapterText lowercase sheetLink" en={sheet.title} he={sheet.title} url={"/sheets/" + sheet.id}/>
                    <SimpleInterfaceBlock classes="sheetViews smallText" en={sheet.views +" Views"} he={sheet.views + " צפיות"}/>
                </div>
            )}
        </div>
    : null
);

const mapToPercentage = data => {
    const newData = {};
    const total = Object.entries(data).map(k => k[1]).reduce((a, b) => a + b, 0);
    Object.keys(data).forEach(k => newData[k] = data[k]/total);
    return newData;
};

const makeOtherCategory = data => {
    const total = data.map(e => e.value).reduce((a, b) => a + b, 0);
    const bar = total * .04;
    const remainder = data.filter(e => e.value < bar).map(e => e.value).reduce((a, b) => a + b, 0);
    const result = data.filter(e => e.value >= bar);
    result.push({name: "Etc", value: remainder});
    return result;
};

const CategoryBars = ({user_cats, site_cats}) => {
    const svg_ref = useRef();

    const margin = {top: 20, right: 0, bottom: 0, left: 0};
    const perBarHeight = 75;
    const max_cats = 5;
    const height = margin.top + margin.bottom + (perBarHeight * Math.min(Object.keys(user_cats).length, max_cats));
    const width = 660;

    const keys = ["user", "site"];


    useEffect(()=> {
        const svg = d3.select(svg_ref.current);
        if (!svg) {return;}

        const user_percents = mapToPercentage(user_cats);
        const site_percents = mapToPercentage(site_cats);
        const orderedCats = Object.entries(user_cats).sort((a, b) => b[1] - a[1]).map(d => d[0]);
        const data = orderedCats.slice(0,max_cats).map(cat => ({cat: cat, site: site_percents[cat], user: user_percents[cat]}));

        const y = d3.scaleBand()
            .domain(data.map(d => d.cat))
            .rangeRound([margin.top, height - margin.bottom])
            .paddingInner(0.1);

        const inter_bar_padding = 0.05;
        const below_text_padding = 10;
        const userbar = 5;
        const sitebar = 34;

        const x = d3.scaleLinear()
            .domain([0, d3.max(data.map(d => [d.site, d.user]).flat()) + .10]).nice();
        if (Sefaria.interfaceLang === "english") {
            x.rangeRound([0,width - margin.right]);
        } else {
            x.rangeRound([0,width - margin.right]);
        }

        const groups = svg.append("g")
            .selectAll("g")
            .data(data)
            .join("g")
            .attr("transform", d => `translate(${margin.left}, ${y(d.cat)})`);

        groups.append("text")
            .attr("font-family", (Sefaria.interfaceLang === "english" ? '"Taamey Frank", "adobe-garamond-pro", "Crimson Text", Georgia, serif' : '"Heebo", sans-serif'))
            .attr("text-anchor", "start")
            .attr("x", d => Sefaria.interfaceLang === "hebrew" ? width - margin.right : null)
            .attr("letter-spacing", Sefaria.interfaceLang === "english" ? 1.5 : null)
            .attr("font-size", 16)
            .text(d => Sefaria._(d.cat).toUpperCase());

        groups.selectAll("rect")
            .data(d => keys.map(key => ({key, cat:d.cat, value: d[key]})))
            .join("rect")
            .attr("class", d => d.key)
            .attr("x", d => Sefaria.interfaceLang === "english" ? 0 : width - margin.right - x(d.value))
            .attr("y", d => d.key === "user" ? below_text_padding : below_text_padding + userbar + inter_bar_padding)
            .attr("width", d => x(d.value))
            .attr("height", d => d.key === "user" ? userbar : sitebar)
            .attr("fill", d => d.key === "user" ? Sefaria.palette.categoryColor(d.cat) : "#ededec");

        d3.select("svg g g:first-child")
            .append("text")
            .attr("y", below_text_padding + userbar + inter_bar_padding + sitebar - 11)
            .attr("x", d => x(d.site) > 250 ? x(d.site) - 20 : x(d.site) + 20)
            .attr("font-size", 16)
            .attr("fill", "#999")
            .attr("text-anchor", d => x(d.site) > 250 ? "end" : "start")
            .text(Sefaria._("profile.averages_pecha_user"));

        return () => {svg.selectAll("*").remove();}
    }, [user_cats, site_cats]);

    return (
        <div className="chartWrapper">
            <svg ref={svg_ref} width={width} height={height} textAnchor="middle" />
        </div>
    );
};

const CategoriesDonut = ({cats, title, heTitle}) => {
    const svg_ref = useRef();

    const width = 280;
    const height = 280;
    const raw_data = Object.entries(cats).map(e => ({name: e[0], value: e[1]}));
    const data = (raw_data.length > 2)?makeOtherCategory(raw_data):raw_data;
    const total = data.map(e => e.value).reduce((a, b) => a + b, 0);
    const compare = (a,b) => (
        a.name==="Etc"? 1
        :b.name==="Etc"? -1
        :b.value - a.value);
    const pie = d3.pie()
        .sort(compare)
        .value(d => d.value);
    const arcs = pie(data);
    const radius = Math.min(width, height) / 2 * 0.75;
    const arcLabel = d3.arc().innerRadius(radius).outerRadius(radius);
    const arc = d3.arc()
        .innerRadius(Math.min(width, height) / 2 - 10)
        .outerRadius(Math.min(width, height) / 2 - 1);

    useEffect(()=>{
        const svg = d3.select(svg_ref.current);
        if (!svg) {return;}

        const g = svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);
        g.selectAll("path")
          .data(arcs)
          .enter().append("path")
            .attr("fill", d => Sefaria.palette.categoryColor(d.data.name))
            .attr("stroke", "white")
            .attr("d", arc)
          .append("title")
            .text(d => `${d.data.name}: ${d.data.value.toLocaleString(undefined,{style: 'percent', minimumFractionDigits:2})}`);

        const text = g.selectAll("text")
          .data(arcs)
          .enter().append("text")
            .attr("transform", d => `translate(${arcLabel.centroid(d)})`)
            .attr("dy", "0.35em");

      text.append("tspan")
          .attr("x", 0)
          .attr("y", "-0.7em")
          .text(d => Sefaria._(d.data.name));

      text.filter(d => (d.endAngle - d.startAngle) > 0.25).append("tspan")
          .attr("x", 0)
          .attr("y", "0.7em")
          .attr("fill", "#999")
          .text(d => (d.data.value/total).toLocaleString(undefined,{style: 'percent'}) );

        return () => {svg.selectAll("*").remove();}
    }, [cats]);


    return (
        <div className="chartWrapper">
            <svg ref={svg_ref} width={width} height={height} textAnchor="middle" />
            <SimpleInterfaceBlock classes="chartLabel smallText" en={title} he={heTitle}/>
        </div>
    );
};


export default UserStats;
