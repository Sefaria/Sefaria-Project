import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {TopicOfTheDay} from "./TopicOfTheDay";


export const TopicsLandingPage = ({openTopic}) => {
    return (
        <div className='topic-landing-page-wrapper'>
            <div>Hello, would you like a serving of topics salad?</div>
            <TopicLandingSearch openTopic={openTopic} numOfTopics={5000}/>
            <TopicOfTheDay />
        </div>
    )
};
