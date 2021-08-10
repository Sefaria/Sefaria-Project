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
import { cssNumber } from 'jquery';


const BeitMidrash = () => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChatRooms, setActiveChatRooms] = useState([]);
    const [firstMessage, setFirstMessage] = useState(null)

    useEffect(() => {
        window.localStorage.setItem("chatsDataStore", "{}")

        socket.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name);
        socket.on("change in people", function(people) {
            console.log(people);
            const dedupedPeople = [...new Set(people)];
            setPeopleInBeitMidrash(dedupedPeople);
        })

        socket.on("received first chat message", (user, message, room) => {
            // console.log("Active Chats", activeChats)
            // console.log("room in received first chat message", room)
            console.log(activeChatRooms.find(roomObj=> roomObj.roomId === room.roomId))
            if (!activeChatRooms.find(roomObj => roomObj.roomId === room.roomId)) {
                setFirstMessage(`${user.name}: ${message}`);
                console.log("room on first chat message", room)
                room.userB = user
                room.user = {uid: Sefaria._uid, name: Sefaria.full_name}
                console.log("room on first chat message 2", room)
                setActiveChatRooms(rooms => [...rooms, room]);
            }
        })
    
        return () => {
            console.log("disconnecting")
            socket.disconnect();
        }
    }, [])
   
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
        const roomId = Math.random().toString(36).substring(7);
        setFirstMessage(null)
        const room = {roomId, userB: user, user: {uid: Sefaria._uid, name: Sefaria.full_name}};
        setActiveChatRooms(rooms => [...rooms, room]);
    }

    const makeChatRooms = () => {
        return activeChatRooms.map(room => {
            return <ChatBox room={room} firstMessage={firstMessage} handleCloseChat={handleCloseChat} />
        })      
    }

    const handleCloseChat = (roomObj) => {
        setActiveChatRooms(activeChatRooms.filter(room => room.roomId !== roomObj.roomId))
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

const ChatBox = ({firstMessage, room, handleCloseChat}) => {
    //chat message currently being typed:
    const [chatMessage, setChatMessage] = useState(null);
    //chat messages in the window:
    const [chats, setChats] = useState(firstMessage ? [firstMessage] : []);

    useEffect(()=>{
        socket.on("received chat message", (roomObj, message) => {
            if (roomObj.roomId === room.roomId) {
                setChats(chats => [...chats, `${roomObj.user.name}: ${message}`])
            }
        });

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

    }, []);

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
    }
    
    const handleSubmit = (e) => {
        e.preventDefault()
        console.log("CHATS", chats)
        if (chats.length === 0){
            console.log("sending first chat message")
            socket.emit("send first chat message", room, chatMessage)
        } else {
            socket.emit("send chat message", room, chatMessage);
        }
        
        setChats(chats => [...chats, `You: ${chatMessage}`]);
        e.target.reset();
    }

    const handleConnect = (uid) => {
        //user A sends connection request to user B 
        socket.emit("connect with other user", uid, Sefaria.full_name);
    }
    
    const chatsDataStore = window.localStorage.getItem("chatsDataStore")
    console.log("chatsDataStore in ChatBox", chatsDataStore)

    return (
    <div className="chat">
        <div className="chat-box-header">
            {room["userB"]["name"]}
            <img 
                onClick={()=>handleConnect(room["userB"]["uid"])} 
                src="/static/img/video-call.png" 
                alt="icon of video camera"
                role="button"
                tabIndex="0"
                aria-description={`click to open a video call with ${room.userB.name}`}
                />
            <img 
                onClick={()=>handleCloseChat(room)}
                src="/static/img/close.png"
                alt="icon of X"
                role="button"
                tabIndex="0"
                aria-description={`click to close chat with ${room.userB.name}`}
                />
        </div>
        <div className="chats-container">
            {chats.map((message, i) => {
                return <div key={i}>{message}</div>
            })}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
            <input type="text" className="chat-input" onChange={handleChange} />
          <input type="submit" className="chat-submit" value="enter" />
        </form>
    </div>
    )
}

export default BeitMidrash;