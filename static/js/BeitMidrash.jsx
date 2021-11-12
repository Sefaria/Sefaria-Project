import {
    InterfaceText,
    LoadingMessage,
    ProfilePic
} from './Misc';
import React, { useState, useEffect, useRef } from 'react';
import Sefaria  from './sefaria/sefaria';
import classNames from 'classnames';

const BeitMidrash = ({socket, beitMidrashId, currentlyReading}) => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChatRooms, setActiveChatRooms] = useState([]);
    const [profile, setProfile] = useState({});
    const [currentChatRoom, setCurrentChatRoom] = useState("");
    const [currentScreen, setCurrentScreen] = useState("home");
    const [outgoingCall, setOutgoingCall] = useState(false);
    const [activeChavruta, setActiveChavruta] = useState(null)
    const [socketConnected, setSocketConnected] = useState(false);
    const [chavrutaOnline, setChavrutaOnline] = useState(false);
    const [socketObj, setSocketObj] = useState(socket);
    const [partnerLeftNotification, setPartnerLeftNotification] = useState(false);
    const [blockedUsers, setBlockedUsers] = useState([])
    const [pcConfig, setPcConfig] = useState(null);
    const [usersWithUnreadMsgs, setUsersWithUnreadMsgs] = useState([])
    const [shouldUpdateChats, setShouldUpdateChats] = useState(false)


    const filterDedupeAndSortPeople = (people) => {
        const dedupedPeople = people.filter((person, index,self) => {
            return index === self.findIndex((p) => p.uid === person.uid)
        })
        const filteredDedupedPeople = dedupedPeople.filter(person => person.beitMidrashId === beitMidrashId && !blockedUsers.includes(person.uid));
        const sortedPeople = filteredDedupedPeople.sort(function(a, b){
            if(a.name < b.name) { return -1; }
            if(a.name > b.name) { return 1; }
            return 0;
        })

        return (sortedPeople)
    }

    const onBlockUser = (uid) => {
        setBlockedUsers(uids => [...uids, uid])
        console.log("user blocked!")
        console.log("blockedUsers", blockedUsers)
        Sefaria.track.event("BeitMidrash", "Blocked User", "");
        setPeopleInBeitMidrash(filterDedupeAndSortPeople(peopleInBeitMidrash));

        setCurrentChatRoom("")
    }

    const onUnblockUser = (uid) => {
        //insert code for unblocking user
    }

    const processMessage = (uid, room) => {
        if (currentChatRoom != room.roomId) {
            setUsersWithUnreadMsgs(prevArray => [...prevArray, uid]);
        }
        new Audio("/static/files/chime.wav").play();
        setShouldUpdateChats(true)
    }

    useEffect(() => {
        socketObj.connect();

        socket.on('creds', function(conf) {
          console.log('got creds')
          setPcConfig(conf);
        });

        socketObj.on("connectionStarted", () => {setSocketConnected(true)})

        socketObj.on("connection request", (user) => {
            chavrutaRequestReceived(user)
            const roomId = user.uid < Sefaria._uid ? `${user.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${user.uid}`
            setCurrentChatRoom(roomId)
        })

        socketObj.on("send connection rejection", ()=>{
            window.alert("User is not available.");
            setCurrentScreen("home")
        })

        socketObj.on("send room ID to client", (room)=> {
            setCurrentScreen("chavrutaVideo")
        });

        socketObj.on("duplicate user", () => {
            window.alert("The Beit Midrash can only be open in one window" );
            window.location.href="/";
        });

        const onDisconnect = () => {
            socketObj.disconnect();
            setSocketConnected(false);
        }

        window.addEventListener("beforeunload", onDisconnect)

        return () => {
            window.removeEventListener("beforeunload", onDisconnect)
            onDisconnect()
        }
    }, [])

    useEffect(()=> {
        socketObj.emit("update currently reading", Sefaria._uid, currentlyReading);
        console.log(currentlyReading)
    }, [currentlyReading])

    useEffect(()=>{
        socketObj.io.off("reconnect")
        socketObj.io.on("reconnect", (attempt) => {
            setSocketConnected(socket);
            console.log(`Reconnected after ${attempt} attempt(s)`);
            setShouldUpdateChats(true)

            if (currentScreen == "chavrutaVideo") {
                const roomID =  activeChavruta.uid < Sefaria._uid ? `${activeChavruta.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${activeChavruta.uid}`
                socketObj.emit("rejoin chavruta room", roomID)
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.organization, currentlyReading, beitMidrashId, true);
            }

            else {
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.organization, currentlyReading, beitMidrashId, false);
            }
        });
    }, [beitMidrashId, currentlyReading, currentScreen])

    useEffect(()=>{
        if (Sefaria._uid) {
            Sefaria.profileAPI(Sefaria.slug).then(profile => {
                setProfile(profile)
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.organization, currentlyReading, beitMidrashId, false);
            });
        }
    }, [beitMidrashId])

    useEffect(() => {
        if(activeChavruta) {
            setChavrutaOnline(true);
        }
    }, [activeChavruta])


    useEffect(()=> {
        socketObj.off("change in people");
        socketObj.on("change in people", function(people, uid) {
            setPeopleInBeitMidrash(filterDedupeAndSortPeople(people));

            let roomIdToCheck = uid < Sefaria._uid ? `${uid}-${Sefaria._uid}`: `${Sefaria._uid}-${uid}`;

            // show what chavruta is learning and handle if user hangs up
            if (activeChavruta && currentScreen === "chavrutaVideo") {
                const myChavruta = people.filter(person => person.uid === activeChavruta.uid)[0];
                if(myChavruta) {
                    setActiveChavruta(myChavruta);
                } else {
                    setChavrutaOnline(false);
                }
            }
            if (currentChatRoom === roomIdToCheck) {
                setPartnerLeftNotification(false)
            }
        })

    }, [currentChatRoom, beitMidrashId, blockedUsers, activeChavruta, currentScreen])

    useEffect(()=>{
       socketObj.off("received chat message")

       socketObj.on("received chat message", (msgSender, room) => {
            room.activeChatPartner = msgSender;
            room.me = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization};

            if(!blockedUsers.includes(msgSender.uid)) {

                const currentActiveChatRoomIds = activeChatRooms.map(r => {return r.roomId});
     
                if (!currentActiveChatRoomIds.includes(room.roomId)) {
                    socketObj.emit("join chat room", room);
                };
                if (currentActiveChatRoomIds.length == 0) {
                    setActiveChatRooms([room]);
                    setCurrentChatRoom(room.roomId);
                    setActiveChavruta(room.activeChatPartner);
                }

                processMessage(msgSender.uid, room);

            } else {
                socketObj.emit("user is blocked", msgSender);
            }
        })


    }, [activeChatRooms, blockedUsers, currentChatRoom])

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

    const markRead = (uid) => {
        setUsersWithUnreadMsgs(usersWithUnreadMsgs.filter(users => users !== uid));
    }

    const startChat = (activeChatPartner) => {
        Sefaria.track.event("BeitMidrash", "Opened Chat With User", "Had Notifications", usersWithUnreadMsgs.includes(activeChatPartner.uid));
        // setUsersWithUnreadMsgs(usersWithUnreadMsgs.filter(users => users !== activeChatPartner.uid));
        markRead(activeChatPartner.uid)
        setActiveChavruta(activeChatPartner);
        let roomId = activeChatPartner.uid < Sefaria._uid ? `${activeChatPartner.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${activeChatPartner.uid}`

        const me = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}
        const room = {roomId, activeChatPartner: activeChatPartner, me: me};

        const currentActiveChatRoomIds = activeChatRooms.map(room => {return room.roomId})
        if (!currentActiveChatRoomIds.includes(roomId)) {
            setActiveChatRooms([room]);
        }
        setCurrentChatRoom(roomId)
    }

    const handleCloseChat = (roomObj) => {
        setActiveChatRooms(activeChatRooms.filter(room => room.roomId !== roomObj.roomId));
        setCurrentChatRoom("")
    }

    const chavrutaCallInitiated = (uid) => {
        setChavrutaOnline(true);
        Sefaria.track.event("BeitMidrash", "Initiated Chavruta Call", "");
        setCurrentScreen("callingChavruta")
        setOutgoingCall(true)
    }

    const chavrutaRequestReceived = (user) => {
        setActiveChavruta(user);
        setCurrentScreen("callingChavruta")
        setOutgoingCall(false)
    }

    return (
        socketConnected ?
        <div className="beitMidrashContainer">
            { currentScreen == "home" ?
            <BeitMidrashHome
                beitMidrashId = {beitMidrashId}
                peopleInBeitMidrash={peopleInBeitMidrash}
                activeChatRooms={activeChatRooms}
                currentChatRoom={currentChatRoom}
                startChat={startChat}
                usersWithUnreadMsgs={usersWithUnreadMsgs}
                handleCloseChat={handleCloseChat}
                chavrutaCallInitiated={chavrutaCallInitiated}
                chavrutaRequestReceived={chavrutaRequestReceived}
                activeChavruta={activeChavruta}
                markRead={markRead}
                socket={socketObj}
                shouldUpdateChats={shouldUpdateChats}
                setShouldUpdateChats={setShouldUpdateChats}
                profile={profile}
                partnerLeftNotification={partnerLeftNotification}
                setPartnerLeftNotification={setPartnerLeftNotification}
                onBlockUser={onBlockUser}
                onUnblockUser={onUnblockUser}
            /> :
                currentScreen == "callingChavruta" ?
            <ChavrutaCall
                outgoingCall={outgoingCall}
                activeChavruta={activeChavruta}
                setCurrentScreen={setCurrentScreen}
                socket={socketObj}
            /> :
            <ChavrutaVideo
                socket={socketObj}
                chavrutaId={currentChatRoom}
                chavrutaOnline={chavrutaOnline}
                pcConfig={pcConfig}
                activeChavruta={activeChavruta}
                setCurrentScreen={setCurrentScreen}
            />

            }
        </div> : <LoadingMessage/>
    )
}

const BeitMidrashHome = ({beitMidrashId,
                        peopleInBeitMidrash,
                        activeChatRooms,
                        currentChatRoom,
                        startChat,
                        handleCloseChat,
                        chavrutaCallInitiated,
                        chavrutaRequestReceived,
                        activeChavruta,
                        socket,
                        profile,
                        partnerLeftNotification,
                        setPartnerLeftNotification,
                        onBlockUser,
                        onUnblockUser,
                        usersWithUnreadMsgs,
                        shouldUpdateChats,
                        setShouldUpdateChats,
                        markRead
                        }) => {

    return (<div className="beitMidrashHomeContainer">
            {/*<div id="newCall"><a href="/chavruta"><img src="/static/img/camera_with_plus.svg" id="newCallImg" /><span>New Call</span></a></div>*/}
            <div id="beitMidrashHeader"><InterfaceText>Beit Midrash</InterfaceText></div>
            <div className="peopleInBeitMidrash">
                {peopleInBeitMidrash && peopleInBeitMidrash.length > 1 ? peopleInBeitMidrash
                    .filter(user => !user.roomId)
                    .map(user => {
                        const userClasses = {
                            unreadMessages: usersWithUnreadMsgs.includes(user.uid),
                            beitMidrashUser: 1,
                        };

                        if (user.uid !== Sefaria._uid) {
                            return <div className={classNames(userClasses)} key={user.uid} onClick={() => startChat(user)}>
                                <ProfilePic len={42.67} url={user.pic} name={user.name} id="beitMidrashProfilePic"/>
                                <div className="beitMidrashUserText">
                                    {user.name}
                                    {user.inChavruta ? <i className="fa fa-headphones" title={`${user.name} is current in a chavruta`}></i> : null}
                                    <div
                                        className="beitMidrashOrg">{user.currentlyReading ? <a href={user.currentlyReading.url}><InterfaceText>{`is ${user.currentlyReading.display}`}</InterfaceText> {`${user.currentlyReading.title}`}</a> : null}</div>
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
            {activeChatRooms.map(room => {
                if (room.roomId === currentChatRoom) {
                    return <ChatBox
                        key={room.roomId}
                        room={room}
                        handleCloseChat={handleCloseChat}
                        chavrutaCallInitiated={chavrutaCallInitiated}
                        chavrutaRequestReceived={chavrutaRequestReceived}
                        activeChavruta={activeChavruta}
                        socket={socket}
                        shouldUpdateChats={shouldUpdateChats}
                        setShouldUpdateChats={setShouldUpdateChats}
                        markRead={markRead}
                        profile={profile}
                        partnerLeftNotification={partnerLeftNotification}
                        setPartnerLeftNotification={setPartnerLeftNotification}
                        onBlockUser={onBlockUser}
                        onUnblockUser={onUnblockUser}
                    />
                }
            })}
    </div>)
}

const ChavrutaCall = ({outgoingCall, activeChavruta, setCurrentScreen, socket}) => {
    const handleCallAccepted = (uid) => {
        Sefaria.track.event("BeitMidrash", "Accepted Call", "");
        const room = Math.random().toString(36).substring(7);
        socket.emit("send room ID to server", uid, room);
        setCurrentScreen("chavrutaVideo")
    }

    const handleCallDeclined = (uid) => {
        Sefaria.track.event("BeitMidrash", "Declined Call", "");
        socket.emit("connection rejected", uid);
        setCurrentScreen("home");
    }

    const endCall = (uid) => {
        Sefaria.track.event("BeitMidrash", "Accepted Call", "Call Length");
        socket.emit("connection rejected", uid);
        setCurrentScreen("home");
    }


    useEffect(()=>{
        const callTimeOut = setTimeout(() => {
        setCurrentScreen("home")
    }, 28000)

        return () => {
            clearTimeout(callTimeOut);
        }
    }, [])

    return (
        outgoingCall ? 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={activeChavruta.pic} name={activeChavruta.name} />
                <div id="endCallButtonHolder">
                    <span id="endCallIcon"><span id="endCall" className="endCallButton" onClick={()=>endCall(activeChavruta.uid)}></span></span>
                </div>
                <div className = "callText">Calling {activeChavruta.name}...</div>
            </div>
            <audio autoPlay loop src="/static/files/chavruta_ringtone.mp3" />
                <div className="chavrutaFooter">
                    <p className="int-en">
                        Questions? Email <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
                    </p>

                    <p className="int-he">
                        לשאלות פנו/כתבו לדוא"ל <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
                    </p>
                </div>
        </div> : 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={activeChavruta.pic} name={activeChavruta.name} />
                <div className = "callText">{activeChavruta.name} <InterfaceText>is calling you...</InterfaceText></div>
                <div id="incomingCallButtonHolder">
                    <button id="acceptButton" onClick={()=> handleCallAccepted(activeChavruta.uid)}><InterfaceText>Accept</InterfaceText></button>
                    <button id="declineButton" onClick={()=> handleCallDeclined(activeChavruta.uid)}><InterfaceText>Decline</InterfaceText></button>
                </div>
            </div>
            <audio autoPlay loop src="/static/files/chavruta-ringtone.wav" />
            <div className="chavrutaFooter">
            <p className="int-en">
                    Questions? Email <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
                </p>

                <p className="int-he">
                    לשאלות פנו/כתבו לדוא"ל <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
                </p>
            </div>
        </div>
    )
}

const ChatBox = ({room,
                handleCloseChat,
                chavrutaCallInitiated,
                activeChavruta,
                socket,
                profile,
                partnerLeftNotification,
                setPartnerLeftNotification,
                shouldUpdateChats,
                setShouldUpdateChats,
                markRead,
                onBlockUser,
                onUnblockUser
                 }) => {
                   
    const [chatMessage, setChatMessage] = useState("");
    const roomId = room.roomId;
    const chatBox = useRef();
    const [blockedNotification, setBlockedNotification] = useState(false)
    const [storedChatMessages, setStoredChatMessages] = useState(null)
    const [showChats, setShowChats] = useState(false)

    useEffect(()=>{
        socket.on("leaving chat room", ()=>{
            setPartnerLeftNotification(true);
        })

        socket.on("you have been blocked", ()=> {
            setBlockedNotification(true)
        })
        
        Sefaria.getChatMessagesAPI(roomId).then(chats => {
            setStoredChatMessages(chats)
        })
    }, []);

    useEffect( () => {
        if (shouldUpdateChats) {
            Sefaria.getChatMessagesAPI(roomId).then(chats => {
                setStoredChatMessages(chats)
            })
            setShouldUpdateChats(false)
        }
    }, [shouldUpdateChats])

    useEffect(()=>{
        if (storedChatMessages) {
            setShowChats(true)
        } else {
            setShowChats(false)
        }
    }, [storedChatMessages])

    useEffect(()=>{
        try {
            const lastMessage = chatBox.current.querySelector(".chatMessage:last-of-type")
            if (lastMessage) {
                lastMessage.scrollIntoView()
            }
        }
        catch (e) {
            console.log(e)
        }
    }, [storedChatMessages, partnerLeftNotification, showChats])

    const handleChatAnalytics = () => {
        const totalChats = storedChatMessages ? storedChatMessages.length : 0;
        Sefaria.track.event("BeitMidrash", "Sent Chat", "Prior Chats in Chat History", totalChats);
        if (totalChats === 0) {
            Sefaria.track.event("BeitMidrash", "Sent Initial Chat")
        } else if (storedChatMessages.filter(chat => chat.sender_id === Sefaria._uid).length === 0) {
            Sefaria.track.event("BeitMidrash", "Sent First Response Chat in History", "Prior Chats in Chat History",totalChats)
        }
    }

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
    }
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const now = Date.now()
        socket.emit("send chat message", room);
        markRead(room.activeChatPartner.uid)
        const roomId = room.roomId;
      
        const msgSender = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}
        handleChatAnalytics();

        Sefaria.chatMessageAPI(roomId, Sefaria._uid, Date.now(), chatMessage).then( (res)=> {
            Sefaria.getChatMessagesAPI(roomId).then(chats => {
                setStoredChatMessages(chats)
            })
        } )

        e.target.reset();
        setChatMessage("")
    }

    const handleStartCall = (uid) => {
        socket.emit("connect with other user", uid, {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url});
        chavrutaCallInitiated(uid)
    }
    return (
        activeChavruta ?
    <div className="chat" ref={chatBox}>
        <div id="hideButtonHolder">
            <div id="hideButton" onClick={()=>handleCloseChat(room)}><InterfaceText>Hide</InterfaceText>{" "}<img src="/static/img/downward_carrot.svg" /></div>
        </div>
        {/*<details>*/}
        {/*<summary>*/}
        <div className="chatBoxHeader">
        
                <div id="chatUser">
                    <ProfilePic len={42.67} url={activeChavruta.pic} name={activeChavruta.name} />
                    <div className="chatBoxName">{activeChavruta.name}</div>
                </div>
                
                
            { blockedNotification || activeChavruta.inChavruta ? null :
            <img
                onClick={()=>handleStartCall(room["activeChatPartner"]["uid"])}
                id="greenCameraButton"
                src="/static/img/green_camera.svg" 
                alt="icon of green video camera"
                role="button"
                tabIndex="0"
                aria-roledescription={`click to open a video call with ${activeChavruta.name}`}
                />
            }
            
        </div>
        {/*</summary>*/}
        {/*    <div>Profile</div>*/}
        {/*    <div>Follow</div>*/}
        {/*    <div className="blockButton" onClick={()=>onBlockUser(activeChavruta.uid)}>Block</div>*/}
        {/*</details>*/}
        <div className="chats-container">
            {
                showChats ? storedChatMessages.sort((a,b) => a.timestamp - b.timestamp).map((message, i) => {
                return (
                    message["sender_id"] === Sefaria._uid ?
                        <Message user={room.me} key={i} message={message} /> :
                        <Message user={room.activeChatPartner} key={i} message={message} />
                )
            }) : <LoadingMessage />
            }

            {/*{partnerLeftNotification && !blockedNotification ? <div className="chatMessage">{room.activeChatPartner.name} has left the chat.</div> : null}*/}
            {/*{blockedNotification ? <div className="chatMessage">{room.activeChatPartner.name} has blocked you.</div> : null}*/}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
            <div className="chat-input-holder"><input type="text" 
                autoFocus  
                // disabled={partnerLeftNotification || blockedNotification ? true : false}
                className="chat-input" onChange={handleChange} 
                placeholder={Sefaria._("Send a Message")}
                dir={Sefaria.hebrew.isHebrew(chatMessage) || (chatMessage === "" && Sefaria.interfaceLang === "hebrew") ? "rtl" : "ltr"}></input>
            <input type="submit" 
            className={classNames({"chat-submit": 1, "chat-submit-blue": !!chatMessage, "chat-submit-hebrew": Sefaria.interfaceLang === "hebrew"})} 
            disabled={!chatMessage}
            value=""/>
            </div>
        </form>
    </div> : <LoadingMessage />
    )
}

const Message = ({user, message}) => {

    const messageDate = new Date(message.timestamp);
    const languageOption = Sefaria.interfaceLang === "hebrew" ? 'he-IL' : [];
    const parsedDateStamp =  messageDate.toLocaleDateString(languageOption);
    const parsedTimeStamp = messageDate.toLocaleTimeString(languageOption, {hour: '2-digit', minute: '2-digit' });
    const displayTimeStamp = parsedDateStamp === new Date().toLocaleDateString(languageOption) ? parsedTimeStamp : parsedDateStamp + ' ' + parsedTimeStamp;

    return (
        <div className="chatMessage">
                <ProfilePic len={35} url={user.pic} name={user.name} />
            <div className = "chatText">
                <div className="chatNameAndTime"><span>{user.name}</span>{"  "}<span>{displayTimeStamp}</span></div>
                <div dir={Sefaria.hebrew.isHebrew(message.message) ? "rtl" : "ltr"}>{message.message}</div> 
            </div>
        </div>
    )
}

const ChavrutaVideo = ({socket, chavrutaId, pcConfig, setCurrentScreen, activeChavruta, chavrutaOnline}) => {
    const localVideo = useRef();
    const remoteVideo = useRef();
    const [localStream, setLocalStream] = useState()
    const [audioEnabled, setAudioEnabled] = useState(true)
    let pc;
    let chavrutaTime = 0;

    const toggleMute = () => {
      const isAudioEnabled = localStream.getAudioTracks()[0].enabled;
      localStream.getAudioTracks()[0].enabled = !(isAudioEnabled)
      setAudioEnabled(!isAudioEnabled);
    }

    // Set up audio and video regardless of what devices are present.
    const sdpConstraints = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    };

    const endChavruta = () => {
        console.log('end call')
        setCurrentScreen("home")
    }

    const stopVideoTracks = () => {
        try {
            const stream = localVideo.current.srcObject;
            const tracks = stream.getTracks();

            tracks.forEach(function (track) {
                track.stop();
            });

            localVideo.current.srcObject = null;
        }
        catch (e) {
            console.log(e)
        }
    }

    const closeChavruta = () => {
            stopVideoTracks()
            socket.emit('chavruta closed', chavrutaId);
            setCurrentScreen("home");
    }

    const setVideoTracks = async () => {


        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          localVideo.current.srcObject = stream;
          setLocalStream(stream)
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              socket.emit("candidate", e.candidate, chavrutaId);
            }
          };
          pc.oniceconnectionstatechange = (e) => {
            if (!pc) {
                closeChavruta()
            }

            else if (pc.iceConnectionState == "failed") {
                pc.close();
                closeChavruta()
            }
              //"disconnected" could be a temporary state caused by any number of factors that could be automatically fixed w/o intervention
              // this gives the app a chance to re-establish the connection before restarting
            else if(pc.iceConnectionState == "disconnected") {
                    console.log("iceConnection is disconnected -- waiting 5 seconds to see if reconnects")
                    setTimeout(function(){
                    if (pc && pc.iceConnectionState == "disconnected") {
                        pc.close();
                        closeChavruta()
                    }
                }, 5000);
            }
          };
          pc.ontrack = (ev) => {
              remoteVideo.current.srcObject = ev.streams[0];
          };
          socket.emit("join_chavruta", {
            room: chavrutaId,
            id: Sefaria._uid
          });
        } catch (e) {
          console.error(e);
        }
    };


    const createOffer = async () => {
        console.log("create offer");
        try {
          const sdp = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(new RTCSessionDescription(sdp));
          socket.emit("offer", sdp, chavrutaId);
        } catch (e) {
          console.error(e);
        }
    };

    const createAnswer = async (sdp) => {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          console.log("answer set remote description success");
          const mySdp = await pc.createAnswer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true,
          });
          console.log("create answer");
          await pc.setLocalDescription(new RTCSessionDescription(mySdp));
          socket.emit("answer", mySdp, chavrutaId);
        } catch (e) {
          console.error(e);
        }
    };

    useEffect(() => {

        if (location.hostname !== 'localhost') {
         pc = new RTCPeerConnection(pcConfig);
        } else {
         pc = new RTCPeerConnection(null);
        }

        socket.on("room_full"), () => {
            pc.close
            alert("Room is full")
            setCurrentScreen("home")
        }

        socket.on("all_users", (allUsers) => {
          if (allUsers.length > 0) {
            createOffer();
          }
        });

        socket.on("getOffer", (sdp) => {
          //console.log(sdp);
          console.log("get offer");
          createAnswer(sdp);
        });

        socket.on("getAnswer", (sdp) => {
          console.log("get answer");
          pc.setRemoteDescription(new RTCSessionDescription(sdp));
          //console.log(sdp);
        });

        socket.on("getCandidate", async (candidate) => {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("candidate add success");
          }
        );

        socket.on("user_exit", () => {
            console.log()
            pc.close()
            console.log('user-exit')
            setCurrentScreen("home")
        }
        )

        setVideoTracks();

        let chavrutaTimeId = setInterval(function () {
            chavrutaTime = chavrutaTime + 1;
            console.log(chavrutaTime);
        }, 60000);

        return () => {
          if (pc) {
            pc.close();
          }

            stopVideoTracks()
            Sefaria.track.event("BeitMidrash", "Chavruta Ended", "Minutes Learned", chavrutaTime);
            clearInterval(chavrutaTimeId);
            socket.emit('chavruta closed', chavrutaId)
        };



    }, []);

    useEffect( () => {
        if (!chavrutaOnline) {
            if (pc) {
                pc.close();
            }
            closeChavruta()
        }
    }, [chavrutaOnline])



    return (

        <>
        {activeChavruta ?
        <>
            <div id="videos" className={audioEnabled ? "" : "muted"}>
                <video id="localVideo" ref={localVideo} className="flippedVideo pip" autoPlay playsInline disablePictureInPicture
                       muted></video>
                <video id="remoteVideo" ref={remoteVideo} poster={activeChavruta.pic} autoPlay playsInline disablePictureInPicture></video>

                <div id="buttonHolder">
                    <span id="micIcon">
                        <span id="enMute" className="muteButton int-en" tabIndex={0} title={!audioEnabled ? "Turn on microphone" : "Turn off microphone" } onClick={() => toggleMute()}></span>
                        <span id="heMute" className="muteButton int-he" tabIndex={0} title={!audioEnabled ? "הפעל את המיקרופון" : "כבה את המיקרופון" } onClick={() => toggleMute()}></span>
                    </span>
                    <span id="endCallIcon">
                        <span id="end-call" className="endCallButton" tabIndex={0} title={Sefaria._("End Call")} onClick={(e) => endChavruta(e)} role="link"></span>
                    </span>
                </div>

            </div>
            <div id="currentlyReadingContainer">
                {activeChavruta.currentlyReading ? <div className="currentlyReading">{activeChavruta.name} is {activeChavruta.currentlyReading.display} <a href={activeChavruta.currentlyReading.url}>{activeChavruta.currentlyReading.title}</a></div> : null }
            </div>

            <div className="chavrutaFooter">
                <p className="int-en">
                    Questions? Email <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
                </p>

                <p className="int-he">
                    לשאלות פנו/כתבו לדוא"ל <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
                </p>
            </div>
        </>

        : <LoadingMessage /> }
        </>
            )
}

export default BeitMidrash;