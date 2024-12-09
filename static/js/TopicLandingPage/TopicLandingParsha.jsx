import React from 'react';
import {InterfaceText} from "../Misc";
import {Card} from "../common/Card";
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {useState, useEffect} from "react";


export const TopicLandingParasha = ({ handleClick }) => {
    const [parashah, setParashah] = useState({});

    useEffect(() => {
        Sefaria.getUpcomingDay('parasha').then(setParashah);
    }, []);

    const parashahTitle = parashah.displayValue;
    const parashahDesc = parashah.description;
    console.log(parashahTitle);

    return (
            <TopicLandingCalendar
                header={{en: "This Week’s Torah Portion"}}
                title={parashahTitle}
                description={parashahDesc}/>
    );
};