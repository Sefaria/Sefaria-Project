import React from 'react';
import {useEffect, useState} from "react";
import {WordSalad} from "../WordSalad";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";
import {RainbowLine} from "../RainbowLine";
import {RowedWordSalad} from "../RowedWordSalad";


export const TopicSalad = () => {

    const [salad, setSalad] = useState([]);
    const [animatedLoadingRainbow, setAnimatedLoadingRainbow] = useState(true);

    const isMultiPanel = Sefaria.multiPanel;

    const renderSaladItem = (item) => {
        return(<a href={`/topics/${item.slug}`} className="topic-salad-item"
                  data-anl-link_type="topic"
                  data-anl-text={item.text.en}
                  data-anl-event="navto_topic:click"
                >
                <InterfaceText text={item.text}/>
                </a>)
    }

    const fetchRandomSaladItems = async () => {
        const poolName = Sefaria.getLangSpecificTopicPoolName('general');
        const topics = await Sefaria.getTopicsByPool(poolName, 50);
        const saladItems = topics.map(topic=>({slug: topic.slug, text: topic.primaryTitle}));
        return saladItems;
    }

    const loadSalad = async () => {
        const saladItems = await fetchRandomSaladItems();
        setSalad(saladItems);
        setAnimatedLoadingRainbow(false)
    };

    useEffect(() => {
        loadSalad();
    }, []);

    return (
    <span  data-anl-feature_name="Topic Salad">
    <RainbowLine animated={animatedLoadingRainbow} rainbowClassname={"topic-landing-upper-rainbow"}/>
      <div className='topic-salad'>
          {isMultiPanel ? <WordSalad renderItem={renderSaladItem}
                            numLines={5}
                            salad={salad}
                            addBullets={true}/>
              :
              <RowedWordSalad renderItem={renderSaladItem}
                              salad={salad}/>}
      </div>
    {!animatedLoadingRainbow && <RainbowLine rainbowClassname={"topic-landing-lower-rainbow"}/>}
    </span>

  );
};