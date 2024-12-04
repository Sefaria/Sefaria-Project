import React from 'react';
import {useEffect, useState} from "react";
import {WordSalad} from "../WordSalad";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";


export const TopicSalad = () => {

    const [salad, setSalad] = useState([]);
    const lang = Sefaria.interfaceLang == 'hebrew' ? 'he' : 'en';

    const renderSaladItem = (item) => {
        return(<a href={`/topics/${item.slug}`} className="topic-salad-item">
                <InterfaceText text={{en: item.text, he: item.text}}/>
                </a>)
    }

    const fetchRandomSaladItems = async () => {
        const poolName = Sefaria.getLangSpecificTopicPoolName('general', lang);
        const topics = await Sefaria.getTopicsByPool(poolName, 50);
        const saladItems = topics.map(topic=>({slug: topic.slug, text: topic.primaryTitle[lang]}))
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
      <div className='topic-salad'>
                  <WordSalad renderItem={renderSaladItem}
                       numLines={5}
                       salad={salad}/>
      </div>
  );
};