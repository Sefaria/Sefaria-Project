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

io.on("connection", (socket) => {
  console.log(socket.id, socket.conn.remoteAddress, "connected")
  
  //--------------------BEIT MIDRASH CODE-------------------------

  socket.emit("connectionStarted");

  let disconnectHandler;

  function addUserToBeitMidrash(uid, fullName, profilePic, organization, beitMidrashId, socketId) {
    peopleInBeitMidrash[socketId] = {}
    peopleInBeitMidrash[socketId]["uid"] = uid;
    peopleInBeitMidrash[socketId]["name"] = fullName;
    peopleInBeitMidrash[socketId]["pic"] = profilePic;
    peopleInBeitMidrash[socketId]["organization"] = organization
    peopleInBeitMidrash[socketId]["beitMidrashId"] = beitMidrashId;

    console.log("user added to beit midrash, current peopleInBeitMidrash:", peopleInBeitMidrash)
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash), uid);
    socket.emit("change in people", Object.values(peopleInBeitMidrash), uid);

    clearTimeout(disconnectHandler)
  }

  socket.on("enter beit midrash", (uid, fullName, profilePic, organization, beitMidrashId)=> addUserToBeitMidrash(uid, fullName, profilePic, organization, beitMidrashId, socket.id));

  socket.on("connect with other user", (uid, user) => {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["uid"] === uid);
    socket.broadcast.to(socketId).emit('connection request', user);
  });

  socket.on("connection rejected", (name) =>{
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["name"] === name);
    socket.broadcast.to(socketId).emit("send connection rejection")
  });

  socket.on("send room ID to server", (name, roomId)=> {
    const socketId = Object.keys(peopleInBeitMidrash).find(key => peopleInBeitMidrash[key]["name"] === name);
    socket.broadcast.to(socketId).emit("send room ID to client", roomId)
  });

  socket.on("send chat message", (room, message) => {
    if (!socket.rooms.has(room.roomId)) {
      socket.join(room.roomId)
    }
    const socketIdsOfMsgReceiver = Object.keys(peopleInBeitMidrash).filter(key => peopleInBeitMidrash[key]["name"] === room.userB.name);
    const msgSender = peopleInBeitMidrash[socket.id]
    if (msgSender) {
      socketIdsOfMsgReceiver.forEach(socketId => {
        console.log(`sending chat message to ${socketId} from ${msgSender.name}: ${message}`)
        socket.to(socketId).emit("received chat message", msgSender, message, room)
      })
    }
  });

  socket.on("join chat room", (room) => {
    socket.join(room.roomId)
  })

  const leaveBeitMidrash = (socketId) => {
    //remove user from beit midrash and update listing for clients
    delete peopleInBeitMidrash[socketId];
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
  }

  socket.on("disconnecting", (reason)=> {
      console.log(`${socket.id} ${peopleInBeitMidrash[socket.id] ? peopleInBeitMidrash[socket.id].name : ""} is disconnecting from rooms`, socket.rooms, `due to ${reason}`)

    //notify open chats that user left
    const roomArray = Array.from(socket.rooms);
    console.log("roomArray", roomArray)
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

  socket.on('message', function(message, roomId) {
    socket.to(roomId).emit('message', message);
  }); //general function for sending messages from one client to another in Chavruta

  function createNewChavruta(uid, namespace="dafRoulette", uroom=false) {
    const room = uroom ? uroom : Math.random().toString(36).substring(7);
    socket.join(room);
    console.log(`${socket.id} created room ${room}`);
    socket.emit('created', room);
    chavrutot[room] = {peopleInChavruta: [uid], roomStarted: Date.now(), namespace: namespace}
  }

  socket.on('does room exist', function(roomId, uid) {
    if (chavrutot[roomId]) {
      if (chavrutot[roomId].peopleInChavruta.length < 2 && chavrutot[roomId].peopleInChavruta[0] !== uid) {
        socket.emit('byeReceived');
      } 
    } else {
      socket.emit('byeReceived');
    }

  });


  //default private chevruta path
  socket.on('start chevruta', function(uid, room) {
    socket.emit('creds', pcConfig)
    
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





  // Default Roulette Pathway:
  // socket.on('start roulette', function(uid, lastChevrutaID, namespace='dafRoulette' ) {
  //   socket.emit('creds', pcConfig)

  //   db.get(`SELECT COUNT(*) FROM chatrooms WHERE namespace=?`, [namespace], (err, rows) => {
  //     if (err) {
  //       return console.error(err.message);
  //     }

  //     if (namespace == 'dafRoulette') {
  //       let numRows = rows["COUNT(*)"];
  //       socket.broadcast.emit('return rooms', numRows);
  //       socket.emit('return rooms', numRows);
  //     }
  //       console.log('trying to find a room...')
  //       db.all(`SELECT name, clients from chatrooms WHERE clients != 0 AND namespace = ? ORDER BY roomStarted`, [namespace], (err, rows) => {

  //         if (err) {
  //           return console.error(err.message);
  //         }
  //         let foundRoom = false;
  //         let rowIndex = 0;

  //         while (foundRoom == false) {
  //           if (rows.length == rowIndex) {
  //             createNewChavruta(uid, namespace);
  //             foundRoom = true;
  //           }
  //           else if (rows[rowIndex].clients == lastChevrutaID) {
  //             console.log('Client ID ' + socket.id + 'matched w/ the same chevrusa as last time')
  //             rowIndex++;
  //           }
  //           else {
  //             const room = rows[rowIndex].name;
  //             console.log(socket.id +' attempting to join room: '+ room)
  //             socket.join(room);
  //             console.log('Client ID ' + socket.id + ' joined room ' + room);
  //             socket.to(room).emit('join', room);
  //             socket.emit('join', room);
  //             db.run(`UPDATE chatrooms SET clients=? WHERE name=?`, [0, room]);
              
  //             foundRoom = true;
  //           }
  //         }
  //       });
  //   });
  // });

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
    peopleInBeitMidrash[socket.id]["roomId"] = room; 
    socket.to(room).emit('got user name', userName, uid);
    socket.broadcast.emit("change in people", Object.values(peopleInBeitMidrash));
    socket.emit("change in people", Object.values(peopleInBeitMidrash));
  })

  socket.on('send sources', function(msg, name, room) {
    console.log(room, msg["currentlyReading"])
    socket.to(room).emit('got sources', msg, name);
  })

});
