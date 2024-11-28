import React, {useState} from 'react';
import Sefaria from "../sefaria/sefaria";

export const TopicOfTheDay = () => {
    let [topic, setTopic] = useState(null);
    Sefaria.getTopicOfTheDay().then(result => setTopic(result.topic));
    return (<>
        <div>Topic of the day</div>
        <div>{topic?.slug}</div>
    </>);
};
