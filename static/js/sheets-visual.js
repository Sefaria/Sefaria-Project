//zoom buttons
zoomScale = 1;

$("#zoomOut").click( function(){
	$("#visualContainer").click()
});


$("#visualContainer").css({
	'width' : $("body").css("width"),
	'height' : $("body").css("height"),
});




function resizeVisualContainer() {
maxY = parseInt($("body").css("height"));
maxX = parseInt($("body").css("width"));;
minY = 0;
minX = 0;


	$(".source").each( function() {
		var thisY = parseInt($(this).css('height'))+parseInt( $(this).css('top'));
		var thisX = parseInt($(this).css('width'))+parseInt( $(this).css('left'));
	
		if (thisY > maxY) maxY = thisY;
		if (thisX > maxX) maxX = thisX;
		if (thisY < minY) minY = thisY;
		if (thisX < minX) minX = thisX;

	});
	
	$("#visualContainer").css({
	'width' : maxX - minX,
	'height' : maxY - minY
});

}

resizeVisualContainer();


//set sources to be draggable, resizable & zoomable
$(".source").resizable({

	stack: ".source",
	handles: "nw, ne, se, sw",
	stack: ".source",
    resize: function(event, ui) {

        var changeWidth = ui.size.width - ui.originalSize.width; // find change in width
        var newWidth = ui.originalSize.width + changeWidth / zoomScale; // adjust new width by our zoomScale

        var changeHeight = ui.size.height - ui.originalSize.height; // find change in height
        var newHeight = ui.originalSize.height + changeHeight / zoomScale; // adjust new height by our zoomScale

        ui.size.width = newWidth;
        ui.size.height = newHeight;

    },
    stop: function( event, ui ) {
    resizeVisualContainer();
    }

}).draggable({
    stack: ".source",
    start: function(event, ui) {
        ui.position.left = 0;
        ui.position.top = 0;
    },
    drag: function(event, ui) {
    	
        var changeLeft = ui.position.left - ui.originalPosition.left; // find change in left
        var newLeft = ui.originalPosition.left + changeLeft / (( zoomScale)); // adjust new left by our zoomScale

        var changeTop = ui.position.top - ui.originalPosition.top; // find change in top
        var newTop = ui.originalPosition.top + changeTop / zoomScale; // adjust new top by our zoomScale

        ui.position.left = newLeft;
        ui.position.top = newTop;

    },
    stop: function( event, ui ) {
    resizeVisualContainer();
    }
});


