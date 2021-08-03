import {
    InterfaceText,
    ResponsiveNBox,
  } from './Misc';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Footer  from './Footer';
import { io } from 'socket.io-client';
import UserProfile from './UserProfile';


const BeitMidrash = () => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    
    useEffect(
        () => {
            const socket = io(`//${Sefaria.rtc_server}`);
            socket.emit("enter beit midrash", Sefaria._uid);
            socket.on("change in people", function(people) {
                console.log(people);
                const dedupedPeople = [...new Set(people)];
                setPeopleInBeitMidrash(dedupedPeople);
            })
            return () => {
                socket.disconnect()
            }
        }, 
    [])

    return (
        <div>
        <h1>Beit Midrash</h1>
        {peopleInBeitMidrash ? peopleInBeitMidrash.map(uid => {
            return <li key={uid}>{uid}</li>
        }) : null}
        </div>
    )
}

export default BeitMidrash;