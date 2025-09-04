import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {NavSidebar} from "../NavSidebar";
import Footer from "../Footer";
import {FeaturedTopic} from "./FeaturedTopic";
import {TopicSalad} from "./TopicSalad";
import {TopicLandingParasha} from "./TopicLandingParasha";
import {TopicLandingSeasonal} from "./TopicLandingSeasonal";
import {TopicLandingNewsletter} from "./TopicLandingNewsletter";
import {InterfaceText} from "../Misc";
import Sefaria from "../sefaria/sefaria";
import {RandomTopicCardWithDescriptionRow} from "./RandomTopicCardWithDescriptionRow";


export const TopicsLandingPage = ({openTopic}) => {
    const sidebarModules = [
        {type: "TopicLandingTopicCatList"},
        {type: "TrendingTopics"},
        {type: "AZTopicsLink"},
    ];
    const pageTitle = "Explore by Topic"
    return (
        <div className="readerNavMenu topicLandingPanel" key="0"
             data-anl-project="topics"
             data-anl-panel_name={pageTitle}
             data-anl-panel_type="Topic Landing">
            <div className="content">
                <div className="sidebarLayout">
                    <div className="contentInner mainColumn topic-landing-page-content">
                        <h1 className="topic-landing-header">
                            <InterfaceText>{pageTitle}</InterfaceText>
                        </h1>
                        <div className="topic-landing-section first-section">
                            <TopicLandingSearch openTopic={openTopic} numOfTopics={Sefaria.numLibraryTopics}/>
                        </div>
                        <div className="topic-landing-section following-search-section">
                            <TopicSalad/>
                        </div>
                        <div className="topic-landing-section">
                            <FeaturedTopic />
                        </div>
                        <div className="topic-landing-section">
                            <TopicLandingNewsletter />
                        </div>
                        <div className="topic-landing-section">
                            <RandomTopicCardWithDescriptionRow/>
                        </div>
                        <div className="topic-landing-section topic-landing-temporal">
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
