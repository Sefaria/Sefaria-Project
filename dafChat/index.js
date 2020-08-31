'use strict';


// import various libraries
const socketIO = require('socket.io');
const fetch = require('node-fetch');
const jwt_decode = require('jwt-decode');
const sqlite3 = require('sqlite3').verbose();
const nodeStatic = require('node-static');
const http = require('http');

// initialize db
const db = new sqlite3.Database('./db/chatrooms.db');
db.run(`DROP TABLE IF EXISTS "chatrooms"`);
console.log('creating and clearing db');
db.run(`CREATE TABLE IF NOT EXISTS "chatrooms" ("name"	TEXT UNIQUE, "clients"	INTEGER DEFAULT 0, "roomStarted"	INTEGER, "namespace"	TEXT, PRIMARY KEY("name"));`)
const os = require('os');

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
const fileServer = new(nodeStatic.Server)();
const app = http.createServer(function(req, res) {
    fileServer.serve(req, res);
    // console.log(req.headers)
}).listen(PORT);

const io = socketIO.listen(app);



io.sockets.on('connection', function(socket) {

  socket.on('message', function(message, roomId) {
    socket.to(roomId).emit('message', message);
  });

  function createNewRoom(uid, namespace="dafRoulette", uroom=false) {
    const room = uroom ? uroom : Math.random().toString(36).substring(7);
    socket.join(room, () => {
      console.log(`${socket.id} created room ${room}`);
      socket.emit('created', room);
      db.run(`INSERT INTO chatrooms(name, clients, roomStarted, namespace) VALUES(?, ?, ?, ?)`, [room, uid, +new Date, namespace], function(err) {
        if (err) {
          console.log(err.message);
        }
      });
    });
  }




  socket.on('does room exist', function(roomID) {
    let sql = `SELECT name FROM chatrooms WHERE name = ?`;
    let room = roomID;
    db.get(sql, [room], (err, row) => {
      if (err) {
        console.error(err.message);
      }

      if (!row) {
        socket.emit('byeReceived');
      }
    });
  });


  //default private chevruta path
  socket.on('start chevruta', function(uid, room) {
    socket.emit('creds', pcConfig)


    db.get(`SELECT name, clients from chatrooms WHERE name = ? AND namespace = ?`, [room, "private"], (err, row) => {

      if (err) {
        return console.error(err.message);
      }

      if (!row) {
        createNewRoom(uid, "private", room);
      }

      else if (row.clients != 0) {
        console.log(socket.id +' attempting to join room: '+ room)
        socket.join(room, () => {
          console.log('Client ID ' + socket.id + ' joined room ' + room);
          socket.to(room).emit('join', room);
          socket.emit('join', room);
          db.run(`UPDATE chatrooms SET clients=? WHERE name=?`, [0, room]);
        })
      }

      else {
        socket.emit('room full');
      }

      });
  })





  // Default Roulette Pathway:
  socket.on('start roulette', function(uid, lastChevrutaID, namespace='dafRoulette' ) {
    socket.emit('creds', pcConfig)

    db.get(`SELECT COUNT(*) FROM chatrooms WHERE namespace=?`, [namespace], (err, rows) => {
      if (err) {
        return console.error(err.message);
      }

      if (namespace == 'dafRoulette') {
        let numRows = rows["COUNT(*)"];
        socket.broadcast.emit('return rooms', numRows);
        socket.emit('return rooms', numRows);
      }
        console.log('trying to find a room...')
        db.all(`SELECT name, clients from chatrooms WHERE clients != 0 AND namespace = ? ORDER BY roomStarted`, [namespace], (err, rows) => {

          if (err) {
            return console.error(err.message);
          }
          let foundRoom = false;
          let rowIndex = 0;

          while (foundRoom == false) {
            if (rows.length == rowIndex) {
              createNewRoom(uid, namespace);
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
    socket.to(room).emit('message', 'bye')
    socket.leave(room, () => {
        console.log(`bye received from ${socket.id} for room ${room}`);
        db.run(`DELETE FROM chatrooms WHERE name=?`, room);
        socket.emit('byeReceived');
    });
  });

  socket.on('send user info', function(userName, uid, room) {
    socket.to(room).emit('got user name', userName, uid);
  })

});
