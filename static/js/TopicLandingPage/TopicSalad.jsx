import React from 'react';
import {useEffect, useState} from "react";
import {WordSalad} from "../WordSalad";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";
import {RainbowLine} from "../RainbowLine";
import {RowedWordSalad} from "../RowedWordSalad";


export const TopicSalad = () => {

    const [salad, setSalad] = useState([]);

    const isMultiPanel = Sefaria.multiPanel;

    const renderSaladItem = (item) => {
        return(<a href={`/topics/${item.slug}`} className="topic-salad-item">
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
    };

    useEffect(() => {
        loadSalad();
    }, []);

    return (
    <>
    <RainbowLine rainbowClassname={"topic-landing-upper-rainbow"}/>
      <div className='topic-salad'>
          {isMultiPanel ? <WordSalad renderItem={renderSaladItem}
                       numLines={5}
                       salad={salad}/>
              :
              <RowedWordSalad renderItem={renderSaladItem}
                              salad={salad}/>}
      </div>
    <RainbowLine rainbowClassname={"topic-landing-lower-rainbow"}/>
    </>

  );
};