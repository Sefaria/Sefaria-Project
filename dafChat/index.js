'use strict';


// import various libraries
const socketIO = require('socket.io');
const fetch = require('node-fetch');
const jwt_decode = require('jwt-decode');
const nodeStatic = require('node-static');
const http = require('http');

// configure Turn & Stun servers:
const TURN_SERVER = `turn:${process.env.TURN_SERVER}?transport=udp`;
const pcConfig = {
  'iceServers': [{
      'urls': 'stun:stun.l.google.com:19302'
    },
    {
      'urls': TURN_SERVER,
      'credential': process.env.TURN_USER,
      'username': process.env.TURN_SECRET
    }
  ]
};

//setup static server and initialize sockets
const PORT = process.env.PORT || 8080;

const httpServer = require("http").createServer((req, res) => {
    res.write('The DafRoulette WebRTC Server lives here.'); //write a response to the client
    res.end(); //end the response
});

const io = require("socket.io")(httpServer, {
  cors: {
    origin: [
        "http://localhost:8000",
        "http://0.0.0.0:8000",
        "https://www.sefaria.org",
        "https://www.sefaria.org.il",
        "https://chavruta.cauldron.sefaria.org",
        /\.sefaria\.org$/,
        /\.sefaria\.org.il$/
    ],
    methods: ["GET", "POST"]
  }
});

httpServer.listen(PORT)

//initialize global object for holding data on video chat rooms
const chavrutot = {}
//initialize global object for data on people in beit midrash
const peopleInBeitMidrash = {};

// globals for chavruta
  let users = {};
  let maximum = 2;



io.on("connection", (socket) => {
  console.log(socket.id, socket.conn.remoteAddress, "connected")

  //--------------------BEIT MIDRASH CODE-------------------------

  socket.emit("connectionStarted");

  let disconnectHandler = {};

  function addUserToBeitMidrash(uid, fullName, profilePic, slug, currentlyReading, beitMidrashId, socketId, inChavruta) {

    const existingSocketIdForUser = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);

    peopleInBeitMidrash[socketId] = {}
    peopleInBeitMidrash[socketId]["uid"] = uid;
    peopleInBeitMidrash[socketId]["name"] = fullName;
    peopleInBeitMidrash[socketId]["pic"] = profilePic;
    peopleInBeitMidrash[socketId]["slug"] = slug
    peopleInBeitMidrash[socketId]["beitMidrashId"] = beitMidrashId;
    peopleInBeitMidrash[socketId]["currentlyReading"] = currentlyReading;
    peopleInBeitMidrash[socketId]["inChavruta"] = inChavruta;

    console.log("user added to beit midrash, current peopleInBeitMidrash:", peopleInBeitMidrash)

    if (existingSocketIdForUser) {
      delete peopleInBeitMidrash[existingSocketIdForUser];

      socket.to(existingSocketIdForUser).emit('duplicate user');

      console.log('deleted duplicate user')
    }

    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash), uid);
    socket.emit("change in people", Object.values(peopleInBeitMidrash), uid);

    clearTimeout(disconnectHandler[uid])
  }

  socket.on("update currently reading", (uid, currentlyReading) => {
    if (!peopleInBeitMidrash[socket.id]) return
    console.log(uid, ": ", currentlyReading)
    peopleInBeitMidrash[socket.id]["currentlyReading"] = currentlyReading;
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash), uid);
    socket.emit("change in people", Object.values(peopleInBeitMidrash), uid);
  })

  socket.on("enter beit midrash", (uid, fullName, profilePic, slug, currentlyReading, beitMidrashId, inChavruta)=> {
    console.log(uid, ": ", "entered the beit midrash")
    addUserToBeitMidrash(uid, fullName, profilePic, slug, currentlyReading, beitMidrashId, socket.id, inChavruta)
    socket.emit('creds', pcConfig)
  });

  socket.on("connect with other user", (uid, user) => {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);
    socket.to(socketId).emit('connection request', user);
  });

  socket.on("connection rejected", (uid) =>{
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);
    socket.to(socketId).emit("send connection rejection")
  });

  socket.on("call cancelled", (uid) =>{
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);
    socket.to(socketId).emit("send call cancelled")
  });


  socket.on("send room ID to server", (uid, roomId)=> {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);
    socket.to(socketId).emit("send room ID to client", roomId)
  });

  socket.on("send chat message", (room) => {
    if (!socket.rooms.has(room.roomId)) {
      socket.join(room.roomId)
    }
    const socketIdsOfMsgReceiver = Object.keys(peopleInBeitMidrash).filter(key => peopleInBeitMidrash[key]["name"] === room.activeChatPartner.name);
    const msgSender = peopleInBeitMidrash[socket.id]
    if (msgSender) {
      socketIdsOfMsgReceiver.forEach(socketId => {
        console.log(`sending chat message to ${socketId} from ${msgSender.name}`)
        socket.to(socketId).emit("received chat message", msgSender, room)
      })
    }

  });

  socket.on("join chat room", (room) => {
    socket.join(room.roomId)
  })

  const leaveBeitMidrash = (socketId) => {
    //remove user from beit midrash and update listing for clients
    delete peopleInBeitMidrash[socketId];
    console.log("user left beit midrash, current peopleInBeitMidrash:", peopleInBeitMidrash)
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
  }

  socket.on("disconnecting", (reason)=> {
      console.log(`${socket.id} ${peopleInBeitMidrash[socket.id] ? peopleInBeitMidrash[socket.id].name : ""} is disconnecting from rooms`, socket.rooms, `due to ${reason}`)

    //notify open chats that user left
    const roomArray = Array.from(socket.rooms);
    roomArray.forEach(room =>  {
      if (room !== socket.id) {
        socket.to(room).emit("leaving chat room")
      }
    })

    const socketId = socket.id;
    if (peopleInBeitMidrash[socketId]) {
      disconnectHandler[peopleInBeitMidrash[socketId]["uid"]] = setTimeout((sockedId) => {
        leaveBeitMidrash(socketId)
      }, 2000)
    }

  })

  //---------------------------------------------------------------------------------
  //----------------end of Beit Midrash code, start of RTC code----------------------
  //---------------------------------------------------------------------------------



  socket.on("candidate", (candidate, chavrutaId) => {
    console.log("candidate: " + socket.id);
    socket.to(chavrutaId).emit("getCandidate", candidate);
  });

  socket.on("join_chavruta", (data) => {
    try {
      peopleInBeitMidrash[socket.id]["inChavruta"] = true;
    }
    catch (e) {
      console.log(e)
    }
    console.log(users[data.room])
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
    socket.emit("change in people", Object.values(peopleInBeitMidrash));

    if (users[data.room]) {
      console.log(1)
      const length = users[data.room].length;
      if (length === maximum) {
        socket.to(socket.id).emit("room_full");
        return;
      }
      users[data.room].push({ id: socket.id, sid: data.id });
    } else {
      console.log(2)
      users[data.room] = [{ id: socket.id, sid: data.id }];
    }

    socket.join(data.room);

    const usersInThisRoom = users[data.room].filter(
      (user) => user.id !== socket.id
    );


    io.sockets.to(socket.id).emit("all_users", usersInThisRoom);
  });


  socket.on("offer", (sdp, chavrutaId) => {
    console.log("offer: " + socket.id);
    socket.to(chavrutaId).emit("getOffer", sdp);
  });

  socket.on("answer", (sdp, chavrutaId) => {
    console.log("answer: " + socket.id);
    socket.to(chavrutaId).emit("getAnswer", sdp);
  });


  socket.on("chavruta closed", (roomID) => {
    peopleInBeitMidrash[socket.id]["inChavruta"] = false;
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
    socket.emit("change in people", Object.values(peopleInBeitMidrash));

    if (users[roomID]) {
      delete users[roomID];
    }
    socket.to(roomID).emit("user_exit");
    console.log("users", users);
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('rejoin chavruta room', (room) => {
    socket.join(room)
  })

});
