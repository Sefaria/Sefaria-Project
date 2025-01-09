import React from 'react';
import {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";
import {Card} from "../common/Card";


export const RandomTopicCardWithDescriptionRow = () => {
    const numTopics = 3;
    const [deck, setDeck] = useState([]);

    const renderSaladItem = (item) => {
        return(<a href={`/topics/${item.slug}`} className="topic-salad-item">
                <InterfaceText text={item.text}/>
                </a>)
    }

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
                  cardText={topic.description}>
                  <div className="explore-more-prompt">
                      <a href={`topics/${topic.slug}`}>
                          <InterfaceText text={{en: `Learn More on ${topic.title?.en} ›`,
                              he:`${Sefaria._("Learn More on")} ${topic.title?.he} ›`}}/>
                      </a>
                  </div>
              </Card>
          </div>)}
      </div>
    </>

    );
};