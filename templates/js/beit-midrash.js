{% autoescape off %}

'use strict';

const socket = io.connect('//{{ rtc_server }}');

window.onload = function () {
    console.log("entered beit midrash")
    socket.emit("enter beit midrash", {{ client_uid }})
}


window.onbeforeunload = function () {
    console.log("leaving beit midrash!")
    socket.emit("leave beit midrash", {{ client_uid }})
}

socket.on("change in people", function(peopleInBeitMidrash) {
    console.log(peopleInBeitMidrash)
    document.getElementById("people-learning").innerHTML = peopleInBeitMidrash
})

{% endautoescape %}