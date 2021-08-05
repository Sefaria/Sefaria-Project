import {
    InterfaceText,
    NBox,
  } from './Misc';
import React, { useState, useEffect } from 'react';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Footer  from './Footer';
import UserProfile from './UserProfile';
import { socket } from './sockets';


const BeitMidrash = () => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChats, setActiveChats] = useState([]);

    useEffect(() => {
        socket.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name);
        socket.on("change in people", function(people) {
            console.log(people);
            const dedupedPeople = [...new Set(people)];
            setPeopleInBeitMidrash(dedupedPeople);
        })
        //user B receives connection request
        socket.on("connection request", (name) => {
            let connectionRequest = window.confirm(`${name} would like to learn with you. Connect?`)
            //if user B says yes, we create a room ID and send it to server
            if (connectionRequest) {
                const room = Math.random().toString(36).substring(7);
                socket.emit("send room ID to server", name, room);
                window.location = `/chavruta?rid=${room}`;
            } else {
                socket.emit("connection rejected", name);
            }
        })
        //sends rejection to user A
        socket.on("send connection rejection", ()=>{
            window.alert(`Connection rejected, sorry!`);
        })
        //user A gets acceptance alert
        socket.on("send room ID to client", (room)=> {
            window.alert("Chavruta accepted!");
            window.location = `/chavruta?rid=${room}`;
        });

        socket.on("received chat message", (name, message) => {
            setActiveChats(users => [...users, user])
        })
    
        return () => {
            console.log("disconnecting")
            socket.disconnect();
        }
    }, [])
   
    const handleConnect = (uid) => {
        //user A sends connection request to user B 
        socket.emit("connect with other user", uid, Sefaria.full_name);
    }

    
    const pairsLearning = (people) => {
        //create an array of roomIds
        const rooms = people.map(user => user.roomId);
        //initialize empty object for pairs
        const pairs = {};
        //loop through the rooms, find matching users for each room, push into pairs object
        rooms.forEach(room => {
            if (room) {
                pairs[room] = people.filter(user => room === user.roomId);
            }
        })
        return Object.values(pairs);
    }
    
    const startChat = (user) => {
        console.log("USER", user)
        setActiveChats(users => [...users, user])
    }

    const makeChatRooms = () => {
        return activeChats.map(user => {
            return <ChatBox user={user} />
        })      
    }

    return (
        <div>
        <h1>Beit Midrash</h1>
        <h2>Single Learners</h2>
            <div>
                {peopleInBeitMidrash ? peopleInBeitMidrash
                .filter(user => !user.roomId)
                .map(user => {
                    if (user.uid !== Sefaria._uid) {
                    return <li key={user.uid}>
                        {user.name}
                        <button onClick={() => startChat(user)}>Chat</button>
                    </li>
                    } else {
                        return <li key={user.uid}>{user.name} (You)</li>
                    }
                }) : null}
            </div>
        <h2>Paired Learners</h2>
            <div>
            {peopleInBeitMidrash ? pairsLearning(peopleInBeitMidrash).map((pair, i)  => <li key={i}>{pair.map(user => user.name).join(", ")}</li>) : null}
            </div>
        <NBox content={makeChatRooms()} n={3} />
        </div>
        
    )
}

const ChatBox = (props) => {
    const [chatMessage, setChatMessage] = useState(null);
    //chat messages in the window
    const [chats, setChats] = useState([]);
    
    useEffect(()=>{
        socket.on("received chat message", (name, message) => {
            console.log("received chat message")
            setChats(chats => [...chats, `${name}: ${message}`])
        });
    }, []);

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
    }
    
    const handleSubmit = (e) => {
        e.preventDefault()
        socket.emit("send chat message", props.user, Sefaria.full_name, chatMessage);
        setChats(chats => [...chats, `You: ${chatMessage}`]);
        e.target.reset();
        
    }

    return (<div className="chat">
        <div>Chat with {props.userName}</div>
        <div className="chats-container">
        {chats.map((message, i) => {
            return <div key={i}>{message}</div>
        })}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
          <label className="chat-label">
            Enter a message:
            <input type="text" className="chat-input" onChange={handleChange} />
          </label>
          <input type="submit" className="chat-submit" value="enter" />
        </form>
        </div>
    )
}

export default BeitMidrash;