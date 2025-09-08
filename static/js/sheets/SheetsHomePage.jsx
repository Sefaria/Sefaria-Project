import React  from 'react';
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

const SheetsHomePageSidebar = ({includeFooter = false}) => {
    const sidebarModules = [
    {type: "CreateASheet"},
    {type: "WhatIsASourceSheet"},
  ];
    return <NavSidebar sidebarModules={sidebarModules} includeFooter={includeFooter} />
}



const SheetsHomePage = ({setNavTopic, setTopic, multiPanel}) => {
  const sheetsHeroBanner = <SheetsHeroBanner title="Join the Torah Conversation"
                                  message="Create, share, and discover source sheets."
                                  videoOptions={["/static/img/home-video.webm", "/static/img/home-video.mp4"]}
                                  posterImg="/static/img/home-video.jpg"/>;
  const sheetsTopicsCalendar = <SheetsTopicsCalendar handleClick={setTopic}/>;
  const sheetsTopicsTOC = <SheetsTopicsTOC handleClick={setNavTopic}/>;

  if (multiPanel) {
    return <SheetsHomePageDesktop sheetsHeroBanner={sheetsHeroBanner} 
                                  sheetsTopicsCalendar={sheetsTopicsCalendar} 
                                  sheetsTopicsTOC={sheetsTopicsTOC} />;
  }
  else {
    return <SheetsHomePageMobile sheetsHeroBanner={sheetsHeroBanner} 
                                 sheetsTopicsCalendar={sheetsTopicsCalendar} 
                                 sheetsTopicsTOC={sheetsTopicsTOC} />;
  }     
}
 
const SheetsHomePageMobile = ({sheetsHeroBanner, sheetsTopicsCalendar, sheetsTopicsTOC}) => {
  return <div className="readerNavMenu sheetsHomepage" key="0">
            <div className="content">
                {sheetsHeroBanner}
                <div className="sidebarLayout">
                    <div className="contentInner">
                        <div className="sheetsTopics">
                            {sheetsTopicsCalendar}
                        </div>
                    </div>
                    <SheetsHomePageSidebar includeFooter={false} />
                    {sheetsTopicsTOC}
                    <div className="sans-serif"><SidebarFooter /></div>
                </div>
            </div>
        </div>
}

const SheetsHomePageDesktop = ({sheetsHeroBanner, sheetsTopicsCalendar, sheetsTopicsTOC}) => {
    return <div className="readerNavMenu sheetsHomepage" key="0">
              <div className="content">
                  {sheetsHeroBanner}
                  <div className="sidebarLayout">
                      <div className="contentInner">
                          <div className="sheetsTopics">
                              {sheetsTopicsTOC}
                              {sheetsTopicsCalendar}
                          </div>
                      </div>
                      <SheetsHomePageSidebar includeFooter={true} />
                  </div>
              </div>
          </div>
  }
export { SheetsHomePage };
