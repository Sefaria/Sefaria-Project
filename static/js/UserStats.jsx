import React, { useState, useEffect, useContext, useRef} from 'react';
const $          = require('./sefaria/sefariaJquery');
const d3 = require('./lib/d3.v5.min');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const {SimpleLinkedBlock}    = require('./Misc');
const { usePaginatedScroll } = require('./Hooks');
import Component from 'react-class';


const UserStats = () => {

    const [uid, setUid] = useState(1);
    const [user_data, setUserData] = useState({});
    const [quick_data, setQuickData] = useState({});
    const [site_data, setSiteData] = useState({});

    useEffect(() => {
        $.getJSON("/api/site_stats")
            .then(d => setSiteData(d));
    }, []);
    useEffect(() => {
        setQuickData({});
        setUserData({});
        $.getJSON("/api/user_stats/" + uid + "?quick=1")
            .then(d => { if (parseInt(uid)===parseInt(d.uid)) setQuickData(d); else console.log(uid + "!=" + d.uid)});
        $.getJSON("/api/user_stats/" + uid)
            .then(d => { if (parseInt(uid)===parseInt(d.uid)) setUserData(d); else console.log(uid + "!=" + d.uid)});  /// !!
    }, [uid]);

    const all_user_data = {...quick_data, ...user_data};
    const all_ready = user_data.uid && site_data.categoriesRead;

    return (
    <div className="homeFeedWrapper">
      <div className="content hasFooter" style={{padding: "0 40px 80px"}}>
        <h1 style={{textAlign: "center"}}>
          <span className="int-en">User Stats</span>
          <span className="int-he">סטטיסטיקות משתמש</span>
        </h1>
        <UserChooser setter={setUid}/>
        <UserProfileBlock user_data={all_user_data}/>
        {all_ready?<UserDataBlock user_data={all_user_data} site_data={site_data}/>:"Loading"}
      </div>
    </div>
    );
};

const UserChooser = ({setter}) => (
    <div style={{textAlign: "center"}}>
      <label>User ID:
        <input type="text" onChange={e => setter(parseInt(e.target.value))}/>
      </label>
    </div>
);

const UserProfileBlock = ({user_data}) => (
        <div style={{display: "flex", justifyContent:"center"}}>
            <div style={{padding: "0 10px"}}>
                <img src={user_data.imageUrl} width="80" height="80"/>
            </div>
            <div style={{padding: "0 10px"}}>
                <h3><a href={user_data.profileUrl}>{user_data.name}</a></h3>
                <div>{user_data.position?(user_data.position + " at " + user_data.organization):user_data.organization}</div>
            </div>
        </div>
);
const UserDataBlock = ({user_data, site_data}) => (
    <div>
        <div style={{display: "flex", justifyContent:"center"}}>
            <div style={{padding: "0 10px"}}>
                <h3>Reading</h3>
                <div>{user_data.sheetsRead} Sheets Read</div>
                <div>{user_data.textsRead} Texts Read</div>
            </div>
            <div style={{padding: "0 10px"}}>
                <h3>Writing</h3>
                <div>{user_data.totalSheets} Sheets Created</div>
                <div>{user_data.publicSheets} Public Sheets</div>
                <div>{user_data.sheetsThisPeriod} Sheets Created This Year</div>
            </div>
            <div style={{padding: "0 10px"}}>
                <h3>Most Popular This Year</h3>
                {user_data.popularSheets.map((sheet, i) =>
                    <SimpleLinkedBlock key={i} en={sheet.title} he={sheet.title} url={"/sheets/" + sheet.id}/>
                )}
            </div>
        </div>
        <div style={{display: "flex", justifyContent:"space-around"}}>
          <CategoriesPie title="User" cats={user_data.categoriesRead}/>
          <CategoriesPie title="Site" cats={site_data.categoriesRead}/>
        </div>
        <div style={{display: "flex", justifyContent:"space-around"}}>
          <CategoryBars user_cats={user_data.categoriesRead} site_cats={site_data.categoriesRead}/>
        </div>
    </div>
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

/* const color = d3.scaleOrdinal()
    .domain(data.map(d => d.name))
    .range(d3.quantize(t => d3.interpolateSpectral(t * 0.8 + 0.1), data.length).reverse());
*/
const categoryColor = Sefaria.palette.categoryColor;
const brighterCategoryColor = (cat) => d3.color(Sefaria.palette.categoryColor(cat)).brighter().hex();

const CategoryBars = ({user_cats, site_cats}) => {
    const svg_ref = useRef();

    const height = 420;
    const width = 1000;
    const margin = {top: 10, right: 10, bottom: 20, left: 40};

    const keys = ["user", "site"];


    useEffect(()=> {
        const svg = d3.select(svg_ref.current);
        if (!svg) {
            return;
        }
        const orderedCats = Object.entries(site_cats).sort((a, b) => b[1] - a[1]).map(d => d[0]);

        const up = mapToPercentage(user_cats);
        const sp = mapToPercentage(site_cats);
        const data = orderedCats.map(cat => ({cat: cat, site: sp[cat], user: up[cat]}));

        const x0 = d3.scaleBand()
            .domain(orderedCats)
            .rangeRound([margin.left, width - margin.right])
            .paddingInner(0.1);

        const x1 = d3.scaleBand()
            .domain(keys)
            .rangeRound([0, x0.bandwidth()])
            .padding(0.05);

        const y = d3.scaleLinear()
            .domain([0, .5]).nice()
            .rangeRound([height - margin.bottom, margin.top]);

        const xAxis = g => g
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x0).tickSizeOuter(0))
            .call(g => g.select(".domain").remove());

        const yAxis = g => g
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5, "%"))
            .call(g => g.select(".domain").remove())
            .call(g => g.select(".tick:last-of-type text").clone()
                .attr("x", 3)
                .attr("text-anchor", "start")
                .attr("font-weight", "bold")
                .text("Percent"));

        svg.append("g")
            .selectAll("g")
            .data(data)
            .join("g")
            .attr("transform", d => `translate(${x0(d.cat)},0)`)
            .selectAll("rect")
            .data(d => keys.map(key => ({key, cat:d.cat, value: d[key]})))
            .join("rect")
            .attr("x", d => x1(d.key))
            .attr("y", d => y(d.value))
            .attr("width", x1.bandwidth())
            .attr("height", d => y(0) - y(d.value))
            .attr("fill", d => d.key === "site" ? categoryColor(d.cat) : "#aaa");

        svg.append("g")
            .call(xAxis);

        svg.append("g")
            .call(yAxis);

        return () => {svg.selectAll("*").remove();}
    }, [user_cats, site_cats]);

    return (
        <div style={{font: "12px sans-serif"}}>
            <h3>Comparison to Sitewide</h3>
            <svg ref={svg_ref} width={width} height={height} textAnchor="middle" />
        </div>
    );
};

const CategoriesPie = ({cats, title}) => {
    const svg_ref = useRef();

    const width = 420;
    const height = 420;
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
    const radius = Math.min(width, height) / 2 * 0.8;
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
            .attr("fill", d => categoryColor(d.data.name))
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
          .style("font-weight", "bold")
          .text(d => d.data.name);

      text.filter(d => (d.endAngle - d.startAngle) > 0.25).append("tspan")
          .attr("x", 0)
          .attr("y", "0.7em")
          .attr("fill-opacity", 0.7)
          .text(d => d.data.value + " (" + (d.data.value/total).toLocaleString(undefined,{style: 'percent'}) +")");

        return () => {svg.selectAll("*").remove();}
    }, [cats]);

    // if (!raw_data.length) {return <div></div>}

    return (
        <div style={{font: "12px sans-serif", padding: "0 10px"}}>
            <h3>{title}</h3>
            <svg ref={svg_ref} width={width} height={height} textAnchor="middle" />
        </div>
    );
};


module.exports = UserStats;
