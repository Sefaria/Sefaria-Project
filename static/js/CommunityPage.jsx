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

  const sidebarModules = [
    {type: "JoinTheConversation"},
    {type: "WhoToFollow", props: {toggleSignUpModal}},
    {type: "ExploreCollections"},
    {type: "SupportSefaria", props: {blue: true}},
    {type: "StayConnected"},
  ];

  const {parashah, calendar, discover, featured} = Sefaria.community;
  const sheets = [parashah, calendar, discover, featured].filter(x => !!x)
                    .map(x => <FeaturedSheet sheet={x.sheet} toggleSignUpModal={toggleSignUpModal} />);

  return (
    <div className="readerNavMenu communityPage sans-serif" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner mainColumn">
            
            <h1><InterfaceText>Today on Sefaria</InterfaceText></h1>

            <ResponsiveNBox content={sheets.slice(0,2)} stretch={true} initialWidth={initialWidth} />

            {sheets.slice(2).map(sheet => <NBox content={[sheet]} n={1} key={sheet.id} /> )}
            
            <RecenltyPublished multiPanel={multiPanel} toggleSignUpModal={toggleSignUpModal} />

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


const RecenltyPublished = ({multiPanel, toggleSignUpModal}) => {
  const options = Sefaria.interfaceLang === "hebrew" ? {"lang": "hebrew"} : {};
  const pageSize = 12;
  const [nSheetsLoaded, setNSheetsLoded] = useState(pageSize);
  // Start with recent sheets in the cache, if any
  const [recentSheets, setRecentSheets] = useState(Sefaria.sheets.publicSheets(0, pageSize, options));

  // But also make an API call immeditately to check for updates
  useEffect(() => {
    Sefaria.sheets.publicSheets(0, pageSize, options, true, (data) => setRecentSheets(data));
  }, []);

  const loadMore = () => {
    Sefaria.sheets.publicSheets(nSheetsLoaded, pageSize, options, true, (data) => {
      setRecentSheets(recentSheets.concat(data));
      setNSheetsLoded(nSheetsLoaded + pageSize);
    });
  };

  const recentSheetsContent = !recentSheets ? [<LoadingMessage />] :
          recentSheets.map(s => <FeaturedSheet sheet={s} toggleSignUpModal={toggleSignUpModal} />);
  const joinTheConversation = (
    <div className="navBlock">
      <Modules type={"JoinTheConversation"} props={{wide:multiPanel}} />
    </div>
  );
  if (recentSheets) {
    recentSheetsContent.splice(6, 0, joinTheConversation);
    recentSheetsContent.push(
      <a className="button small white loadMore" onClick={loadMore}>
        <InterfaceText>Load More</InterfaceText>
      </a>
    );
  }
  return (
    <div className="recentlyPublished">            
      <h2><InterfaceText>Recently Published</InterfaceText></h2>
      <NBox content={recentSheetsContent} n={1} />
    </div>
  );
};


const FeaturedSheet = ({sheet, toggleSignUpModal}) => {
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

  return (
    <div className="featuredSheet navBlock">
      { heading ?
      <div className="featuredSheetHeading">
        <InterfaceText text={heading} />
      </div>
      : null}
      <a href={`/sheets/${id}`} className="navBlockTitle">
        <InterfaceText>{title}</InterfaceText>
      </a>
      {summary ?
      <div className="navBlockDescription">
        <InterfaceText>{summary}</InterfaceText>
      </div>
      : null}
      <ProfileListing {...author} />
    </div>
  );
};



/*


            {parashah ?
            <HomepageRow 
              title="The Torah Portion"
              aboutContent={parashah.topic}
              sheet={parashah.sheet}
              AboutComponent={AboutParashah} 
              initialWidth={initialWidth} />
            : null }

            {calendar ?
            <HomepageRow 
              title="The Jewish Calendar"
              aboutContent={calendar.topic}
              sheet={calendar.sheet}
              AboutComponent={AboutCalendar} 
              initialWidth={initialWidth} />
            : null }

            {discover ?
            <HomepageRow 
              biTitles={{
                en: "Discover " + discover.about.category.en,
                he: Sefaria._("Discover ") + discover.about.category.he
              }}
              aboutContent={discover.about}
              sheet={discover.sheet}
              AboutComponent={AboutDiscover} 
              initialWidth={initialWidth} />
            : null }

            {featured ?
            <HomepageRow 
              title={featured.heading}
              sheet={featured.sheet}
              initialWidth={initialWidth} />
            : null }


const HomepageRow = ({title, biTitles, aboutContent, sheet, AboutComponent, initialWidth}) => {
  const blocks = [];
  if (aboutContent) {
    blocks.push(<AboutComponent content={aboutContent} />);
  }
  if (sheet) {
    blocks.push(<FeaturedSheet sheet={sheet} />);
  }

  return (
    <div>
      <h2>
        {biTitles ? 
        <InterfaceText text={biTitles} />
        : <InterfaceText>{title}</InterfaceText>}
      </h2>

      {blocks.length > 1 ?
      <ResponsiveNBox content={blocks} initialWidth={initialWidth} />
      : <NBox content={blocks} n={1} /> }
    </div>
  );
};


const AboutParashah = ({content}) => {
  if (!content) { return null; }
  const {primaryTitle, description, slug, ref} = content;
  const title = {
    en: primaryTitle.en.replace("Parashat ", ""),
    he: primaryTitle.he.replace("פרשת ", ""),
  }
  const style = {"borderColor": Sefaria.palette.categoryColor("Tanakh")};
  return (
    <div className="navBlock withColorLine" style={style}>
      <a href={`/topics/${slug}`} className="navBlockTitle serif">
        <InterfaceText text={title} />
      </a>       
      <div className="navBlockDescription">
        <InterfaceText text={description} />
      </div>
      <div className="readingLinks">
        <div className="readingLinksHeader">
          <InterfaceText context="AboutParashah">Torah Reading</InterfaceText>
        </div>
        <div className="calendarRef">
          <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
          <a href={`/${ref.url}`} className="serif">
            <InterfaceText text={ref} />
          </a> 
        </div>
      </div>
    </div>
  )
};


const AboutCalendar = ({content}) => {
  if (!content) { return null; }
  const {primaryTitle, description, slug, date, readings} = content;

  return (
    <div className="navBlock" >
      <a href={`/topics/${slug}`} className="navBlockTitle">
        <InterfaceText text={primaryTitle} />
      </a>
      <div className="calendarDate">
        <InterfaceText>{date}</InterfaceText>
      </div>
      <div className="navBlockDescription">
        <InterfaceText text={description} />
      </div>
      {!readings ? null :
      <div className="readingLinks">
        <div className="readingLinksHeader">
          <InterfaceText>Readings for</InterfaceText>&nbsp;<InterfaceText text={primaryTitle} />
        </div>
        {readings.map(ref => (
          <div className="calendarRef" key={ref.url}>
            <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
            <a href={`/${ref.url}`} className="serif">
              <InterfaceText text={ref} />
           </a> 
          </div>)
        )}
      </div> }
    </div>
  )
};


const AboutDiscover = ({content}) => {
  if (!content) { return null; }
  const {title, description, ref} = content;
  const cat   = Sefaria.refCategories(ref.url)[0]; 
  const style = {"borderColor": Sefaria.palette.categoryColor(cat)};

  return (
    <div className="navBlock withColorLine" style={style}>
      <a href={`/topics/${ref.url}`} className="navBlockTitle">
        <InterfaceText>{title}</InterfaceText>
      </a>
      <div className="navBlockDescription">
        <InterfaceText>{description}</InterfaceText>
      </div>
      <div className="readingLinks">
        <div className="readingLinksHeader">
          <InterfaceText>Readings</InterfaceText>
        </div>
          <div className="calendarRef" key={ref.url}>
            <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
            <a href={`/${ref.url}`} className="serif">
              <InterfaceText text={ref} />
           </a> 
          </div>
      </div>
    </div>
  )
};
*/


export default CommunityPage;