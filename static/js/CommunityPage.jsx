import React, { useState, useEffect, useCallback, useRef } from 'react';
import Component from 'react-class';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import PropTypes from 'prop-types';
import classNames  from 'classnames';
import { NavSidebar, Modules } from './NavSidebar';
import Footer from'./Footer';
import {
  InterfaceText,
  LoadingMessage,
  NBox,
  ResponsiveNBox,
  ProfileListing,
} from './Misc';


const CommunityPage = ({multiPanel, toggleSignUpModal, initialWidth}) => {

  const [dataLoaded, setDataLoaded] = useState(!!Sefaria.community);

  const sidebarModules = [
    {type: "JoinTheConversation"},
    {type: dataLoaded ? "WhoToFollow" : null, props: {toggleSignUpModal}},
    {type: "Promo"},
    {type: "ExploreCollections"},
    {type: "SupportSefaria", props: {blue: true}},
    {type: "StayConnected"},
  ];

  useEffect(() => {
    if (!dataLoaded) {
      Sefaria.getBackgroundData().then(() => { setDataLoaded(true); });
    }
  }, []);

  let featuredContent;
  if (dataLoaded) {
    const {parashah, calendar, discover, featured} = Sefaria.community;
    const sheets = [parashah, calendar, discover, featured].filter(x => !!x)
      .map(x => x.sheet ? <FeaturedSheet sheet={x.sheet} key={x.sheet.id} toggleSignUpModal={toggleSignUpModal} trackClicks={true}/> : null);
    featuredContent = (
      <>
        <ResponsiveNBox content={sheets.slice(0,2)} stretch={true} initialWidth={initialWidth} />
        {sheets.slice(2).map(sheet => <NBox content={[sheet]} n={1} key={sheet.id} /> )}
      </>
    );
  } else {
    featuredContent = <LoadingMessage />
  }
  console.log("load data from recentlyPUblished component")
  return (
    <div className="readerNavMenu communityPage sans-serif" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner mainColumn">
            
            {/* <h1><InterfaceText>{Sefaria._("Today on Pecha")} </InterfaceText></h1>

            {featuredContent} */}
            
            <RecentlyPublished multiPanel={multiPanel} toggleSignUpModal={toggleSignUpModal} />

          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        <Footer />
      </div>
    </div>
  );
}
CommunityPage.propTypes = {
  toggleSignUpModal:  PropTypes.func.isRequired,
};


const RecentlyPublished = ({multiPanel, toggleSignUpModal}) => {
  // const options = Sefaria.interfaceLang === "hebrew" ? {"lang": "hebrew"} : {};
  const options =  {};
  // options["filtered"] = true;
  const pageSize = 10;
  const [nSheetsLoaded, setNSheetsLoded] = useState(0); // counting sheets loaded from the API, may be different than sheets displayed
  // Start with recent sheets in the cache, if any
  const [recentSheets, setRecentSheets] = useState(collapseSheets(Sefaria.sheets.publicSheets(0, pageSize, options)));

  // But also make an API call immeditately to check for updates
  useEffect(() => {
    loadMore();
  }, []);

  const loadMore = (e, until=pageSize) => {
    Sefaria.sheets.publicSheets(nSheetsLoaded, pageSize, options, true, (data) => {
      const collapsedSheets = collapseSheets(data);
      const newSheets = recentSheets ? recentSheets.concat(collapsedSheets) : collapsedSheets;
      setRecentSheets(newSheets);
      setNSheetsLoded(nSheetsLoaded + pageSize);
      if (collapsedSheets.length < until && collapsedSheets.length !== 0) {
        loadMore(null, until - collapsedSheets.length);
      }
    });
  };

  const recentSheetsContent = !recentSheets ? [<LoadingMessage />] :
          recentSheets.map(s => <FeaturedSheet sheet={s} showDate={true} toggleSignUpModal={toggleSignUpModal} />);
  const joinTheConversation = (
    <div className="navBlock">
      <Modules type={"JoinTheConversation"} props={{wide:multiPanel}} />
    </div>
  );
  if (recentSheets) {
    recentSheetsContent.splice(6, 0, joinTheConversation);
    recentSheetsContent.push(
      <a className="button small white loadMore" onClick={loadMore}>
        <InterfaceText>{ Sefaria._("common.load_more")}</InterfaceText>
      </a>
    );
  }
  return (
    <div className="recentlyPublished">            
      <h2><InterfaceText>{ Sefaria._("community.sheets.recently_published")}</InterfaceText></h2>
      <NBox content={recentSheetsContent} n={1} />
    </div>
  );
};


const collapseSheets = (sheets) => {
  // Collapses consecutive sheets with the same author
  if (!sheets) { return null; }

  return sheets.reduce((accum, sheet) => {
    if (!accum.length) {
      return [sheet];
    }
    const prev = accum[accum.length-1];
    if (prev.author === sheet.author) {
      prev.moreSheets = prev.moreSheets || [];
      prev.moreSheets.push(sheet);
    } else {
      accum.push(sheet);
    }
    return accum;
  }, []);
}

const FeaturedSheet = ({sheet, showDate, trackClicks, toggleSignUpModal}) => {
  if (!sheet) { return null; }
  const {heading, title, id, summary} = sheet;
  const uid = sheet.author || sheet.owner;
  const author = {
    uid,
    url: sheet.ownerProfileUrl,
    image: sheet.ownerImageUrl,
    name: sheet.ownerName,
    organization: sheet.ownerOrganization,
    is_followed: Sefaria._uid ? Sefaria.following.indexOf(uid) !== -1 : false,
    toggleSignUpModal: toggleSignUpModal,
  };

  const now = new Date();
  const published = new Date(sheet.published);
  const naturalPublished = Sefaria.util.naturalTime(published.getTime()/1000, {short:true});

  const trackClick = () => {
    Sefaria.track.event("Community Page Featured Click", title, `/sheets/${id}`);
  };

  return (
    <div className="featuredSheet navBlock">
      { heading ?
      <div className="featuredSheetHeading">
        <InterfaceText text={heading} />
      </div>
      : null}
      <a href={`/sheets/${id}`} className="navBlockTitle" onClick={trackClicks ? trackClick : null}>
        <InterfaceText>{title}</InterfaceText>
      </a>
      {summary ?
      <div className="navBlockDescription">
        <InterfaceText>{summary}</InterfaceText>
      </div>
      : null}
      <div className="featuredSheetBottom">
        <ProfileListing {...author} />
        {showDate ? <div className="featuredSheetDate">• {naturalPublished}</div> : null}
      </div>
    </div>
  );
};



export default CommunityPage;