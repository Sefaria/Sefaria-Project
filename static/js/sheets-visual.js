
        // Set initial zoom level
        var zoom_level=1;

        // Click events
        $('#zoom_in').click(function() { zoom_page(.1, $(this)) });
        $('#zoom_out').click(function() { zoom_page(-.1, $(this)) });
        $('#zoom_reset').click(function() { zoom_page(0, $(this)) });

        // Zoom function
        function zoom_page(step, trigger)
        {
            // Set / reset zoom
            if(step==0) zoom_level=1;

            else zoom_level=zoom_level+step;
            
            if (zoom_level <.1) zoom_level = .1;
        
			$('#sheet').css({
			   '-moz-transform' : 'scale('+zoom_level+')', 
			   '-webkit-transform' : 'scale('+zoom_level+')',
			   '-ms-transform' : 'scale('+zoom_level+')',
			   '-o-transform' : 'scale('+zoom_level+')',
			   'transform' : 'scale('+zoom_level+')',
			   'transformOrigin': 'top left'
			});
					
			scaledWidth = (parseInt($('body').css('width'))/zoom_level)+"px";
			scaledHeight = (parseInt($('body').css('height'))/zoom_level)+"px";
						
			$('#sheet').css({
			'width' : scaledWidth,
			'height' : scaledHeight
			});
			
			
			$( ".source" ).each(function( index ) {
			
				leftPercent = (parseInt($(this).css('left'))/parseInt($('body').css('width')))*100;
				topPercent = (parseInt($(this).css('top'))/parseInt($('body').css('height')))*100;
				console.log('left: '+leftPercent+'% - top: '+topPercent+'%');
				
				
				
/*offsetLeft = (parseInt($(this).css('left'))/zoom_level)+"px"
				offsetTop = (parseInt($(this).css('top'))/zoom_level)+"px"
				
				$(this).css({
					'left' : offsetLeft,
					'top' : offsetTop
				});
*/
				
			});
			


        }



//draggable function -- not using jquery ui since it doesn't play nicely w/ zoom.
(function($) {
    $.fn.drags = function(opt) {

        opt = $.extend({handle:"",cursor:"move"}, opt);

        if(opt.handle === "") {
            var $el = this;
        } else {
            var $el = this.find(opt.handle);
        }

        return $el.css('cursor', opt.cursor).on("mousedown", function(e) {
            if(opt.handle === "") {
                var $drag = $(this).addClass('draggable');
            } else {
                var $drag = $(this).addClass('active-handle').parent().addClass('draggable');
            }
            var z_idx = $drag.css('z-index'),
                drg_h = $drag.outerHeight(),
                drg_w = $drag.outerWidth(),
                pos_y = $drag.offset().top + drg_h - e.pageY,
                pos_x = $drag.offset().left + drg_w - e.pageX;
            $drag.css('z-index', 1000).parents().on("mousemove", function(e) {
                $('.draggable').offset({
                    top:e.pageY + pos_y - drg_h,
                    left:e.pageX + pos_x - drg_w
                }).on("mouseup", function() {
                    $(this).removeClass('draggable').css('z-index', z_idx);
                });
            });
            e.preventDefault(); // disable selection
        }).on("mouseup", function() {
            if(opt.handle === "") {
                $(this).removeClass('draggable');
            } else {
                $(this).removeClass('active-handle').parent().removeClass('draggable');
            }
        });

    }
})(jQuery);

$('.source').drags();


