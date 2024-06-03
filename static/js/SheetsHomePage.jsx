import React  from 'react';
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

const SheetsHomePage = () => {
    return <div>
                <SheetsHeroBanner/>
           </div>
}
export default SheetsHomePage;