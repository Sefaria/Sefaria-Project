import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
import {TopicSalad} from "./TopicSalad";
import {RainbowLine} from "../RainbowLine";
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {TopicLandingParasha} from "./TopicLandingParsha";
import Search from "../sefaria/search";
import {TopicLandingSeasonal} from "./TopicLandingSeasonal";


export const TopicsLandingPage = ({openTopic}) => {
    const sidebarModules = [
        {type: 'TrendingTopics'},
    ];
    return (
        <div className="readerNavMenu" key="0">
            <div className="content">
                <div className="sidebarLayout">
                    <div className="contentInner mainColumn topic-landing-page-content">
                        <TopicLandingSearch openTopic={openTopic} numOfTopics={5000}/>
                        <TopicSalad/>
                    <div className="topic-landing-temporal">
                        <TopicLandingParasha/>
                        <TopicLandingSeasonal/>
                    </div>
                    </div>
                    <NavSidebar sidebarModules={sidebarModules} />
                </div>
                <Footer />
            </div>
        </div>
    )
};
