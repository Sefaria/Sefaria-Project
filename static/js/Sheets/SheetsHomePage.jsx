import React  from 'react';
import {InterfaceText, ResponsiveNBox} from "../Misc";
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
import {Button} from "./GenericComponents";
import {SheetsTopicsCalendar, SheetsTopicsTOC} from "./SheetsTopics";
const GetStartedButton = ({href}) => {
    return <Button classes={{getStartedSheets: 1}} href={href}>Get Started</Button>
}
const CreateSheetsButton = () => {
  const img = <img src="/static/icons/new-sheet-black.svg" alt="make a sheet icon" id="sheetsButton"/>;
  return <Button img={img} classes={{small: 1}} href="/sheets/new">Create</Button>
}
const SheetsHeroBanner = () => {
    return <div id="aboutCover">
            <video id="aboutVideo" poster="/static/img/home-video.jpg" preload="auto" autoPlay={true} loop muted>
                <source src="/static/img/home-video.webm" type="video/webm"/>
                <source src="/static/img/home-video.mp4" type="video/mp4"/>
                Video of sofer writing letters of the Torah
            </video>
            <div className="overlayTextOnSheetsHero">
                <div id="title">Join the Torah Conversation</div>
                <div id="message">Create, share, and discover source sheets.</div>
            </div>
        </div>;
}

const SheetsSidebar = () => {
    const sidebarModules = [
    {type: "CreateASheet"},
    {type: "WhatIsASourceSheet"},
  ];
    return <NavSidebar modules={sidebarModules} />
}



const SheetsHomePage = ({setNavTopic, multiPanel, initialWidth}) => {
  const sheetsTopicsTOC = <SheetsTopicsTOC setNavTopic={setNavTopic} initialWidth={initialWidth}/>;
  return <div className="readerNavMenu sheets" key="0">
            <div className="content">
                <SheetsHeroBanner/>
                <div className="sidebarLayout">
                    <div className="sheetsTopics">
                        <SheetsTopicsCalendar setNavTopic={setNavTopic}/>
                        {multiPanel && sheetsTopicsTOC}
                    </div>
                    <SheetsSidebar/>
                    {!multiPanel && sheetsTopicsTOC}
                </div>
                <Footer/>
            </div>
        </div>
}
export { SheetsHomePage, GetStartedButton, CreateSheetsButton };