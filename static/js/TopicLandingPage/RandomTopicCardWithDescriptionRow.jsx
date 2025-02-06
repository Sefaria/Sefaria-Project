import React from 'react';
import {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";
import {Card} from "../common/Card";


export const RandomTopicCardWithDescriptionRow = () => {
    const isMultiPanel = Sefaria.multiPanel;
    const numTopics = isMultiPanel ? 3 : 10;
    const [deck, setDeck] = useState([]);

    const fetchRandomTopicDeck = async () => {
        const poolName = Sefaria.getLangSpecificTopicPoolName('general');
        const topics = await Sefaria.getTopicsByPool(poolName, Math.pow(numTopics, 3));
        const lang = Sefaria.interfaceLang == "hebrew"? 'he' : 'en';
        const deck = topics
          .filter(topic => topic.description?.[lang])
          .slice(0, numTopics)
          .map(topic => ({
            slug: topic.slug,
            title: topic.primaryTitle,
            description: topic.description
          }));
        return deck;
    }

    const loadDeck = async () => {
        const deck = await fetchRandomTopicDeck();
        setDeck(deck);
    };

    useEffect(() => {
        loadDeck();
    }, []);

    return (
    <>
      <div className='topic-card-with-description-row'>
          {deck.map(topic=><div className='topic-card-with-description'>
              <Card
                  cardTitleHref={`topics/${topic.slug}`}
                  cardTitle={topic.title}
                  cardText={topic.description}
                  bottomLinkText = {{en: `Explore ${topic.title?.en} ›`, he:`${Sefaria._("Explore")} ${topic.title?.he} ›`}}
                  bottomLinkUrl = {`topics/${topic.slug}`}/>
            </div>)}
      </div>
    </>

    );
};