import {
    InterfaceText,
    LoadingMessage,
    ProfilePic,
    FollowButton,
} from './Misc';
import React, { useState, useEffect, useRef } from 'react';
import Sefaria  from './sefaria/sefaria';
import classNames from 'classnames';
import $ from "./sefaria/sefariaJquery";

const BeitMidrash = ({socket, beitMidrashId, currentlyReading}) => {
    const [peopleInBeitMidrash, setPeopleInBeitMidrash] = useState(null);
    const [activeChatRooms, setActiveChatRooms] = useState([]);
    const [showBlockReportModal, setShowBlockReportModal] = useState(false);
    const [profile, setProfile] = useState({});
    const [currentChatRoom, setCurrentChatRoom] = useState("");
    const [currentScreen, setCurrentScreen] = useState("home");
    const [outgoingCall, setOutgoingCall] = useState(false);
    const [activeChavruta, setActiveChavruta] = useState(null)
    const [socketConnected, setSocketConnected] = useState(false);
    const [chavrutaOnline, setChavrutaOnline] = useState(false);
    const [socketObj, setSocketObj] = useState(socket);
    const [partnerLeftNotification, setPartnerLeftNotification] = useState(false);
    const [blockedUsers, setBlockedUsers] = useState(Sefaria.blocking)
    const [pcConfig, setPcConfig] = useState(null);
    const [usersWithUnreadMsgs, setUsersWithUnreadMsgs] = useState([])
    const [shouldUpdateChats, setShouldUpdateChats] = useState(false)
    const [userToBlock, setUserToBlock] = useState(null);

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

    const onCloseModal = () => {
        setUserToBlock(null);
        setShowBlockReportModal(false);
    }

    const onBlockUser = (user) => {
        setUserToBlock(user);
        setShowBlockReportModal(true);
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
        try {
            hj('event', 'entered_beit_midrash');
        } catch {
            console.error('hotjar failed - entered_beit_midrash')
        }
        socketObj.connect();

        socket.on('creds', function(conf) {
          console.log('got creds')
          setPcConfig(conf);
        });

        socketObj.on("connectionStarted", () => {setSocketConnected(true)})

        // socketObj.on("connection request", (user) => {
        //   console.log(user.uid)
        //   console.log(blockedUsers)
        //   if (!blockedUsers.includes(user.uid)) {
        //     chavrutaRequestReceived(user)
        //     const roomId = user.uid < Sefaria._uid ? `${user.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${user.uid}`
        //     setCurrentChatRoom(roomId)
        //   }
        // })

        socketObj.on("send connection rejection", ()=>{
            window.alert("User is not available.");
            setCurrentScreen("home")
        })

        socketObj.on("send call cancelled", ()=>{
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
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.slug, currentlyReading, beitMidrashId, true);
            }

            else {
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.slug, currentlyReading, beitMidrashId, false);
            }
        });
    }, [beitMidrashId, currentlyReading, currentScreen])

    useEffect(()=>{
        if (Sefaria._uid) {
            Sefaria.profileAPI(Sefaria.slug).then(profile => {
                setProfile(profile)
                socketObj.emit("enter beit midrash", Sefaria._uid, Sefaria.full_name, Sefaria.profile_pic_url, profile.slug, currentlyReading, beitMidrashId, false);
            });
        }
    }, [beitMidrashId])

    useEffect(() => {
        if(activeChavruta) {
            setChavrutaOnline(true);
        }
    }, [activeChavruta])

    useEffect(()=>{
      if (peopleInBeitMidrash) {
        setPeopleInBeitMidrash(filterDedupeAndSortPeople(peopleInBeitMidrash))
        setCurrentChatRoom("")
      }

      socketObj.off("connection request");
      socketObj.on("connection request", (user) => {
        console.log(user.uid)
        console.log(blockedUsers)
        if (!blockedUsers.includes(user.uid)) {
          chavrutaRequestReceived(user)
          const roomId = user.uid < Sefaria._uid ? `${user.uid}-${Sefaria._uid}`: `${Sefaria._uid}-${user.uid}`
          setCurrentChatRoom(roomId)
        }
      })

    }, [blockedUsers])


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
            room.me = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, slug: profile.slug};

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

        const me = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, slug: profile.slug}
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
            <BlockReportModal showBlockReportModal={showBlockReportModal} onClose={onCloseModal}
                setBlockedUsers={setBlockedUsers}
                setCurrentChatRoom={setCurrentChatRoom}
                user={userToBlock}
            />
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
            <>
                <ChavrutaCall
                    outgoingCall={outgoingCall}
                    activeChavruta={activeChavruta}
                    startChat={startChat}
                    setCurrentScreen={setCurrentScreen}
                    socket={socketObj}
                />
                <BeitMidrashFooter />
            </>
            :
            <>
                <ChavrutaVideo
                    socket={socketObj}
                    chavrutaId={currentChatRoom}
                    chavrutaOnline={chavrutaOnline}
                    pcConfig={pcConfig}
                    activeChavruta={activeChavruta}
                    setCurrentScreen={setCurrentScreen}
                />
                 {activeChatRooms.map(room => {
                    if (room.roomId === currentChatRoom) {
                        return <ChatBox
                            key={room.roomId}
                            room={room}
                            handleCloseChat={handleCloseChat}
                            chavrutaCallInitiated={chavrutaCallInitiated}
                            chavrutaRequestReceived={chavrutaRequestReceived}
                            activeChavruta={activeChavruta}
                            socket={socketObj}
                            shouldUpdateChats={shouldUpdateChats}
                            setShouldUpdateChats={setShouldUpdateChats}
                            markRead={markRead}
                            profile={profile}
                            partnerLeftNotification={partnerLeftNotification}
                            setPartnerLeftNotification={setPartnerLeftNotification}
                            onBlockUser={onBlockUser}
                            onUnblockUser={onUnblockUser}
                            hideHideButton={true}
                        />
                    }
                })}
                <BeitMidrashFooter />
            </>

            }
        </div> : <LoadingMessage/>
    )
}

const UserInBeitMidrash = ({user, userClasses, startChat, onBlockUser}) => {
  const [userDetailsOpen, setUserDetailsOpen] = useState(false);
  const userDetailsMenu = useRef();

  useEffect(()=>{
    userDetailsMenu.current.focus();
  }, [userDetailsOpen])

  return (
    <div className={classNames(userClasses)} key={user.uid} onClick={() => startChat(user)}>
        <ProfilePic len={42} url={user.pic} name={user.name} id="beitMidrashProfilePic"/>
        <div className="beitMidrashUserText">
            <div className="beitMidrashUserHeader">
            <div className="beitMidrashUserNameStatus">
            {user.name}
            {user.inChavruta ? <i className="fa fa-headphones" title={`${user.name} is current in a chavruta`}></i> : null}
            </div>
            <img src="/static/icons/ellipses.svg" className="userDetailsToggle" aria-label="toggle user details" onClick={()=>{setUserDetailsOpen(true)}}/>
            </div>
            <div
              tabIndex={0}
              onBlur={()=>{setUserDetailsOpen(false)}}
              className={userDetailsOpen ? "userDetailsMenu" : "userDetailsMenu hidden"}
              ref={userDetailsMenu}
            >
              <ul>
                <li onClick={() => {window.open(`/profile/${user.slug}`)}}>
                    <img src="/static/icons/profile.svg" aria-hidden="true"/><InterfaceText>View Profile</InterfaceText></li>
                <li>
                    <FollowButton
                              large={true}
                              uid={user.uid}
                              following={Sefaria.following.indexOf(user.uid) > -1}
                              classes="bm-follow-button"
                              icon={true}
                            />

                </li>
                  <li onClick={() => {onBlockUser(user)}}><img src="/static/icons/circle-backslash.svg" aria-hidden="true"/><InterfaceText>Mute & Report</InterfaceText></li>
              </ul>
            </div>

            <div
                className="beitMidrashOrg">{user.currentlyReading ? <a href={user.currentlyReading.url}><InterfaceText>{`is ${user.currentlyReading.display}`}</InterfaceText> {`${user.currentlyReading.title}`}</a> : null}</div>
        </div>
    </div>
  )
}

const BeitMidrashFooter = () => {
    return(<div className="beitMidrashHomeFooter">
            <p className="int-en">
                Questions? Email <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
            </p>

            <p className="int-he">
                לשאלות פנו/כתבו לדוא"ל <a href="mailto:hello@sefaria.org" target="_blank">hello@sefaria.org</a>
            </p>
        </div>
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
                <div className="peopleInBeitMidrashInnerContainer">
                {peopleInBeitMidrash && peopleInBeitMidrash.length > 1 ? peopleInBeitMidrash
                    .filter(user => !user.roomId)
                    .map(user => {
                        const userClasses = {
                            unreadMessages: usersWithUnreadMsgs.includes(user.uid),
                            beitMidrashUser: 1,
                        };

                        if (user.uid !== Sefaria._uid) {
                            return <UserInBeitMidrash
                                    user={user}
                                    userClasses={userClasses}
                                    startChat={startChat}
                                    onBlockUser={onBlockUser}
                                   />
                        } else {
                            return null
                        }
                    }) : <div className="noUsers"><InterfaceText>No users online.</InterfaceText></div>}
                </div>
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
        <BeitMidrashFooter />
    </div>)
}

const ChavrutaCall = ({outgoingCall, activeChavruta, setCurrentScreen, socket, startChat}) => {
    const handleCallAccepted = (uid) => {
        Sefaria.track.event("BeitMidrash", "Accepted Call", "");
        const room = Math.random().toString(36).substring(7);
        startChat(activeChavruta);
        socket.emit("send room ID to server", uid, room);
        setCurrentScreen("chavrutaVideo")
    }

    const handleCallDeclined = (uid) => {
        Sefaria.track.event("BeitMidrash", "Declined Call", "");
        socket.emit("connection rejected", uid);
        setCurrentScreen("home");
    }

    const callCancelled = (uid) => {
        Sefaria.track.event("BeitMidrash", "Call Cancelled", "");
        socket.emit("call cancelled", uid);
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
        <div className={outgoingCall ? "callContainer outgoing" : "callContainer incoming"}>
            <div>
                <ProfilePic len={330} url={activeChavruta.pic} name={activeChavruta.name} />
                {outgoingCall ? <div id="endCallButtonHolder">
                    <span id="endCallIcon"><span id="endCall" className="endCallButton"
                                                 onClick={() => callCancelled(activeChavruta.uid)}></span></span>
                </div> : null}
                <div className = "callText">
                    {outgoingCall ?
                        <span><InterfaceText>Calling</InterfaceText> {activeChavruta.name}...</span>
                    : <span>{activeChavruta.name} <InterfaceText>is calling you...</InterfaceText></span>
                    }
                </div>
            </div>
            {outgoingCall ? null :
                <div id="incomingCallButtonHolder">
                    <button id="acceptButton" onClick={() => handleCallAccepted(activeChavruta.uid)}>
                        <InterfaceText>Accept</InterfaceText></button>
                    <button id="declineButton" onClick={() => handleCallDeclined(activeChavruta.uid)}>
                        <InterfaceText>Decline</InterfaceText></button>
                </div>
            }
            <audio autoPlay loop src="/static/files/chavruta_ringtone.mp3" />
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
                hideHideButton,
                onBlockUser,
                onUnblockUser
                 }) => {

    const [chatMessage, setChatMessage] = useState("");
    const roomId = room.roomId;
    const chatBox = useRef();
    const [storedChatMessages, setStoredChatMessages] = useState(null)
    const [showChats, setShowChats] = useState(false)

    useEffect(()=>{
        socket.on("leaving chat room", ()=>{
            setPartnerLeftNotification(true);
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

        const msgSender = {uid: Sefaria._uid, name: Sefaria.full_name, pic: Sefaria.profile_pic_url, slug: profile.slug}
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
        {!hideHideButton ?
        <div id="hideButtonHolder">
            <div id="hideButton" onClick={()=>handleCloseChat(room)}><InterfaceText>Hide</InterfaceText>{" "}<img src="/static/img/downward_carrot.svg" /></div>
        </div> : null }
        {/*<details>*/}
        {/*<summary>*/}
        <div className="chatBoxHeader">

                <div id="chatUser">
                    <ProfilePic len={42} url={activeChavruta.pic} name={activeChavruta.name} />
                    <div className="chatBoxName">{activeChavruta.name}</div>
                </div>


            { activeChavruta.inChavruta ? null :
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

        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
            <div className="chat-input-holder">
                <input type="text"
                autoFocus
                className="chat-input" onInput={handleChange}
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
        <div className="chatMessage" data-hj-suppress>
                <ProfilePic len={34} url={user.pic} name={user.name} />
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
        </>

        : <LoadingMessage /> }
        </>
            )
}

const BlockReportModal = ({showBlockReportModal, onClose, setBlockedUsers, setCurrentChatRoom, user}) => {
    const modalStates = {
        initial: "initial",
        muteCompleted: "muteCompleted",
        muteFailed: "muteFailed"
    }
    const [modalState, setModalState] = useState(modalStates.initial)
    
    const blockDescription = {
        en: "Upon muting, you will no longer see this user in the Beit Midrash and you will no longer receive messages or receive video chat invitations from this user.",
        he: "אחרי ביצוע השתקה למשתמש זה, לא תראו עוד את המשתמש בבית המדרש ולא תקבלו יותר הודעות או הזמנות לשיחות וידאו ממשתמש זה."
    }
    const actionCompleteDescription = {
        en: "Your request has been completed. If you need further assistance, please email hello@sefaria.org.",
        he: "בקשתכם הושלמה. אם אתם זקוקים לעזרה נוספת, אנא פנו באימייל לכתובת hello@sefaria.org."
    }
    const muteFailedDescription = {
        en: "Mute Failed. If you need further assistance, please email hello@sefaria.org.",
        he: "Mute Failed. אם אתם זקוקים לעזרה נוספת, אנא פנו באימייל לכתובת hello@sefaria.org."
    }

    const closeAndReset = () => {
        setModalState(modalStates.initial);
        onClose();
    }
    const muteUser = () => {
        
     $.post("/api/block/" + user.uid, {}, data => {
            Sefaria.track.event("BeitMidrash", "Blocked User", user.uid);
            setBlockedUsers(uids => [...uids, user.uid])
            setCurrentChatRoom("");
            setModalState(modalStates.muteCompleted);
        }).fail(function (xhr, textStatus, errorThrown) {
            setModalState(modalStates.muteFailed); 
        });

        const feedback = {
          type: "beit_midrash_report",
          msg: `${Sefaria.full_name} (${Sefaria._uid}) reported ${user.name} (${user.uid}) in the BeitMidrash`,
          uid: Sefaria._uid,
          url: window.location.href,
        };
        const postData = {json: JSON.stringify(feedback)};
        const url = "/api/send_feedback";

        $.post(url, postData, function (data) {
          if (data.error) {
              console.log(data.error)
          } else {
              console.log(data)
          }
        }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
            alert(Sefaria._("Unfortunately, there was an error sending this feedback. Please try again or try reloading this page."));
        });
    }
      return (
        showBlockReportModal ? <div id="interruptingMessageBox" className="sefariaModalBox">
          <div id="interruptingMessageOverlay" onClick={onClose}></div>
          <div id="interruptingMessage" className="beitMidrashModalContentBox">
            <div className="sefariaModalContent">
              <h2 className="sans-serif sans-serif-in-hebrew">
                <InterfaceText>Mute</InterfaceText>
              </h2>
              <div className="beitMidrashModalInnerContent">
                <InterfaceText text={modalState === modalStates.muteCompleted ? actionCompleteDescription : modalState === modalStates.muteFailed ? muteFailedDescription : blockDescription}/>
              </div>
              <div className="buttonContainer">
              {modalState === modalStates.muteCompleted || modalState === modalStates.muteFailed ? 
              <button className="button dark-grey" onClick={onClose}><InterfaceText >Close</InterfaceText></button>
              : <>
                <button onClick={onClose} className="button light-grey control-elem" >
                    <InterfaceText>Cancel</InterfaceText>
                </button>
                <button onClick={muteUser} className="button red control-elem" >
                    <InterfaceText >Mute</InterfaceText>
                </button></>
              }
              </div>
            </div>
          </div>
        </div> : null
      );
}

export default BeitMidrash;
