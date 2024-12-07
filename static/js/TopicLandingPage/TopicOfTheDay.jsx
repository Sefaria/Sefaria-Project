import React, {useState, useEffect} from 'react';
import Sefaria from "../sefaria/sefaria";
import {ImageWithAltText, InterfaceText, SimpleLinkedBlock} from "../Misc";


export const TopicOfTheDay = () => {
    let [topic, setTopic] = useState(null);
    useEffect(() => {
        Sefaria.getTopicOfTheDay().then(result => setTopic(result.topic));
    }, []);

    if (!topic) { return null; }
    return (
        <div className="topicOfTheDay">
            <h1><InterfaceText>Featured Topic</InterfaceText></h1>
            <div className="topicOfTheDayContent">
                <ImageWithAltText photoLink={topic.image.image_uri} altText={topic.image.image_caption}/>
                <div className="topicOfTheDayText">
                    <h3><InterfaceText text={topic.primaryTitle} /></h3>
                    <div className="topicDescription systemText">
                        <InterfaceText markdown={topic.description}/>
                        <div className="topicOfTheDayGoToLink">
                            <SimpleLinkedBlock url={`/topics/${topic.slug}`}  en="Go to topic >" he={Sefaria._("Go to topic >")} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
