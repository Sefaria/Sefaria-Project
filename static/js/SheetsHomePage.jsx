import React  from 'react';
import SheetsTopics from "./SheetsTopics";
const SheetsHeroBanner = () => {
    return <div id="aboutCover">
            <video id="aboutVideo" poster="/static/img/home-video.jpg" preload="auto" autoPlay="true" loop muted>
                <source src="/static/img/home-video.webm" type="video/webm"/>
                <source src="/static/img/home-video.mp4" type="video/mp4"/>
                Video of sofer writing letters of the Torah
            </video>
        </div>;
}

const SheetsSidebar = () => {
    return "Sidebar Placeholder"
}
const SheetsHomePage = () => {
    return <div>
                <SheetsHeroBanner/>
                <div id="sheetsHomePage">
                    <SheetsTopics/>
                    <SheetsSidebar/>
                </div>
           </div>
}
export default SheetsHomePage;