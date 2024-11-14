import React from 'react';
import {TopicsSearchAutocomplete} from "./TopicLandingSearch";
export const TopicsLandingPage = ({openTopic}) => {
    return (<>
        <div>Hello, would you like a serving of topics salad?</div>
        <TopicsSearchAutocomplete openTopic={openTopic}/>
        </>
    );
};
