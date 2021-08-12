import {
    InterfaceText,
    NBox,
  } from './Misc';
import React, { useState, useEffect, useRef } from 'react';
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
    const [chatDataStore, setChatDataStore] = useState(() => {
        const saved = localStorage.getItem("chatDataStore");
        const initialValue = JSON.parse(saved);
        return initialValue || {};
      });
    
    const addMessageToDataStore = (user, room, message) => {
        const roomExists = chatDataStore[room.roomId]

        setChatDataStore(chatDataStore => ({
            ...chatDataStore, 
            [room.roomId]: {
                chatMembers: [
                    room.userB,
                    room.user
                ],
                messages: [...(roomExists ? chatDataStore[room.roomId].messages : []), {
                senderId: user.uid,
                message: message,
                timestamp: Date.now()
                }]}
            }));

    }

    useEffect(()=>{
       console.log("in first useEffect, activeChats has updated")
        // 

       socket.off("received chat message")

       socket.on("received chat message", (user, message, room) => {
        room.userB = user;
        room.user = {uid: Sefaria._uid, name: Sefaria.full_name};
        
        addMessageToDataStore(user, room, message);
        console.log(activeChatRooms)
        const currentActiveChatRoomIds = activeChatRooms.map(room => {return room.roomId})
        if (!currentActiveChatRoomIds.includes(room.roomId)) {
            setActiveChatRooms(rooms=>[...rooms, room])
            socket.emit("join chat room", room);
        };

    })
    }, [activeChatRooms])
    
    useEffect(() => {
        socket.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name);
        socket.on("change in people", function(people) {
            const dedupedPeople = [...new Set(people)];
            setPeopleInBeitMidrash(dedupedPeople);
        })
        
        const onDisconnect = () => {
            console.log("disconnecting")
            socket.disconnect();
        }
        
        window.addEventListener("beforeunload", onDisconnect)
        
        return () => {
            window.removeEventListener("beforeunload", onDisconnect)
            onDisconnect()
        }
    }, [])

    useEffect (()=> {
        localStorage.setItem("chatDataStore", JSON.stringify(chatDataStore))
    }, [chatDataStore]);

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
        let roomId;
        if (user.uid < Sefaria._uid) {
            roomId = `${user.uid}-${Sefaria._uid}`;
        } else {
            roomId = `${Sefaria._uid}-${user.uid}`;
        }

        const room = {roomId, userB: user, user: {uid: Sefaria._uid, name: Sefaria.full_name}};
        setActiveChatRooms(rooms => [...rooms, room]);

        if (!chatDataStore[roomId]) {
            setChatDataStore({...chatDataStore, 
                [roomId]: {
                    chatMembers: [
                        user,
                        {uid: Sefaria._uid, name: Sefaria.full_name}
                    ],
                    messages: []
                }});
        }
    }

    const makeChatRooms = () => {
        return activeChatRooms.map(room => {
            return <ChatBox 
                        room={room} 
                        chatDataStore = {chatDataStore}
                        setChatDataStore = {setChatDataStore}
                        handleCloseChat={handleCloseChat} 

                    />
        });      
    }

    const handleCloseChat = (roomObj) => {
        setActiveChatRooms(activeChatRooms.filter(room => room.roomId !== roomObj.roomId));
    }

    const currentActiveChatUsers = activeChatRooms.reduce((acc, curr) => {return acc.concat([curr.userB.uid, curr.user.uid])}, []);
    
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
                        {currentActiveChatUsers.includes(user.uid) ? null : <button onClick={() => startChat(user)}>Chat</button>
                        }
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

const ChatBox = ({room, chatDataStore, setChatDataStore, handleCloseChat}) => {
    //chat message currently being typed:
    const [chatMessage, setChatMessage] = useState(null);
    const roomId = room.roomId;
    const chatBox = useRef();

    useEffect(()=>{
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

        socket.on("leaving chat room", (user, roomId)=>{
            setChatDataStore(chatDataStore => ({
                ...chatDataStore, 
                [roomId]: {...chatDataStore[roomId],
                    messages: [...chatDataStore[roomId].messages, {
                    senderId: user.uid,
                    message: `${user.name} left the chat`,
                    timestamp: Date.now()
                    }]}
                }));
        })
    }, []);

    useEffect(()=>{
        const lastMessage = chatBox.current.querySelector(".chat-message:last-of-type")
        if (lastMessage) {
            lastMessage.scrollIntoView()
        }

    }, [chatDataStore])

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
    }
    
    const handleSubmit = (e) => {
        e.preventDefault()
        
        socket.emit("send chat message", room, chatMessage);
        
        const roomId = room.roomId;
      
        setChatDataStore(chatDataStore => 
            ({...chatDataStore, [roomId]: {...chatDataStore[roomId], 
               messages: [...chatDataStore[roomId].messages, {
                senderId: Sefaria._uid,
                message: chatMessage,
                timestamp: Date.now()
            }]}
           }));
        e.target.reset();
    }

    const handleConnect = (uid) => {
        //user A sends connection request to user B 
        socket.emit("connect with other user", uid, Sefaria.full_name);
    }

    return (
    <div className="chat" ref={chatBox}>
        <div className="chat-box-header">
            {room["userB"]["name"]}
            <img 
                onClick={()=>handleConnect(room["userB"]["uid"])} 
                src="/static/img/video-call.png" 
                alt="icon of video camera"
                role="button"
                tabIndex="0"
                aria-roledescription={`click to open a video call with ${room.userB.name}`}
                />
            <img 
                onClick={()=>handleCloseChat(room)}
                src="/static/img/close.png"
                alt="icon of X"
                role="button"
                tabIndex="0"
                aria-roledescription={`click to close chat with ${room.userB.name}`}
                />
        </div>
        <div className="chats-container">
            {chatDataStore[roomId].messages.map((message, i) => {
                return <div key={i} className={message.senderId === Sefaria._uid? "own chat-message" : "chat-message"}><span>{message.message}</span></div>
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