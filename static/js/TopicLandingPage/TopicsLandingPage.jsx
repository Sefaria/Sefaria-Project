import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
import {TopicSalad} from "./TopicSalad";
import {RainbowLine} from "../RainbowLine";


export const TopicsLandingPage = ({openTopic}) => {
    const sidebarModules = [
        {type: 'TrendingTopics'},
    ];
    return (
        <div className="readerNavMenu" key="0">
            <div className="content">
                <div className="sidebarLayout">
                    <div className="contentInner mainColumn topic-lading-page-content">
                        <TopicLandingSearch openTopic={openTopic} numOfTopics={5000}/>
                        <RainbowLine rainbowClassname={"topic-landing-upper-rainbow"}/>
                        <TopicSalad/>
                        <RainbowLine rainbowClassname={"topic-landing-lower-rainbow"}/>
                    </div>
                    <NavSidebar sidebarModules={sidebarModules} />
                </div>
                <Footer />
            </div>
        </div>
    )
};
