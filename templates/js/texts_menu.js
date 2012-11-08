$(function() {
    // Fill text details in Text Menu with AJAX 
    $("#textsList .title a").on("click", function(e) {
        e.preventDefault();
        var $details = $(this).closest(".text").find(".details");

        if ($details.children().length) {
            $details.empty()
                .closest(".text").removeClass("hasDetails");
            location.hash = "";
            return;
        }
        var url = "/api/counts" + $(this).attr("href");
        $.getJSON(url, sjs.makeTextDetails);
        $details.addClass("makeTarget");
    });
});