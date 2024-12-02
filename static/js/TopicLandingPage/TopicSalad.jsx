import React from 'react';
import {useEffect, useState} from "react";
import {WordSalad} from "./WordSalad";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";

const exampleSlugs = [
  "Potiphar’s wife", "Og", "vines", "diversity", "humanity", "ravens",
  "Terach", "Fast of Gedaliah", "harmful forces", "Purim", "energy",
  "camels", "relationships", "Melchizedek", "prayer", "growth", "Iddo",
  "maror", "Yitro", "menorah", "alacrity", "authority", "Yom Kippur",
  "bal tashchit", "four questions", "Moses and Joseph’s coffin", "fertility",
  "freedom", "the future to come", "Jacob’s dream", "Ezekiel", "social justice",
  "compassion",
    "hate"
]
const exampleItems = exampleSlugs.map(slug => ({text: slug}))

const renderSaladItem = (item) => {
    console.log(item)
    return(
    // <span href={`/topics/${item.slug}`} className="topic-salad-item">
    //     {/*<InterfaceText text={{en: item.text, he: item.text}}/>*/}
    //     {item.text}
    //     {/*<span>{item.text}</span>*/}
    // </span>
        <a href={`/topics/${item.slug}`} className="topic-salad-item">
            <InterfaceText text={{en: item.text, he: item.text}}/>
        </a>
    )
}

const fetchRandomSaladItems = async () => {
    const topics = await Sefaria.getTopicsByPool('general_en', 50);
    const saladItems = topics.map(topic=>({slug: topic.slug, text: topic.primaryTitle.en}))
    return saladItems;
}


export const TopicSalad = () => {

    const [salad, setSalad] = useState([]);

    useEffect(() => {
        const fetchSaladItems = async () => {
            const saladItems = await fetchRandomSaladItems();
            setSalad(saladItems);
        };

        fetchSaladItems();
    }, []);

    return (
      <div className='topic-salad'>
                  <WordSalad renderItem={renderSaladItem}
                       numLines={5}
                       salad={salad}/>
      </div>
  );
};