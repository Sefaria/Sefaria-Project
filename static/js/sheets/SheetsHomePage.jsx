import React  from 'react';
import PropTypes from 'prop-types';
import {NavSidebar, SidebarFooter} from "../NavSidebar";
import {SheetsTopicsCalendar, SheetsTopicsTOC} from "./SheetsHomePageTopicsTOC";
const SheetsHeroBanner = ({title, message, videoOptions, posterImg}) => {
    /*
     * `title` and `message` are shown on top of the video. `posterImg` is shown while video is downloaded,
     *  and `videoOptions` is an array of videos that the browser selects from.
     */
    return <div id="aboutCover">
            <video id="aboutVideo" poster={posterImg} preload="auto" autoPlay={true} loop muted>
                {videoOptions.map(video => {
                    return <source src={video}/>
                })}
            </video>
            <div className="overlayTextOnSheetsHero">
                <div id="title">{title}</div>
                <div id="message">{message}</div>
            </div>
        </div>;
}

SheetsHeroBanner.propTypes = {
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  videoOptions: PropTypes.arrayOf(PropTypes.string).isRequired,
  posterImg: PropTypes.string.isRequired
};

const SheetsHomePageSidebar = ({includeFooter = false}) => {
    const sidebarModules = [
    {type: "WhatIsSefariaVoices"},
    {type: "CreateASheet"},
  ];
    return <NavSidebar sidebarModules={sidebarModules} includeFooter={includeFooter} />
}

SheetsHomePageSidebar.propTypes = {
  includeFooter: PropTypes.bool
};



const SheetsHomePage = ({setNavTopic, setTopic, multiPanel}) => {

  const sheetsHeroBanner = <SheetsHeroBanner title={Sefaria._("Community-Powered Jewish Learning")}
                                  message={Sefaria._("Share. Discover. Join the Conversation.")}
                                  videoOptions={["/static/img/home-video.webm", "/static/img/home-video.mp4"]}
                                  posterImg="/static/img/home-video.jpg"/>;                             
  const sheetsTopicsCalendar = <SheetsTopicsCalendar handleClick={setTopic}/>;
  const sheetsTopicsTOC = <SheetsTopicsTOC handleClick={setNavTopic}/>;

  return (
    <div className="readerNavMenu sheetsHomepage" key="0">
      <div className="content">
        {sheetsHeroBanner}
        <div className="sidebarLayout">
          <div className="contentInner">
            <div className="sheetsTopics">
              {multiPanel ? (
                <>
                  {sheetsTopicsCalendar}
                  {sheetsTopicsTOC}
                </>
              ) : (
                sheetsTopicsCalendar
              )}
            </div>
          </div>
          <SheetsHomePageSidebar includeFooter={multiPanel} />
          {!multiPanel && (
            <>
              {sheetsTopicsTOC}
              <div className="sans-serif"><SidebarFooter /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

SheetsHomePage.propTypes = {
  setNavTopic: PropTypes.func.isRequired,
  setTopic: PropTypes.func.isRequired,
  multiPanel: PropTypes.bool.isRequired
};

export { SheetsHomePage };
