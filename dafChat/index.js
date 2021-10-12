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
  let socketToRoom = {};



io.on("connection", (socket) => {
  console.log(socket.id, socket.conn.remoteAddress, "connected")
  
  //--------------------BEIT MIDRASH CODE-------------------------

  socket.emit("connectionStarted");

  let disconnectHandler;

  function addUserToBeitMidrash(uid, fullName, profilePic, organization, currentlyReading, beitMidrashId, socketId) {
    peopleInBeitMidrash[socketId] = {}
    peopleInBeitMidrash[socketId]["uid"] = uid;
    peopleInBeitMidrash[socketId]["name"] = fullName;
    peopleInBeitMidrash[socketId]["pic"] = profilePic;
    peopleInBeitMidrash[socketId]["organization"] = organization
    peopleInBeitMidrash[socketId]["beitMidrashId"] = beitMidrashId;
    peopleInBeitMidrash[socketId]["currentlyReading"] = currentlyReading;

    // console.log("user added to beit midrash, current peopleInBeitMidrash:", peopleInBeitMidrash)
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash), uid);
    socket.emit("change in people", Object.values(peopleInBeitMidrash), uid);

    clearTimeout(disconnectHandler)
  }

  socket.on("update currently reading", (uid, currentlyReading) => {
    if (!peopleInBeitMidrash[socket.id]) return
    // console.log(uid, ": ", currentlyReading)
    peopleInBeitMidrash[socket.id]["currentlyReading"] = currentlyReading;
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash), uid);
    socket.emit("change in people", Object.values(peopleInBeitMidrash), uid);
  })

  socket.on("enter beit midrash", (uid, fullName, profilePic, organization, currentlyReading, beitMidrashId)=> {
    addUserToBeitMidrash(uid, fullName, profilePic, organization, currentlyReading, beitMidrashId, socket.id)
    socket.emit('creds', pcConfig)
  });

  socket.on("connect with other user", (uid, user) => {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);
    socket.to(socketId).emit('connection request', user);
  });

  socket.on("connection rejected", (name) =>{
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["name"] === name);
    socket.to(socketId).emit("send connection rejection")
  });

  socket.on("send room ID to server", (name, roomId)=> {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["name"] === name);
    socket.to(socketId).emit("send room ID to client", roomId)
  });

  socket.on("send chat message", (room, message) => {
    if (!socket.rooms.has(room.roomId)) {
      socket.join(room.roomId)
    }
    const socketIdsOfMsgReceiver = Object.keys(peopleInBeitMidrash).filter(key => peopleInBeitMidrash[key]["name"] === room.userB.name);
    const msgSender = peopleInBeitMidrash[socket.id]
    if (msgSender) {
      socketIdsOfMsgReceiver.forEach(socketId => {
        // console.log(`sending chat message to ${socketId} from ${msgSender.name}: ${message}`)
        socket.to(socketId).emit("received chat message", msgSender, message, room)
      })
    }
    
  });

  socket.on("join chat room", (room) => {
    socket.join(room.roomId)
  })

  socket.on("user is blocked", (blockee) => {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === blockee.uid);
    socket.to(socketId).emit("you have been blocked")
  })

  const leaveBeitMidrash = (socketId) => {
    //remove user from beit midrash and update listing for clients
    delete peopleInBeitMidrash[socketId];
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
  }

  socket.on("disconnecting", (reason)=> {
      // console.log(`${socket.id} ${peopleInBeitMidrash[socket.id] ? peopleInBeitMidrash[socket.id].name : ""} is disconnecting from rooms`, socket.rooms, `due to ${reason}`)

    //notify open chats that user left
    const roomArray = Array.from(socket.rooms);
    roomArray.forEach(room =>  {
      if (room !== socket.id) {
        socket.to(room).emit("leaving chat room")
      }
    })

    const socketId = socket.id;
    disconnectHandler = setTimeout((sockedId) => {
      leaveBeitMidrash(socketId)
    }, 750)
   
  })

  //---------------------------------------------------------------------------------
  //----------------end of Beit Midrash code, start of RTC code----------------------
  //---------------------------------------------------------------------------------



  socket.on("candidate", (candidate, chavrutaId) => {
    console.log("candidate: " + socket.id);
    socket.to(chavrutaId).emit("getCandidate", candidate);
  });

  socket.on("join_chavruta", (data) => {
    console.log(users[data.room])
    if (users[data.room]) {
      console.log(1)
      const length = users[data.room].length;
      if (length === maximum) {
        socket.to(socket.id).emit("room_full");
        return;
      }
      users[data.room].push({ id: socket.id });
    } else {
      console.log(2)
      users[data.room] = [{ id: socket.id }];
    }
    socketToRoom[socket.id] = data.room;
    console.log(users)
    console.log(socketToRoom)

    socket.join(data.room);

    const usersInThisRoom = users[data.room].filter(
      (user) => user.id !== socket.id
    );

    console.log(usersInThisRoom);

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


  socket.on("chavruta closed", () => {
    console.log(`[${socketToRoom[socket.id]}]: ${socket.id} exit`);
    const roomID = socketToRoom[socket.id];
    let room = users[roomID];
    console.log(room)
    if (room) {
      room = room.filter((user) => user.id !== socket.id);
      users[roomID] = room;
      if (room.length === 0) {
        delete users[roomID];
        return;
      }
    }
    socket.to(roomID).emit("user_exit");
    console.log(users);
  });


  //default private chevruta path
  socket.on('start chevruta', function(uid, room) {

    if (chavrutot[room]) {
      if (chavrutot[room].peopleInChavruta.length === 1) {
        console.log(socket.id +' attempting to join room: '+ room)
        socket.join(room)
        console.log('Client ID ' + socket.id + ' joined room ' + room);
        socket.to(room).emit('join', room);
        socket.emit('join', room);
        chavrutot[room].peopleInChavruta.push(uid)
      } else if (chavrutot[room].peopleInChavruta.length > 1) {
        socket.emit('room full');
      }
    } else {
      createNewChavruta(uid, "private", room);
    }
  })

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

  socket.on('report user', function(room){
    socket.to(room).emit('user reported');
  });

  socket.on('bye', function(room){
    socket.to(room).emit('message', 'bye')
    socket.leave(room);
    console.log(`bye received from ${socket.id} for room ${room}`);
    delete chavrutot[room];
    socket.emit('byeReceived');
  });

  socket.on('send user info', function(userName, uid, room) {
    socket.to(room).emit('got user name', userName, uid);
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
    socket.emit("change in people", Object.values(peopleInBeitMidrash));
  })

  socket.on('send sources', function(msg, name, room) {
    console.log("received sources", room, msg["currentlyReading"])
    socket.to(room).emit('got sources', msg, name);
  })

  socket.on('rejoin room', (room) => {
    socket.join(room)
  })

});
