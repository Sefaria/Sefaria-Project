import {
    InterfaceText,
    LoadingMessage,
    ProfilePic
} from './Misc';
import React, { useState, useEffect, useRef } from 'react';
import Sefaria  from './sefaria/sefaria';
import classNames from 'classnames';
import { BroadcastChannel } from 'broadcast-channel';

const BeitMidrash = ({socket, beitMidrashId, currentlyReading}) => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChatRooms, setActiveChatRooms] = useState([]);
    const [profile, setProfile] = useState({});
    const [currentChatRoom, setCurrentChatRoom] = useState("");
    const [currentScreen, setCurrentScreen] = useState("home");
    const [outgoingCall, setOutgoingCall] = useState(false);
    const [activeChavruta, setActiveChavruta] = useState(null)
    const [socketConnected, setSocketConnected] = useState(false);
    const [socketObj, setSocketObj] = useState(socket);
    const [partnerLeftNotification, setPartnerLeftNotification] = useState(false);
    const chatChannel = new BroadcastChannel('chavruta-chats');
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
        setShouldUpdateChats(true)
    }

    useEffect(() => {
        socketObj.connect();

        socket.on('creds', function(conf) {
          console.log('got creds')
          setPcConfig(conf);
        });


        socketObj.on("connectionStarted", () => {setSocketConnected(true)})

        //user B receives connection request
        socketObj.on("connection request", (user) => {
            chavrutaRequestReceived(user)
            const roomId = user.uid < Sefaria._uid ? `${user.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${user.uid}`
            setCurrentChatRoom(roomId)

        })
        //sends rejection to user A
        socketObj.on("send connection rejection", ()=>{
            window.alert("User is not available.");
            setCurrentScreen("home")
        })
        //user A gets acceptance alert
        socketObj.on("send room ID to client", (room)=> {
            setCurrentScreen("chavrutaVideo")
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


    useEffect(()=> {
        socketObj.on("change in people", function(people, uid) {
            setPeopleInBeitMidrash(filterDedupeAndSortPeople(people));

            let roomIdToCheck = uid < Sefaria._uid ? `${uid}-${Sefaria._uid}`: `${Sefaria._uid}-${uid}`;

            if (currentChatRoom === roomIdToCheck) {
                setPartnerLeftNotification(false)
            }
        })
    }, [currentChatRoom, beitMidrashId, blockedUsers])

    useEffect(()=>{
       socketObj.off("received chat message")

       socketObj.on("received chat message", (msgSender, room) => {
            room.activeChatPartner = msgSender;
            room.me = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization};

            if(!blockedUsers.includes(msgSender.uid)) {

                processMessage(msgSender.uid, room);
                const currentActiveChatRoomIds = activeChatRooms.map(r => {return r.roomId});
     
                if (!currentActiveChatRoomIds.includes(room.roomId)) {
                    setActiveChatRooms([room]);
                    socketObj.emit("join chat room", room);
                };
                // setCurrentChatRoom(room.roomId);
            } else {
                socketObj.emit("user is blocked", msgSender);
            }
        })


    }, [activeChatRooms, blockedUsers])

    useEffect(()=>{
        chatChannel.onmessage = (msg) => {
            console.log('chat channel', msg)
            const currentActiveChatRoomIds = activeChatRooms.map(r => {return r.roomId});
      
            if (!currentActiveChatRoomIds.includes(msg.room.roomId)) {
                setActiveChatRooms([msg.room]);
                socketObj.emit("join chat room", msg.room);
            };
            processMessage(msg.msgSender.uid, msg.room)
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

    const startChat = (activeChatPartner) => {
        setUsersWithUnreadMsgs(usersWithUnreadMsgs.filter(users => users !== activeChatPartner.uid));
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
        setCurrentScreen("callingChavruta")
        setOutgoingCall(true)
    }

    const chavrutaRequestReceived = (user) => {
        setActiveChavruta(user)
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
                        setShouldUpdateChats
                        }) => {

    return (<div className="beitMidrashHomeContainer">
            {/*<div id="newCall"><a href="/chavruta"><img src="/static/img/camera_with_plus.svg" id="newCallImg" /><span>New Call</span></a></div>*/}
            <div id="beitMidrashHeader">Beit Midrash</div>
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
                                        className="beitMidrashOrg">{user.currentlyReading !== "" ? `is learning ${user.currentlyReading}` : ""}</div>
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
    const handleCallAccepted = (name) => {
        const room = Math.random().toString(36).substring(7);
        socket.emit("send room ID to server", name, room);
        setCurrentScreen("chavrutaVideo")
    }

    const handleCallDeclined = (name) => {
        socket.emit("connection rejected", name);
        setCurrentScreen("home");
    }

    const endCall = (name) => {
        socket.emit("connection rejected", name);
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
                    <span id="endCallIcon"><span id="endCall" className="endCallButton" onClick={()=>endCall(activeChavruta.name)}></span></span>
                </div>
                <div className = "callText">Calling {activeChavruta.name}...</div>
            </div>
            <audio autoPlay loop src="/static/files/chavruta-ringtone.wav" />
            <div className="chavrutaFooter">Questions? Email <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></div>
        </div> : 
        <div className="callContainer">
            <div>
                <ProfilePic len={300} url={activeChavruta.pic} name={activeChavruta.name} />
                <div className = "callText">Receiving call from {activeChavruta.name}...</div>
                <div id="incomingCallButtonHolder">
                    <button id="acceptButton" onClick={()=> handleCallAccepted(activeChavruta.name)}>Accept</button>
                    <button id="declineButton" onClick={()=> handleCallDeclined(activeChavruta.name)}>Decline</button>
                </div>
            </div>
            <audio autoPlay loop src="/static/files/chavruta-ringtone.wav" />
            <div className="chavrutaFooter">Questions? Email <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></div>
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
        const lastMessage = chatBox.current.querySelector(".chatMessage:last-of-type")
        if (lastMessage) {
            lastMessage.scrollIntoView()
        }

    }, [storedChatMessages, partnerLeftNotification, showChats])

    const handleChange = (e) =>{
        setChatMessage(e.target.value);
    }
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const now = Date.now()
        socket.emit("send chat message", room);
        
        const roomId = room.roomId;
      
        const chatChannel = new BroadcastChannel('chavruta-chats');
        const msgSender = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, organization: profile.organization}
        
        chatChannel.postMessage({msgSender, room, chatMessage, now})

        Sefaria.chatMessageAPI(roomId, Sefaria._uid, Date.now(), chatMessage).then( (res)=> {console.log(res)} )
        
        // We thought we needed this to add to chatdatastore on submit, but the broadcast api appears to add it anyway
        // even though we think it's not supposed to!
        // So for the moment we will comment this out, but 
        // TODO: ensure this doesn't need to be added back in
        //
        // setChatDataStore({...chatDataStoreRef.current, [roomId]: {...chatDataStoreRef.current[roomId], 
        //        messages: [...chatDataStoreRef.current[roomId].messages, {
        //         senderId: Sefaria._uid,
        //         message: chatMessage,
        //         timestamp: now
        //     }]}
        //    });
        
        e.target.reset();
        setChatMessage("")
    }

    const handleStartCall = (uid) => {
        socket.emit("connect with other user", uid, {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url});
        chavrutaCallInitiated(uid)
    }
    return (activeChavruta ?
    <div className="chat" ref={chatBox}>
        <div id="hideButtonHolder">
            <div id="hideButton" onClick={()=>handleCloseChat(room)}>Hide{" "}<img src="/static/img/downward_carrot.svg" /></div>
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
            <input type="text" 
                autoFocus  
                // disabled={partnerLeftNotification || blockedNotification ? true : false}
                className="chat-input" onChange={handleChange} 
                placeholder="Send a Message"
                dir={Sefaria.hebrew.isHebrew(chatMessage) ? "rtl" : "ltr"}></input>
            <input type="submit" 
            className={chatMessage? "chat-submit chat-submit-blue" : "chat-submit"} 
            disabled={!chatMessage}
            value=""/>
        </form>
    </div> : <LoadingMessage />
    )
}

const Message = ({user, message}) => {

    const parsedTimeStamp = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit' })

    return (
        <div className="chatMessage">
                <ProfilePic len={35} url={user.pic} name={user.name} />
            <div className = "chatText">
                <div className="chatNameAndTime"><span>{user.name}</span>{"  "}<span>{parsedTimeStamp}</span></div>
                <div dir={Sefaria.hebrew.isHebrew(message.message) ? "rtl" : "ltr"}>{message.message}</div> 
            </div>
        </div>
    )
}

const ChavrutaVideo = ({socket, chavrutaId, pcConfig, setCurrentScreen, activeChavruta}) => {
    const localVideo = useRef();
    const remoteVideo = useRef();
    const [localStream, setLocalStream] = useState()
    const [audioEnabled, setAudioEnabled] = useState(true)
    let pc;

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
      const stream = localVideo.current.srcObject;
      const tracks = stream.getTracks();

      tracks.forEach(function(track) {
        track.stop();
      });

      localVideo.current.srcObject = null;
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
            console.log(e);
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

    useEffect( () => {
        console.log(activeChavruta)
    }, [activeChavruta])


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

        return () => {
          if (pc) {
            pc.close();
          }

            stopVideoTracks()
            socket.emit('chavruta closed', chavrutaId)
        };



    }, []);



    return (
        <div>
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
                        <span id="end-call" className="endCallButton int-en" tabIndex={0} title="End Call" onClick={(e) => endChavruta(e)} role="link"></span>
                    </span>
                </div>

            </div>

            {/*<div className="beitMidrashOrg">{activeChavruta.currentlyReading !== "" ? `${activeChavruta.name} is learning ${activeChavruta.currentlyReading}` : ""}</div>*/}



            {/*<div id="chevrutaNameHolder">{activeChavruta.name}</div>*/}
            {/*<div id="currently-reading"></div>*/}

            {/*<div id="waiting">*/}
            {/*    Waiting for someone to join...*/}
            {/*    <p className="int-en">*/}
            {/*        Share this link with your chavruta to start a video call*/}
            {/*    </p>*/}

            {/*    <p className="int-he">*/}
            {/*        Share this link with your chavruta to start a video call*/}
            {/*    </p>*/}

            {/*</div>*/}


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

export default BeitMidrash;