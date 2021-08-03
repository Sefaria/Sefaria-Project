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
    const socket = io(`//${Sefaria.rtc_server}`);

    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    
    const beitMidrashContainer = useRef();

    const leave = useCallback ( event => {
        event.preventDefault()
        console.log("leaving beit midrash!")
        socket.emit("leave beit midrash", Sefaria._uid)
    }, [])

    useEffect(() => {
        console.log("entered beit midrash")
        socket.emit("enter beit midrash", Sefaria._uid)
    }, []);

    useEffect(
        () => {
                window.addEventListener('beforeunload', leave);
                return () => {
                    window.removeEventListener('beforeunload', leave);
                };
        }, []
    )
    
    socket.on("change in people", function(people) {
        console.log(people)
        setPeopleInBeitMidrash(people)
    })
    
    return (
        <div ref={beitMidrashContainer}>
        <h1>Beit Midrash</h1>
        {peopleInBeitMidrash ? peopleInBeitMidrash.map(uid => {
            return <li key={uid}>{uid}</li>
        }) : null}
        </div>
    )
}

export default BeitMidrash;