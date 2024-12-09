import React from 'react';
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {useState, useEffect} from "react";
import {ParashahLink} from "../NavSidebar";
import {InterfaceText} from "../Misc";
import Sefaria from "../sefaria/sefaria";


export const TopicLandingSeasonal = () => {
    const [seasonal, setSeasonal] = useState({});

    useEffect(() => {
        Sefaria.getSeasonalTopic().then(setSeasonal);
    }, []);
    const title = seasonal.topic?.primaryTitle;
    const description = seasonal.topic?.description
    const link = `/topics/${seasonal.slug}`


    return (
        <TopicLandingCalendar
            header={{en: "This Week’s Torah Portion"}}
            title={title}
            description={description}
            link={link}
        />
    );
};