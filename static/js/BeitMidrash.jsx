import {
    InterfaceText,
    ResponsiveNBox,
  } from './Misc';
import React, { useState, useEffect, useContext } from 'react';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Footer  from './Footer';
import { io } from 'socket.io-client';
import UserProfile from './UserProfile';


const BeitMidrash = () => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);

    useEffect(() => {
        const socket = io(`//${Sefaria.rtc_server}`);
        socket.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name);
        socket.on("change in people", function(people) {
            console.log(people);
            const dedupedPeople = [...new Set(people)];
            setPeopleInBeitMidrash(dedupedPeople);
        })
        socket.on("connection request", (name) => {
            let connectionRequest = window.confirm(`${name} would like to learn with you. Connect?`)
            if (connectionRequest) {
                const room = Math.random().toString(36).substring(7);
                socket.emit("send room ID to server", name, room)
                window.location = `/chavruta?rid=${room}`
            } else {
                socket.emit("connection rejected", name);
            }
        })
        socket.on("send connection rejection", ()=>{
            window.alert(`Connection rejected, sorry!`);
        })
        socket.on("send room ID to client", (room)=> {
            window.alert("Chavruta accepted!")
            window.location = `/chavruta?rid=${room}`
        });
    
        return () => {
            socket.disconnect();
        }
    }, [])
   
    const handleConnect = (uid) => {
        const socket = io(`//${Sefaria.rtc_server}`);
        socket.emit("connect with other user", uid, Sefaria.full_name);
    }

    return (
        <div>
        <h1>Beit Midrash</h1>
        {peopleInBeitMidrash ? peopleInBeitMidrash.map(user => {
            if (user.uid !== Sefaria._uid) {
            return <li key={user.uid}>
                {user.name}
                <button onClick={() => handleConnect(user.uid)}>Connect</button>
            </li>
            } else {
                return <li key={user.uid}>{user.name} (You)</li>
            }
        }) : null}
        </div>
    )
}

export default BeitMidrash;