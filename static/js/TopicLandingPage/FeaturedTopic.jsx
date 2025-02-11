import React, {useState, useEffect} from 'react';
import Sefaria from "../sefaria/sefaria";
import {ImageWithAltText, InterfaceText, SimpleLinkedBlock} from "../Misc";


export const FeaturedTopic = () => {
    let [topic, setTopic] = useState(null);
    useEffect(() => {
        Sefaria.getFeaturedTopic().then(result => setTopic(result.topic));
    }, []);

    if (!topic) { return null; }
    const topicNavPrompt = "Go to topic ›"

    return (
        <div className="featuredTopic" data-anl-feature_name="Featured Topic">
            <h1><InterfaceText>Featured Topic</InterfaceText></h1>
            <div className="featuredTopicContent">
                <div className="featuredTopicImgWrapper">
                    <ImageWithAltText photoLink={topic.secondary_image_uri} altText={topic?.image?.image_caption}/>
                </div>
                <div className="featuredTopicText">
                    <h3><InterfaceText text={topic.primaryTitle} /></h3>
                    <div className="topicDescription systemText">
                        <InterfaceText markdown={topic.description}/>
                        <div className="featuredTopicGoToLink">
                            <br/>
                            <span
                              data-anl-link_type="link"
                              data-anl-text={topicNavPrompt}
                              data-anl-event="navto_topic:click">
                            <SimpleLinkedBlock url={`/topics/${topic.slug}`}  en={topicNavPrompt} he={Sefaria._(topicNavPrompt)} />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
