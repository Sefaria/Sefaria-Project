import {
    InterfaceText,
    LoadingMessage,
    ProfilePic
} from './Misc';
import React, { useState, useEffect, useRef } from 'react';
import Sefaria  from './sefaria/sefaria';

const BeitMidrash = ({socket}) => {
    const beitMidrashId = "tempString";
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChatRooms, setActiveChatRooms] = useState([]);
    const [chatDataStore, setChatDataStore] = useState(() => {
        // const saved = localStorage.getItem("chatDataStore");
        // const initialValue = JSON.parse(saved);
        const initialValue = {}
        return initialValue || {};
      });
    const [profile, setProfile] = useState({});
    const [currentChatRoom, setCurrentChatRoom] = useState("");
    const [beitMidrashHome, setBeitMidrashHome] = useState(true)
    const [outgoingCall, setOutgoingCall] = useState(false)
    const [userB, setUserB] = useState({})
    const [socketConnected, setSocketConnected] = useState(false)

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


    useEffect(() => {
        socket.connect();
        socket.on("connectionStarted", () => {setSocketConnected(socket)})

        socket.on("change in people", function(people) {
            const dedupedPeople = people.filter((person, index,self) => {
                return index === self.findIndex((p) => p.uid === person.uid)
            })
            const filteredDedupedPeople = dedupedPeople.filter(person => person.beitMidrashId === beitMidrashId)
            setPeopleInBeitMidrash(filteredDedupedPeople);
        })

        if (Sefaria._uid) {
            Sefaria.profileAPI(Sefaria.slug).then(profile => {
                setProfile(profile)
                socket.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.organization, beitMidrashId);
            });
        }

        //user B receives connection request
        socket.on("connection request", (user) => {
            chavrutaRequestReceived(user)
        })
        //sends rejection to user A
        socket.on("send connection rejection", ()=>{
            setBeitMidrashHome(true)
        })
        //user A gets acceptance alert
        socket.on("send room ID to client", (room)=> {
            window.location = `/chavruta?rid=${room}`;
        });

        const onDisconnect = () => {
            setSocketConnected(false);
            socket.disconnect();
        }

        window.addEventListener("beforeunload", onDisconnect)

        return () => {
            window.removeEventListener("beforeunload", onDisconnect)
            onDisconnect()
        }
    }, [])

    useEffect(()=>{
       socket.off("received chat message")

       socket.on("received chat message", (user, message, room) => {
        room.userB = user;
        room.user = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization};

        addMessageToDataStore(user, room, message);

        const currentActiveChatRoomIds = activeChatRooms.map(room => {return room.roomId})
        if (!currentActiveChatRoomIds.includes(room.roomId)) {
            setActiveChatRooms(rooms=>[...rooms, room])
            socket.emit("join chat room", room);
        };

        setCurrentChatRoom(room.roomId)

        })
    }, [activeChatRooms])

    useEffect (()=> {
        // localStorage.setItem("chatDataStore", JSON.stringify(chatDataStore))
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

        const room = {roomId, userB: user, user: {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}};

        const currentActiveChatRoomIds = activeChatRooms.map(room => {return room.roomId})
        if (!currentActiveChatRoomIds.includes(roomId)) {
            setActiveChatRooms(rooms => [...rooms, room]);
        }
        setCurrentChatRoom(roomId)

        if (!chatDataStore[roomId]) {
            setChatDataStore({...chatDataStore,
                [roomId]: {
                    chatMembers: [
                        user,
                        {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}
                    ],
                    messages: []
                }});
        }
    }

    const handleCloseChat = (roomObj) => {
        setActiveChatRooms(activeChatRooms.filter(room => room.roomId !== roomObj.roomId));
    }

    const chavrutaCallInitiated = (uid) => {
        console.log('connect with other user', uid)
        setBeitMidrashHome(false)
        setOutgoingCall(true)
    }

    const chavrutaRequestReceived = (user) => {
        setUserB(user)
        setBeitMidrashHome(false)
        setOutgoingCall(false)
    }

    return (
        socketConnected ?
        <div id="beitMidrashContainer">
            { beitMidrashHome ?
            <BeitMidrashHome
                beitMidrashId = {beitMidrashId}
                peopleInBeitMidrash={peopleInBeitMidrash}
                activeChatRooms={activeChatRooms}
                currentChatRoom={currentChatRoom}
                startChat={startChat}
                chatDataStore={chatDataStore}
                setChatDataStore={setChatDataStore}
                handleCloseChat={handleCloseChat}
                chavrutaCallInitiated={chavrutaCallInitiated}
                chavrutaRequestReceived={chavrutaRequestReceived}
                setUserB={setUserB}
                socket={socketConnected}
            /> :
            <ChavrutaCall
                outgoingCall={outgoingCall}
                userB={userB}
                setBeitMidrashHome={setBeitMidrashHome}
                socket={socketConnected}
            />}
        </div> : <LoadingMessage/>
    )
}

const BeitMidrashHome = ({beitMidrashId,
                        peopleInBeitMidrash,
                        activeChatRooms,
                        currentChatRoom,
                        startChat,
                        chatDataStore,
                        setChatDataStore,
                        handleCloseChat,
                        chavrutaCallInitiated,
                        chavrutaRequestReceived,
                        setUserB,
                        socket
                        }) => {

    return (<div>
        <div>
        <div id="beitMidrashHeader">Chavruta {beitMidrashId}</div>
        <div id="newCall"><a href="/chavruta"><img src="/static/img/camera_with_plus.svg" id="newCallImg" /><span>New Call</span></a></div>
        <hr className="beitMidrashHR" />
            <div className="peopleInBeitMidrash">
                {peopleInBeitMidrash && peopleInBeitMidrash.length > 1 ? peopleInBeitMidrash
                .filter(user => !user.roomId)
                .map(user => {
                    if (user.uid !== Sefaria._uid) {
                    return <div id="beitMidrashUser" key={user.uid}>
                        <ProfilePic len={42.67} url={user.pic} name={user.name} id="beitMidrashProfilePic" />
                        <div id ="beitMidrashUserText" onClick={() => startChat(user)}>
                        {user.name}
                        {/* {currentActiveChatUsers.includes(user.uid) ? null : <button onClick={() => startChat(user)}>Chat</button>
                        } */}
                        <div id="beitMidrashOrg">{user.organization}</div>
                        </div>
                    </div>
                    } else {
                        return null
                    }
                }) : <div className="noUsers">No users online.</div>}
            </div>
            {/* <div>
            {peopleInBeitMidrash ? pairsLearning(peopleInBeitMidrash).map((pair, i)  => <li key={i}>{pair.map(user => user.name).join(", ")}</li>) : null}
            </div> */}
        </div>
        <div>
        <hr className="beitMidrashHR" />
        {activeChatRooms.map(room => {
            if (room.roomId === currentChatRoom) {
                return <ChatBox
                            key={room.roomId}
                            room={room}
                            chatDataStore={chatDataStore}
                            setChatDataStore={setChatDataStore}
                            handleCloseChat={handleCloseChat}
                            chavrutaCallInitiated={chavrutaCallInitiated}
                            chavrutaRequestReceived={chavrutaRequestReceived}
                            setUserB={setUserB}
                            socket={socket}
                        />
            }
        })}
        </div>
    </div>)
}

const ChavrutaCall = ({outgoingCall, userB, setBeitMidrashHome, socket}) => {
    const handleCallAccepted = (name) => {
        const room = Math.random().toString(36).substring(7);
        socket.emit("send room ID to server", name, room);
        window.location = `/chavruta?rid=${room}`;
    }

    const handleCallDeclined = (name) => {
        socket.emit("connection rejected", name);
        setBeitMidrashHome(true)
    }

    const endCall = (name) => {
        socket.emit("connection rejected", name)
        setBeitMidrashHome(true)
    }

    return (
        outgoingCall ? 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={userB.pic} name={userB.name} />
                <div id="endCallButtonHolder">
                    <span id="endCallIcon"><span id="endCall" className="endCallButton" onClick={()=>endCall(userB.name)}></span></span>
                </div>
                <div className = "callText">Calling {userB.name}...</div>
            </div>
            <div className="chavrutaFooter">Questions? Email <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></div>
        </div> : 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={userB.pic} name={userB.name} />
                <div className = "callText">Receiving call from {userB.name}...</div>
                <div id="incomingCallButtonHolder">
                    <button id="acceptButton" onClick={()=> handleCallAccepted(userB.name)}>Accept</button>
                    <button id="declineButton" onClick={()=> handleCallDeclined(userB.name)}>Decline</button>
                </div>
            </div>
            <div className="chavrutaFooter">Questions? Email <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></div>
        </div>
    )
}

const ChatBox = ({room,
                chatDataStore,
                setChatDataStore, 
                handleCloseChat,
                chavrutaCallInitiated,
                chavrutaRequestReceived,
                setUserB,
                socket,
                 }) => {
                   
    const [chatMessage, setChatMessage] = useState(null);
    const [partnerLeftNotification, setPartnerLeftNotification] = useState(false);
    const [inputArrowBlue, setInputArrowBlue] = useState(false)
    const roomId = room.roomId;
    const chatBox = useRef();

    useEffect(()=>{
        setUserB(room.userB);

        socket.on("leaving chat room", ()=>{
            console.log("your partner left the chat!")
            setPartnerLeftNotification(true);
        })
    }, []);

    useEffect(()=>{
        const lastMessage = chatBox.current.querySelector(".chatMessage:last-of-type")
        if (lastMessage) {
            lastMessage.scrollIntoView()
        }

    }, [chatDataStore, partnerLeftNotification])

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
        setInputArrowBlue(true)
    }
    
    const handleSubmit = (e) => {
        e.preventDefault();
        
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

    const handleStartCall = (uid) => {
        socket.emit("connect with other user", uid, {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url});
        chavrutaCallInitiated(uid)
    }

 
    return (
    <div className="chat" ref={chatBox}>
        <div id="hideButtonHolder">
            <div id="hideButton" onClick={()=>handleCloseChat(room)}>Hide{" "}<img src="/static/img/downward_carrot.svg" /></div>
        </div>
        <div className="chatBoxHeader">
            <div id="chatUser">
                <ProfilePic len={42.67} url={room.userB.pic} name={room.userB.name} />
                <div className="chatBoxName">{room.userB.name}</div>
            </div>
            <img 
                onClick={()=>handleStartCall(room["userB"]["uid"])}
                id="greenCameraButton"
                src="/static/img/green_camera.svg" 
                alt="icon of green video camera"
                role="button"
                tabIndex="0"
                aria-roledescription={`click to open a video call with ${room.userB.name}`}
                />
        </div>
        <div className="chats-container">
            {chatDataStore[roomId].messages.map((message, i) => {
                return (
                    message.senderId === Sefaria._uid ? 
                        <Message user={room.user} key={i} message={message} /> :
                        <Message user={room.userB} key={i} message={message} />
                )
            })}
            {partnerLeftNotification ? <div className="chatMessage">{room.userB.name} has left the chat.</div> : null}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
            <input type="text" className="chat-input" onChange={handleChange} placeholder="Send a Message"></input>
          <input type="submit" className={inputArrowBlue? "chat-submit chat-submit-blue" : "chat-submit"} value=""/>
        </form>
    </div>
    )
}

const Message = ({user, message}) => {

    const parsedTimeStamp = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit' })

    return (
        <div className="chatMessage">
                <ProfilePic len={35} url={user.pic} name={user.name} />
            <div className = "chatText">
                <div className="chatNameAndTime"><span>{user.name}</span>{"  "}<span>{parsedTimeStamp}</span></div>
                <div>{message.message}</div> 
            </div>
        </div>
    )
}


export default BeitMidrash;