import React, { useState, useEffect, useContext, useRef} from 'react';
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const { usePaginatedScroll } = require('./Hooks');
import Component from 'react-class';


const UserStats = () => {

    const [uid, setUid] = useState(1);
    const [data, setData] = useState({});

    useEffect(() => {
        $.getJSON("/api/user_stats/" + uid)
            .then(setData);
    }, [uid]);

    return (
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <span className="int-en">User Stats</span>
              <span className="int-he">סטטיסטיקות משתמש</span>
            </h1>
          <UserChooser setter={setUid}/>
          {data.uid?<UserDataBlock data={data}/>:""}
          </div>
        </div>
    );
};

const UserDataBlock = ({data}) => (
    <div>
        <h2><a href={data.profileUrl}>{data.name}</a></h2>
        <div>{data.position?(data.position + " at " + data.organization):data.organization}</div>
        <div><img src={data.imageUrl}/></div>
        <br/>
        <div>{data.sheetsRead} Sheets Read</div>
        <div>{data.textsRead} Texts Read</div>
        <br/>
        <div>
            {Object.entries(data.categoriesRead).sort((a,b)=>b[1]-a[1]).map((e,i) => <div key={i}>{e[0]}: {Number(e[1]).toLocaleString(undefined,{style: 'percent', minimumFractionDigits:2})}</div>)}
        </div>
    </div>
);

const UserChooser = ({setter}) => (
    <div>
      <label>User ID:
        <input type="text" onChange={e => setter(e.target.value)}/>
      </label>
    </div>
);


module.exports = UserStats;
