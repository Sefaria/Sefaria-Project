import React  from 'react';
import SheetsTopics from "./SheetsTopics";
import Footer from "./Footer";
import {InterfaceText, ResponsiveNBox} from "./Misc";
import {NavSidebar} from "./NavSidebar";
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
    return "Sidebar Placeholder"
}
const SheetsHomePage = () => {
    return <div className="readerNavMenu" key="0">
            <div className="content">
                <SheetsHeroBanner/>
                <div className="sidebarLayout">
                    <div className="contentInner">
                        <SheetsTopics/>
                    </div>
                    <SheetsSidebar/>
                    {/*<NavSidebar modules={sidebarModules}/>*/}
                </div>
                <Footer/>
            </div>
        </div>
}
export default SheetsHomePage;