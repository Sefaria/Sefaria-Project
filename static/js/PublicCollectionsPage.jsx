import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LoadingMessage,
  SinglePanelNavHeader,
} from './Misc';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Footer  from './Footer';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class';


function PublicGroupsPage({multiPanel, navHome}) {
  const [groupsList, setGroupsList] = useState(Sefaria.getGroupsListFromCache());
  
  const sortGroupList = d => {
    if (Sefaria.interfaceLang == "hebrew") {
      d.public.sort((a, b) => {
        const [aHe, bHe] = [a.name, b.name].map(Sefaria.hebrew.isHebrew);
        return aHe == bHe ? a.name - b.name : (aHe ? -1 : 1)
      });
    }
    return d;
  };

  if (groupsList) {
    sortGroupList(groupsList);
  }

  useEffect(() => {
    Sefaria.getGroupsList()
        .then(d => sortGroupList(d))
        .then(d => setGroupsList(d));
  });

  const classStr = classNames( {systemPanel: 1, readerNavMenu: 1, noHeader: 1 });
  return (
    <div className={classStr}>
      {multiPanel ? null :
        <SinglePanelNavHeader
          enTitle="Collections"
          heTitle={Sefaria._("Collections")}
          navHome={navHome}
          showDisplaySettings={false}/>
      }
      <div className="content hasFooter">
        <div className="contentInner">
          {multiPanel ?
          <h1>
            <span className="int-en">Public Collections</span>
            <span className="int-he">TODO Hebrew</span>
          </h1> : null}
          {multiPanel ?
          <center>
            <a className="button white" href="/collections/new">
              <span className="int-en">Create a Collection</span>
              <span className="int-he">צור TODO HEBREW</span>
            </a>
          </center> : null}

          <div className="groupsList">
            { !!groupsList ?
                (groupsList.public.length ?
                  groupsList.public.map(function(item) {
                    return <GroupListing data={item} key={item.name} />
                  })
                  : <LoadingMessage message="There are no public collections yet." heMessage="TODO Hebrew" />)
                : <LoadingMessage />
            }
          </div>

        </div>
        <Footer />
      </div>
    </div>);

}
PublicGroupsPage.propTypes = {};


function GroupListing({data, showMembership}) {
  const imageUrl = data.imageUrl || "/static/img/collection.svg";
  const imageClass = classNames({groupListingImage: 1, default: !data.imageUrl});
  const groupUrl = "/collections/" + data.name.replace(/\s/g, "-");
  return (<div className="groupListing">
            <div className="left-content">
              <a href={groupUrl}>
                <div className="groupListingImageBox">
                  <img className={imageClass} src={imageUrl} alt="Collection Logo"/>
                </div>
              </a>
              <div className="groupListingText">
                <a href={groupUrl} className="groupListingName">{data.name}</a>
                <div className="groupListingDetails">

                  { showMembership ?
                  <span className="groupListingDetail groupListingMembership">
                    <span className="int-en">{data.membership}</span>
                    <span className="int-he">Sefaria._({data.membership})</span>
                  </span> : null }
                  {showMembership ? 
                  <span className="groupListingDetailSeparator">•</span> : null }
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
          </div>);
}
GroupListing.propTypes = {
  data: PropTypes.object.isRequired,
  showMembership: PropTypes.bool,
};

export {
  GroupListing,
  PublicGroupsPage,
};
