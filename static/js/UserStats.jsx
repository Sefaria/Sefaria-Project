import React, { useState, useEffect, useContext, useRef} from 'react';
const $          = require('./sefaria/sefariaJquery');
const d3 = require('./lib/d3.v5.min');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const { usePaginatedScroll } = require('./Hooks');
import Component from 'react-class';


const UserStats = () => {

    const [uid, setUid] = useState(1);
    const [user_data, setUserData] = useState({});
    const [site_data, setSiteData] = useState({});

    useEffect(() => {
        $.getJSON("/api/site_stats")
            .then(setSiteData);
    }, [uid]);
    useEffect(() => {
        $.getJSON("/api/user_stats/" + uid)
            .then(setUserData);
    }, [uid]);

    return (
        <div className="content hasFooter" style={{overflowY: "scroll"}}>
          <div className="contentInner" style={{margin: "0 80px"}}>
            <h1 style={{textAlign: "center"}}>
              <span className="int-en">User Stats</span>
              <span className="int-he">סטטיסטיקות משתמש</span>
            </h1>
          <UserChooser setter={setUid}/>
          {user_data.uid && <UserDataBlock user_data={user_data}/>}
          <div style={{display: "flex", justifyContent:"space-around"}}>
              {user_data.uid && <CategoriesPie title="User" cats={user_data.categoriesRead}/>}
              <CategoriesPie title="Site" cats={site_data.categoriesRead}/>
          </div>
          </div>
        </div>
    );
};

const UserChooser = ({setter}) => (
    <div style={{textAlign: "center"}}>
      <label>User ID:
        <input type="text" onChange={e => setter(e.target.value)}/>
      </label>
    </div>
);

const UserDataBlock = ({user_data}) => (
    <div>
        <h2><a href={user_data.profileUrl}>{user_data.name}</a></h2>
        <div>{user_data.position?(user_data.position + " at " + user_data.organization):user_data.organization}</div>
        <div><img src={user_data.imageUrl} width="80" height="80" style={{float: "right"}}/></div>
        <br/>
        <div>{user_data.sheetsRead} Sheets Read</div>
        <div>{user_data.textsRead} Texts Read</div>
    </div>
);

const makeOtherCategory = data => {
    const total = data.map(e => e.value).reduce((a, b) => a + b, 0);
    const bar = total * .02;
    const remainder = data.filter(e => e.value < bar).map(e => e.value).reduce((a, b) => a + b, 0);
    const result = data.filter(e => e.value >= bar);
    result.push({name: "Etc", value: remainder});
    return result;
};

//Object.entries(data.categoriesRead).sort((a,b)=>b[1]-a[1]).map((e,i) => <div key={i}>{e[0]}: {Number(e[1]).toLocaleString(undefined,{style: 'percent', minimumFractionDigits:2})}</div>)}
const CategoriesPie = ({cats, title}) => {
    if (!cats) return null;
    const svg_ref = useRef();

    const width = 420;
    const height = 420;
    const raw_data = Object.entries(cats).map(e => ({name: e[0], value: e[1]}));
    if (!raw_data.length) {return <div></div>}
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
        .innerRadius(0)
        .outerRadius(Math.min(width, height) / 2 - 1);
    /* const color = d3.scaleOrdinal()
        .domain(data.map(d => d.name))
        .range(d3.quantize(t => d3.interpolateSpectral(t * 0.8 + 0.1), data.length).reverse());
    */
    //const color = Sefaria.palette.categoryColor;
    const color = (cat) => d3.color(Sefaria.palette.categoryColor(cat)).brighter().hex();

    useEffect(()=>{
        const svg = d3.select(svg_ref.current);
        if (!svg) {return;}

        const g = svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);
        g.selectAll("path")
          .data(arcs)
          .enter().append("path")
            .attr("fill", d => color(d.data.name))
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

        return () => {}; //remove svg
    }, [cats]);

    return (
        <div style={{font: "12px sans-serif", padding: "0 10px"}} className="cat-pie">
            <h3>{title}</h3>
            <svg ref={svg_ref} width={420} height={420} textAnchor="middle" />
        </div>
    );
};


module.exports = UserStats;
