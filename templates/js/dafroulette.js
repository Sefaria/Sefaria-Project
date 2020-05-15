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

const socket = io.connect('//{{ rtc_server }}');

socket.on('return rooms', function(numRooms) {
  document.getElementById("numberOfChevrutas").innerHTML = numRooms;
});

socket.on('creds', function(conf) {
  pcConfig = conf;
});

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
  clientRoom = room;
});

socket.on('join', function(room) {
  console.log('another user joined room: ' + room);
  Sefaria.track.event("DafRoulette", "Chevruta Match Made", "initator");
  isChannelReady = true;
  socket.emit('send user info', '{{ client_name }}', '{{ client_uid }}', room);
  maybeStart();
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
  clientRoom = room;
  Sefaria.track.event("DafRoulette", "Chevruta Match Made", "joiner");
  socket.emit('send user info', '{{ client_name }}', '{{ client_uid }}', room);
  maybeStart();
});

socket.on('got user name', function(userName, uid) {
  document.getElementById("chevrutaName").innerHTML = userName;
  document.getElementById("chevrutaUID").value = uid;
  localStorage.setItem('lastChevrutaID', uid);
});

socket.on('user reported', function(){
  remoteVideo.srcObject = null;
  document.getElementById("reportUser").remove();
  alert("Your chevruta clicked the 'Report User' button. \n\nA report has been sent to the Sefaria administrators.")
});

socket.on('byeReceived', function(){
  location.reload();
});



////////////////////////////////////////////////

function sendMessage(message) {
  // console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  // console.log('Client received message:', message);
  if (message.type === 'offer') {
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
  .then((stream) => {
    localStream = localVideo.srcObject = stream;
    socket.emit('how many rooms', {{ client_uid }}, localStorage.getItem('lastChevrutaID'));
    console.log('Adding local stream.');
  })
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });

function addAdditionalHTML() {
  const newRoomButton = document.createElement('div');
  newRoomButton.innerHTML = '<button id="newRoom" onclick="getNewChevruta()">New Person</button>';
  document.getElementById("buttonContainer").appendChild(newRoomButton)

  const iframe = document.createElement('iframe');
  iframe.src = "https://www.sefaria.org/todays-daf-yomi";
  document.getElementById("iframeContainer").appendChild(iframe);
}


function getNewChevruta() {
  Sefaria.track.event("DafRoulette", "New Chevruta Click", "");
  socket.emit('bye', clientRoom);
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
    pc.oniceconnectionstatechange = handleIceConnectionChange;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  // console.log('icecandidate event: ', event);
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
  // console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function handleIceConnectionChange(event) {
  if (pc.iceConnectionState == "disconnected" || pc.iceConnectionState == "failed") {
    socket.emit('bye', clientRoom);
  }
  console.log(pc.iceConnectionState);
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  // location.reload();
}

{% endautoescape %}
