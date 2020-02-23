import React, { useState, useEffect, useCallback, useRef } from 'react';
const {
  LoadingMessage,
  SinglePanelNavHeader,
}                = require('./Misc');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
const Footer     = require('./Footer');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class';

function MyGroupsPanel({multiPanel, navHome}) {
  const [groupsList, setGroupsList] = useState(null);
  useEffect(() => {
    Sefaria.getGroupsList()
        .then(d => setGroupsList(d));
  });

  const classStr = classNames( {myGroupsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 });
  return (
    <div className={classStr}>
      {multiPanel ? null :
        <SinglePanelNavHeader
          enTitle="My Groups"
          heTitle="הקבוצות שלי"
          navHome={navHome}
          showDisplaySettings={false}/>
      }
      <div className="content hasFooter">
        <div className="contentInner">
          {multiPanel ?
          <h1>
            <span className="int-en">My Groups</span>
            <span className="int-he">הקבוצות שלי</span>
          </h1> : null }
          {multiPanel ?
          <center>
            <a className="button white" href="/groups/new">
              <span className="int-en">Create a Group</span>
              <span className="int-he">צור קבוצה</span>
            </a>
          </center> : null }

          <div className="groupsList">
            { groupsList ?
                (groupsList.private.length ?
                  groupsList.private.map(function(item) {
                    return <GroupListing data={item} key={item.name} />
                  })
                  : <LoadingMessage message="You aren't a member of any groups yet." heMessage="אינך חבר כרגע באף קבוצה" />)
                : <LoadingMessage />
            }
          </div>

        </div>
        <Footer />
      </div>
    </div>);
}
MyGroupsPanel.propTypes = {};

function PublicGroupsPanel({multiPanel, navHome}) {
  const [groupsList, setGroupsList] = useState(null);
  useEffect(() => {
    Sefaria.getGroupsList()
        .then(d => setGroupsList(d));
  });

  const classStr = classNames( {myGroupsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 });
  return (
    <div className={classStr}>
      {multiPanel ? null :
        <SinglePanelNavHeader
          enTitle="Groups"
          heTitle={Sefaria._("Groups")}
          navHome={navHome}
          showDisplaySettings={false}/>
      }
      <div className="content hasFooter">
        <div className="contentInner">
          {multiPanel ?
          <h1>
            <span className="int-en">Public Groups</span>
            <span className="int-he">קבוצות</span>
          </h1> : null}
          {multiPanel ?
          <center>
            <a className="button white" href="/groups/new">
              <span className="int-en">Create a Group</span>
              <span className="int-he">צור קבוצה</span>
            </a>
          </center> : null}

          <div className="groupsList">
            { groupsList ?
                (groupsList.public.length ?
                  groupsList.public.map(function(item) {
                    return <GroupListing data={item} key={item.name} />
                  })
                  : <LoadingMessage message="You aren't a member of any groups yet." heMessage="אינך חבר כרגע באף קבוצה" />)
                : <LoadingMessage />
            }
          </div>

        </div>
        <Footer />
      </div>
    </div>);

}
PublicGroupsPanel.propTypes = {};

function GroupListing({data, showMembership}) {
  const imageUrl = data.imageUrl || "/static/img/group.svg";
  const imageClass = classNames({groupListingImage: 1, default: !data.imageUrl});
  const groupUrl = "/groups/" + data.name.replace(/\s/g, "-");
  return (<div className="groupListing">
            <div className="left-content">
              <a href={groupUrl}>
                <div className="groupListingImageBox">
                  <img className={imageClass} src={imageUrl} alt="Group Logo"/>
                </div>
              </a>
              <div className="groupListingText">
                <a href={groupUrl} className="groupListingName">{data.name}</a>
                <div className="groupListingDetails">
                  <span className="groupListingDetail groupListingMemberCount">
                    <span className="int-en">{data.memberCount} Members</span>
                    <span className="int-he">{data.memberCount} חברים</span>
                  </span>
                  <span className="groupListingDetailSeparator">•</span>
                  <span className="groupListingDetail groupListingSheetCount">
                    <span className="int-en">{data.sheetCount} Sheets</span>
                    <span className="int-he">{data.sheetCount} דפים</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="right-content">
              { showMembership ? data.membership : null }
            </div>
          </div>);
}
GroupListing.propTypes = {
  data: PropTypes.object.isRequired,
  showMembership: PropTypes.bool,
};

module.exports.GroupListing = GroupListing;
module.exports.MyGroupsPanel = MyGroupsPanel;
module.exports.PublicGroupsPanel = PublicGroupsPanel;
