import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IntText,
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
            <IntText>Collections</IntText>
          </h1> : null}
          {multiPanel ?
          <center>
            <a className="button white" href="/collections/new">
              <IntText>Create a Collection</IntText>
            </a>
          </center> : null}

          <div className="groupsList">
            { !!groupsList ?
                (groupsList.public.length ?
                  groupsList.public.map(function(item) {
                    return <GroupListing data={item} key={item.name} />
                  })
                  : <IntText>There are no public collections yet.</IntText>)
                : <LoadingMessage />
            }
          </div>

        </div>
        <Footer />
      </div>
    </div>);

}
PublicGroupsPage.propTypes = {};


function GroupListing({data, showMembership, small}) {
  const imageUrl = data.imageUrl && !small ? data.imageUrl : "/static/img/collection.svg";
  const imageClass = classNames({groupListingImage: 1, default: !data.imageUrl});
  const groupUrl = "/collections/" + data.slug;
  return (<div className="groupListing">
            <div className="left-content">
              {!small ?
              <a href={groupUrl}>
                <div className="groupListingImageBox">
                  <img className={imageClass} src={imageUrl} alt="Collection Logo"/>
                </div>
              </a>
              : null }
              <div className="groupListingText">
                
                <a href={groupUrl} className="groupListingName">
                  {small ? <img className={imageClass} src={imageUrl} alt="Collection Icon"/> : null}
                  {data.name}
                </a>
               
                <div className="groupListingDetails">
                  {data.listed ? null :
                    (<span className="unlisted">
                      <img src="/static/img/eye-slash.svg"/>
                      <IntText>Unlisted</IntText>
                    </span>) }

                  {data.listed ? null :
                  <span className="groupListingDetailSeparator">•</span> }
                  
                  <span className="groupListingDetail groupListingSheetCount">
                    <IntText>{`${data.sheetCount} `}</IntText>
                    <IntText>Sheets</IntText>
                  </span>

                  {data.memberCount > 1 && small ? 
                  <span className="groupListingDetailSeparator">•</span> : null }

                  {data.memberCount > 1 && small ?
                  <span className="groupListingDetail groupListingMemberCount">
                    <IntText>{`${data.memberCount} `}</IntText>
                    <IntText>Editors</IntText>
                  </span> : null }
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