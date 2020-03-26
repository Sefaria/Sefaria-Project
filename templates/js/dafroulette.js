{% autoescape off %}

'use strict';

const TURN_SERVER = 'turn:192.168.86.158:3478?transport=udp';

let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let localStream;
let pc;
let remoteStream;
let turnReady;

const pcConfig = {
  'iceServers': [{
      'urls': 'stun:stun.l.google.com:19302'
    },
    {
      'urls': TURN_SERVER,
      'credential': 'test',
      'username': 'test'
    }
  ]
};

// Set up audio and video regardless of what devices are present.
const sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var clientRoom;

const socket = io.connect('{{ rtc_server }}');


socket.emit('create or join');
console.log('Attempted to create or join room');

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
  clientRoom = room;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function(room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
  clientRoom = room;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

const localVideo = document.querySelector('#localVideo');
const remoteVideo = document.querySelector('#remoteVideo');

navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  })
  .then(gotStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });

function addAdditionalHTML() {
  const newRoomButton = document.createElement('div');
  var span = document.createElement('span');
  newRoomButton.innerHTML = '<button id="newRoom" onclick="location.reload();">New Person</button>';
  document.getElementById("buttonContainer").appendChild(newRoomButton)

  const iframe = document.createElement('iframe');
  iframe.src = "https://www.sefaria.org/todays-daf-yomi";
  document.getElementById("iframeContainer").appendChild(iframe)
}

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function() {
  socket.emit('bye', clientRoom);
};


/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    if (location.hostname !== 'localhost') {
      pc = new RTCPeerConnection(pcConfig);
    } else {
      pc = new RTCPeerConnection(null);
    }
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  let turnExists = false;
  for (let i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        const turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}


function hangup() {
  console.log('Hanging up.');
  stop();

  remoteVideo.srcObject = null;
  const newRoomButton = document.querySelector('#newRoom');
  newRoomButton.parentNode.removeChild(newRoomButton);
  const iframe = document.querySelector('iframe');
  iframe.parentNode.removeChild(iframe);

  socket.emit('bye', clientRoom);
}

function handleRemoteHangup() {
  socket.emit('bye', clientRoom);
  console.log('Session terminated.');
  location.reload()
  // newRoom();
}

function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}

function newRoom() {
  hangup()
  // socket.emit('new room');
  socket.emit('create or join');
  console.log('Attempted to create new room');
}

{% endautoescape %}
