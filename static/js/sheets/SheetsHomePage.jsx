import React  from 'react';
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
import {SheetsTopicsCalendar, SheetsTopicsTOC} from "./SheetsTopics";
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

const SheetsSidebar = () => {
    const sidebarModules = [
    {type: "CreateASheet"},
    {type: "WhatIsASourceSheet"},
  ];
    return <NavSidebar sidebarModules={sidebarModules} />
}



const SheetsHomePage = ({setNavTopic, setTopic, multiPanel}) => {
  const handleClick = (func) => (e, slug, en, he) => {
      e.preventDefault();
      func(slug, {en, he});  // setTopic or setNavTopic
  }
  const sheetsTopicsTOC = <SheetsTopicsTOC handleClick={handleClick(setNavTopic)}/>;
  return <div className="readerNavMenu sheetsHomepage" key="0">
            <div className="content">
                <SheetsHeroBanner title="Join the Torah Conversation"
                                  message="Create, share, and discover source sheets."
                                  videoOptions={["/static/img/home-video.webm", "/static/img/home-video.mp4"]}
                                  posterImg="/static/img/home-video.jpg"
                />
                <div className="sidebarLayout">
                    <div className="contentInner">
                        <div className="sheetsTopics">
                            <SheetsTopicsCalendar handleClick={handleClick(setTopic)}/>
                            {multiPanel && sheetsTopicsTOC}
                        </div>
                    </div>
                    <SheetsSidebar/>
                    {!multiPanel && sheetsTopicsTOC}
                </div>
                <Footer/>
            </div>
        </div>
}
export { SheetsHomePage };