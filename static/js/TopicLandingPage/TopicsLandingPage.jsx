import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
import {TopicSalad} from "./TopicSalad";
import {RainbowLine} from "../RainbowLine";
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {TopicLandingParasha} from "./TopicLandingParsha";


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
                        {/*<TopicLandingCalendar*/}
                        {/*    header={{en: "This Week’s Torah Portion"}}*/}
                        {/*    title={{en:"Vayigash"}}*/}
                        {/*    description={{en:"Vayigash (“He Approached”) opens as Judah pleads with Joseph not to keep Benjamin as a prisoner. Joseph reveals his true identity to his brothers, crying and kissing them. The brothers bring Jacob from Canaan to Egypt, and Jacob and his children settle in Goshen. The portion ends as Joseph buys most of Egypt’s land in exchange for food."}}*/}
                        {/*    link={"/topics/parashat-vayigash"}/>*/}
                        <TopicLandingParasha/>

                    </div>
                    <NavSidebar sidebarModules={sidebarModules} />
                </div>
                <Footer />
            </div>
        </div>
    )
};
