{% autoescape off %}

'use strict';


let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let localStream;
let pc;
let remoteStream;
let turnReady;
let pcConfig;

// Set up audio and video regardless of what devices are present.
const sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var clientRoom;

const socket = io.connect('https://{{ rtc_server }}');

socket.on('cred', function(conf) {
  pcConfig = conf;
});

socket.on('return rooms', function(numRooms) {
  document.getElementById("numberOfChevrutas").innerHTML = numRooms;
});


socket.on('route new user', function(numRooms){
  document.getElementById("numberOfChevrutas").innerHTML = numRooms;

  if (numRooms == 1) {
    socket.emit('create or join', true);
  }

  else {
    socket.emit('create or join');
  }
})

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
  console.log('another user joined room: ' + room);
  Sefaria.track.event("DafRoulette", "Chevruta Match Made", "initator");
  isChannelReady = true;
  socket.emit('send user info', '{{ client_name }}', '{{ client_uid }}', room)
  if (!isStarted) {
    maybeStart()
  }

});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
  clientRoom = room;
  Sefaria.track.event("DafRoulette", "Chevruta Match Made", "joiner");
  socket.emit('send user info', '{{ client_name }}', '{{ client_uid }}', room)
});

socket.on('got user name', function(userName, uid) {
  document.getElementById("chevrutaName").innerHTML = userName;
  document.getElementById("chevrutaUID").value = uid;
})

socket.on('user reported', function(){
  remoteVideo.srcObject = null;
  document.getElementById("reportUser").remove();
  alert("Your chevruta clicked the 'Report User' button. \n\nA report has been sent to the Sefaria administrators.")
})

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
  } else if (message === 'bye') {
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
  newRoomButton.innerHTML = '<button id="newRoom" onclick="getNewChevruta()">New Person</button>';
  document.getElementById("buttonContainer").appendChild(newRoomButton)

  const iframe = document.createElement('iframe');
  iframe.src = "https://www.sefaria.org/todays-daf-yomi";
  document.getElementById("iframeContainer").appendChild(iframe)
}


function getNewChevruta() {
  Sefaria.track.event("DafRoulette", "New Chevruta Click", "");
  location.reload()
}


function reportUser() {
  remoteVideo.srcObject = null;
  socket.emit('report user', clientRoom)

  const uid = document.getElementById("chevrutaUID").value;
  const username = document.getElementById("chevrutaName").innerHTML;
  console.log(uid, username)

  var feedback = {
      type: "daf_roulette_report",
      msg: `{{client_name}} ({{client_uid}}) reported ${username} (${uid}) on DafRoulette`,
      uid: {{client_uid}} || null,
      url: "/daf-roulette",
  };
  var postData = {json: JSON.stringify(feedback)};
  var url = "/api/send_feedback";

  $.post(url, postData, function (data) {
      if (data.error) {
          alert(data.error);
      } else {
          console.log(data);
          window.onbeforeunload = null;
          alert(`We're sorry you had this experience. ${username} has been reported to the Sefaria administrators.`)
          location.reload()
      }
  }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
      alert(Sefaria._("Unfortunately, there was an error sending this feedback. Please try again or try reloading this page."));
  });



}

function gotStream(stream) {
  socket.emit('how many rooms');
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

// function requestTurn(turnURL) {
//   let turnExists = false;
//   for (let i in pcConfig.iceServers) {
//     if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
//       turnExists = true;
//       turnReady = true;
//       break;
//     }
//   }
//   if (!turnExists) {
//     console.log('Getting TURN server from ', turnURL);
//     // No TURN server. Get one from computeengineondemand.appspot.com:
//     let xhr = new XMLHttpRequest();
//     xhr.onreadystatechange = function() {
//       if (xhr.readyState === 4 && xhr.status === 200) {
//         const turnServer = JSON.parse(xhr.responseText);
//         console.log('Got TURN server: ', turnServer);
//         pcConfig.iceServers.push({
//           'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
//           'credential': turnServer.password
//         });
//         turnReady = true;
//       }
//     };
//     xhr.open('GET', turnURL, true);
//     xhr.send();
//   }
// }

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
  setTimeout(function(){ location.reload(); }, 1000);

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
