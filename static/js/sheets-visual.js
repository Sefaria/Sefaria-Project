$("#container").css({
    "width": $("body").css("width"),
    "height": $("body").css("height")
});

//zoom buttons
zoomScale = 1;

function resizeZoomContainer() {
    //set values to resize zoom container -- negative margins keep the container centered on the page
    var bodyWidth = parseInt($("body").css("width")) / zoomScale;
    var bodyHeight = parseInt($("body").css("height")) / zoomScale;
    var bodyMarginLeft = Math.abs(parseInt($("body").css("width")) - bodyWidth) / 2;
    var bodyMarginTop = Math.abs((parseInt($("body").css("height")) - bodyHeight) / 2) + 50; //the last 50 is for the height of the header

    if (zoomScale < 1) {
        bodyMarginTop = -bodyMarginTop;
        bodyMarginLeft = -bodyMarginLeft;
    }

    $("#container").css({
        '-webkit-transform': 'scale(' + zoomScale + ')',
        '-moz-transform': 'scale(' + zoomScale + ')',
        '-ms-transform': 'scale(' + zoomScale + ')',
        '-o-transform': 'scale(' + zoomScale + ')',
        'transform': 'scale(' + zoomScale + ')',
        "width": bodyWidth + "px",
        "height": bodyHeight + "px",
        "margin-left": bodyMarginLeft + "px",
        "margin-top": bodyMarginTop + "px"
    });

}

$("#zoomOut").click(function() {
    zoomScale = zoomScale - .1;
    if (zoomScale < .1) zoomScale = .1;

    resizeZoomContainer();
});


$("#zoomIn").click(function() {
    zoomScale = zoomScale + .1;
    if (zoomScale > 4) zoomScale = 4;

    resizeZoomContainer();
});


//set sources to be draggable & resizable
$(".sheetItem").resizable({

    stack: ".source",
    handles: "nw, ne, se, sw",
    stack: ".source",

    start: function(event, ui) {

        ui.position.left = ui.position.left + Math.abs((parseInt($("#container").css("margin-left"))) * zoomScale);
        ui.position.top = ui.position.top + Math.abs((parseInt($("#container").css("margin-top"))) * zoomScale) + 50;


    },

    resize: function(event, ui) {


        var changeWidth = ui.size.width - ui.originalSize.width; // find change in width
        var newWidth = ui.originalSize.width + changeWidth / zoomScale; // adjust new width by our zoomScale

        var changeHeight = ui.size.height - ui.originalSize.height; // find change in height
        var newHeight = ui.originalSize.height + changeHeight / zoomScale; // adjust new height by our zoomScale

        ui.size.width = newWidth;
        ui.size.height = newHeight;



    },

    stop: function() {
        updateSheet();
    }



}).draggable({
    stack: ".sheetItem",
    start: function(event, ui) {
        ui.position.left = 0;
        ui.position.top = 0;
    },
    drag: function(event, ui) {

        var changeLeft = ui.position.left - ui.originalPosition.left; // find change in left
        var newLeft = ui.originalPosition.left + changeLeft / ((zoomScale)); // adjust new left by our zoomScale

        var changeTop = ui.position.top - ui.originalPosition.top; // find change in top
        var newTop = ui.originalPosition.top + changeTop / zoomScale; // adjust new top by our zoomScale

        ui.position.left = newLeft;
        ui.position.top = newTop;

    },
    stop: function() {
        updateSheet();
    }
}).each(function(index) {


    if (sjs.current.visualNodes) {
        $(this).css({

            "left": sjs.current.visualNodes[index].x + "px",
            "top": sjs.current.visualNodes[index].y + "px",
            "width": sjs.current.visualNodes[index].width + "px",
            "height": sjs.current.visualNodes[index].length + "px",
            "zIndex": sjs.current.visualNodes[index].zindex

        });
    }

}).prepend('<div class="colorSelect"><div class="pink"></div><div class="white"></div><div class="yellow"></div><div class="green"></div><div class="blue"></div></div>').hover(
    function() {
        $(this).find(".colorSelect").first().css("visibility", "visible");
    },
    function() {
        $(this).find(".colorSelect").first().css("visibility", "hidden");
    }

);

$(".colorSelect div").click( function() {

	$(this).closest(".sheetItem").removeClass( "yellow pink blue green white" ).addClass( $(this).attr('class') );


});


function updateSheet() {

    if (sjs._uid && sjs.can_edit) {

        toJson = '[';

        $(".sheetItem").each(function() {

            var x = (parseInt($(this).css('left')));
            var y = (parseInt($(this).css('top')));
            var width = $(this).width();
            var length = $(this).height();
            var zindex = $(this).css('z-index');
            if (zindex == "auto") zindex = 0;

            toJson = toJson + '{ "x" : ' + x + ', "y" : ' + y + ', "width" : ' + width + ', "length" : ' + length + ', "zindex" : ' + zindex + '},';

        });

        toJson = toJson.slice(0, -1) + ']';

        $.post("/api/sheets/" + sjs.current.id + "/visualize", {
                visualNodes: toJson,
                zoom: zoomScale
            },

            function(data) {
                if ("error" in data) {
                    sjs.alert.message(data.error);
                } else {
                    //	sjs.alert.flash("Sheet updated.");
                }
            }

        );
    }

}

$("#saveButton").click(function() {
    updateSheet();
});