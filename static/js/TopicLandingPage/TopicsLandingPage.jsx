import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";


export const TopicsLandingPage = ({openTopic}) => {
    return (<>
        <div>Hello, would you like a serving of topics salad?</div>
        <TopicLandingSearch openTopic={openTopic} numOfTopics={5000}/>
        </>
    )
};
