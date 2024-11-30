import React, {useState} from 'react';
import Sefaria from "../sefaria/sefaria";
import {ImageWithAltText, InterfaceText} from "../Misc";

export const TopicOfTheDay = () => {
    let [topic, setTopic] = useState(null);
    Sefaria.getTopicOfTheDay().then(result => setTopic(result.topic));
    console.log("topic", topic)
    if (!topic) { return null; }
    return (
        <div className="topicOfTheDay">
            <h1><InterfaceText>Topic of the Day</InterfaceText></h1>
            <div className="topicOfTheDayContent">
                <ImageWithAltText photoLink={topic.image.image_uri} altText={topic.image.image_caption}/>
                <div className="topicOfTheDayText">
                    <h3><InterfaceText text={topic.primaryTitle} /></h3>
                    <InterfaceText text={topic.description} />
                </div>
            </div>
        </div>
    );
};
