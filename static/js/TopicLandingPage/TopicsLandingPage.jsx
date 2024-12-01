import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {WordSalad} from "./WordSalad";

const renderSaladItem = (item) => {
    return <span>{item} </span>
}

export const TopicsLandingPage = ({openTopic}) => {
    return (<div className='topic-landing-page-wrapper'>
        <div>Hello, would you like a serving of topics salad?</div>
        <TopicLandingSearch openTopic={openTopic} numOfTopics={5000}/>
            <WordSalad renderItem={renderSaladItem}
                       numLines={3}
                       salad={['apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banandda', 'cherry', 'ddddddate', 'ddddddddddddd', 'apple', 'banaffffna', 'cheffffffrry', 'date', 'eldefffrberry', 'applfffe', 'ffbanana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry','banaffffna', 'cheffffffrry', 'date', 'eldefffrberry', 'applfffe', 'ffbanana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'banaffffna', 'cheffffffrry', 'date', 'eldefffrberry', 'applfffe', 'ffbanana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'banaffffna', 'cheffffffrry', 'date', 'eldefffrberry', 'applfffe', 'ffbanana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'banaffffna', 'cheffffffrry', 'date', 'eldefffrberry', 'applfffe', 'ffbanana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'banaffffna', 'cheffffffrry', 'date', 'eldefffrberry', 'applfffe', 'ffbanana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry', 'apple', 'banana', 'cherry', 'date', 'elderberry']}/>
        </div>
    )
};
