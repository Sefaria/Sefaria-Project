import React, {useState, useEffect} from 'react';
import Sefaria from "../sefaria/sefaria";
import {ImageWithAltText, InterfaceText, SimpleLinkedBlock} from "../Misc";


export const FeaturedTopic = () => {
    let [topic, setTopic] = useState(null);
    useEffect(() => {
        Sefaria.getFeaturedTopic().then(result => setTopic(result.topic));
    }, []);

    if (!topic) { return null; }

    return (
        <div className="featuredTopic">
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
                            <SimpleLinkedBlock url={`/topics/${topic.slug}`}  en="Go to topic >" he={Sefaria._("Go to topic >")} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
