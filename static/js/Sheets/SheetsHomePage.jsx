import React  from 'react';
import {InterfaceText, ResponsiveNBox} from "../Misc";
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
const SheetsHeroBanner = () => {
    return <div id="aboutCover">
            <video id="aboutVideo" poster="/static/img/home-video.jpg" preload="auto" autoPlay="true" loop muted>
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



const SheetsHomePage = () => {
  return <div className="readerNavMenu sheets" key="0">
            <div className="content">
                <SheetsHeroBanner/>
                <div className="sidebarLayout">
                    <div className="contentInner">
                        <SheetsSidebar/>
                    </div>
                </div>
                <Footer/>
            </div>
        </div>
}
export default SheetsHomePage;