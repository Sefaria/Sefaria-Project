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
            socket.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name);
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
        {peopleInBeitMidrash ? peopleInBeitMidrash.map(user => {
            return <li key={user.uid}>
                {user.name}
                <button>Connect</button>
            </li>
        }) : null}
        </div>
    )
}

export default BeitMidrash;