'use strict';

const socketIO = require('socket.io');
const fetch = require('node-fetch');
const jwt_decode = require('jwt-decode');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/chatrooms.db');
db.run(`DROP TABLE IF EXISTS "chatrooms"`);
console.log('creating and clearing db');
db.run(`CREATE TABLE IF NOT EXISTS "chatrooms" ("name"	TEXT UNIQUE, "clients"	INTEGER DEFAULT 0, "roomStarted"	INTEGER, PRIMARY KEY("name"));`)
const os = require('os');

const nodeStatic = require('node-static');
const http = require('http');

const PORT = process.env.PORT || 8080;
const fileServer = new(nodeStatic.Server)();
const app = http.createServer(function(req, res) {
    fileServer.serve(req, res);
    // console.log(req.headers)
}).listen(PORT);

const io = socketIO.listen(app);

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


io.sockets.on('connection', function(socket) {

  socket.on('message', function(message) {
    const roomId = (Object.keys(socket.rooms).filter(item => item!=socket.id))[0]
    socket.to(roomId).emit('message', message);
  });

  function createNewRoom(uid) {
    const room = Math.random().toString(36).substring(7);
    socket.join(room, () => {
      console.log(`${socket.id} created room ${room}`);
      socket.emit('created', room, socket.id);
      db.run(`INSERT INTO chatrooms(name, clients, roomStarted) VALUES(?, ?, ?)`, [room, uid, +new Date], function(err) {
        if (err) {
          console.log(err.message);
        }
      });
    });
  }

  socket.on('how many rooms', function(uid, lastChevrutaID) {
    socket.emit('creds', pcConfig)

    db.get(`SELECT COUNT(*) FROM chatrooms`, (err, rows) => {
      if (err) {
        return console.error(err.message);
      }

      let numRows = rows["COUNT(*)"];
      socket.broadcast.emit('return rooms', numRows);
      socket.emit('return rooms', numRows);
        console.log('trying to find a room...')
        db.all(`SELECT name, clients from chatrooms WHERE clients != 0 ORDER BY roomStarted`, [], (err, rows) => {

          if (err) {
            return console.error(err.message);
          }
          let foundRoom = false;
          let rowIndex = 0;

          while (foundRoom == false) {
            if (rows.length == rowIndex) {
              createNewRoom(uid);
              foundRoom = true;
            }
            else if (rows[rowIndex].clients == lastChevrutaID) {
              console.log('Client ID ' + socket.id + 'matched w/ the same chevrusa as last time')
              rowIndex++;
            }
            else {
              const room = rows[rowIndex].name;
              console.log(socket.id +' attempting to join room: '+ room)
              socket.join(room, () => {
                console.log('Client ID ' + socket.id + ' joined room ' + room);
                socket.to(room).emit('join', room);
                socket.emit('join', room);
                db.run(`UPDATE chatrooms SET clients=? WHERE name=?`, [0, room]);
              });
              foundRoom = true;
            }
          }
        });
    });
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

  socket.on('report user', function(room){
    socket.to(room).emit('user reported');
  });

  socket.on('bye', function(room){
    socket.leave(room, () => {
      console.log(`bye received from ${socket.id} for room ${room}`);
      db.run(`DELETE FROM chatrooms WHERE name=?`, room);
      socket.to(room).emit('message', 'bye');
      socket.emit('byeReceived');
    });
  });

  socket.on('send user info', function(userName, uid, room) {
    socket.to(room).emit('got user name', userName, uid);
  })

});
