
NONE = 0;
TOP = 1;
TOPRIGHT = 2;
RIGHT = 3;
BOTTOMRIGHT = 4;
BOTTOM = 5;
BOTTOMLEFT = 6;
LEFT = 7;
TOPLEFT = 8;
INSIDETOP = 9;
INSIDERIGHT = 10;
INSIDEBOTTOM = 11;
INSIDELEFT = 12;
INSIDE = 13;
OUTSIDE = 14;

	
paddingLeft = 30;
paddingRight = 10;	
paddingTop = 25;
	
function shadowCast($divs) {
	
	
	// Place Holder
	
	castShadow($("#basetext"), $("#c1"));
	castShadow($("#basetext"), $("#c2"));
	castShadow($("#basetext"), $("#c3"));
	castShadow($("#basetext"), $("#c4"));
	castShadow($("#basetext"), $("#c5"));
	castShadow($("#basetext"), $("#c6"));
	
	
	
	// sort by z-index
	
	// starting at the top, cast downwards
		
}

function castShadow($d1, $d2) {
		
	a = getEdges($d1);
	b = getEdges($d2);
	
	o = overlap($d1, $d2);
	console.log(o);
		
	width = b.x2 - b.x1;
	float = "right";
	height = 0;
	preShadow = 0;
	psHeight = 0;
	psFloat = "right";
	
	
	// TODO - complete all cases
	switch(o) {
		case NONE: 
			return;
			break;
		case TOP:
			height = a.y2 - b.y1;
			break;
		case TOPRIGHT:
			height = a.y2 - b.y1;
			width = b.x2 - a.x1 + paddingLeft;		
			float = "right";
			break;
		case RIGHT:
			height = b.y2 - b.y1;
			width = b.x2 - a.x1;
			float = "right"
			break;
		case LEFT:
			height = b.y2 - b.y1;
			width = a.x2 - b.x1;
			float = "left";
			break;
		case TOPLEFT:
			height = a.y2 - b.y1;
			width = a.x2 - b.x1 + paddingRight;
			float = "left";
			break;
		case BOTTOMRIGHT:
			height = b.y2 - a.y1 + paddingTop;
			width = b.x2 - a.x1 + paddingLeft;
			float = "right";
			preShadow = 1;
			psHeight = a.y1 - b.y1 - paddingTop;
			psFloat = "right"
			break;
		case BOTTOM: 
			height = b.y2 - a.y1 + paddingTop;
			width = b.x2 - b.x1;
			float = "right";
			preShadow = 1;
			psHeight = a.y1 - b.y1 - paddingTop;
			psFloat = "right"
			break;
		case BOTTOMLEFT:
			height = b.y2 - a.y1 + paddingTop;
			width = a.x2 - b.x1 + paddingRight;
			float = "left";
			preShadow = 1;
			psHeight = a.y1 - b.y1 - paddingTop;
			psFloat = "left"
			break;
		case INSIDETOP:
			break;
		case INSIDERIGHT:
			preShadow = 1;
			height = a.y2 - a.y1;
			width = b.x2 - a.x1;
			float = "right";
			psHeight = a.y1 - b.y1;
			psFloat = "right";
			break;
		case INSIDEBOTTOM:
			break;
		case INSIDELEFT:
			break;
	}
		
	if ($(".shadow", $d2).length) {
		$(".shadow", $d2).css({'height': height,
						'width': width,
						'float': float })
	} else {
		$("<div class='shadow'></div>").prependTo($d2).css({'height': height,
															'width': width,
															'float': float })
	}
	if (preShadow) {
		if($(".preShadow", $d2).length) {
			$(".preShadow", $d2).css({'height': psHeight, 
								'float': psFloat });
		} else {
		$("<div class='preShadow'></div>").prependTo($d2).css({'height': psHeight, 
																'float': psFloat });	
		}
	} else {
		$(".preShadow", $d2).remove();
	}
	

	
}

function getEdges($d) {

	o = $d.offset(); 
	
	e = {}
	
	e.x1 = o.left;
	e.x2 = o.left + $d.width();
	e.y1 = o.top;
	e.y2 = o.top + $d.height();
	
	return e;
}

function overlap($d1, $d2) {
	
	o1 = $d1.offset();
	o2 = $d2.offset(); 
	
	a = getEdges($d1);
	b = getEdges($d2);
	
	// Are any of A's edges in the MIDDLE of B
	m = {}
	
	m.x1 = (a.x1 > b.x1 && a.x1 < b.x2);
	m.x2 = (a.x2 > b.x1 && a.x2 < b.x2);
	m.y1 = (a.y1 > b.y1 && a.y1 < b.y2);
	m.y2 = (a.y2 > b.y1 && a.y2 < b.y2);
	
	if (a.x1 > b.x2 || a.x2 < b.x1 || a.y1 > b.y2 || a.y2 < b.y1 ) return NONE;
	
	if (!m.x1 && !m.x2 && !m.y1 && m.y2) return TOP;

	if (m.x1 && !m.x2 && !m.y1 && m.y2) return TOPRIGHT;
	
	if (m.x1 && !m.x2 && !m.y1 && !m.y2) return RIGHT;

	if (m.x1 && !m.x2 && m.y1 && !m.y2) return BOTTOMRIGHT;
	
	if (!m.x1 && !m.x2 && m.y1 && !m.y2) return BOTTOM;
	
	if (!m.x1 && m.x2 && m.y1 && !m.y2) return BOTTOMLEFT;

	if (!m.x1 && m.x2 && !m.y1 && !m.y2) return LEFT;
	
	if (!m.x1 && m.x2 && !m.y1 && m.y2) return TOPLEFT;
	
	if (m.x1 && m.x2 && !m.y1 && m.y2) return INSIDETOP;
	
	if (m.x1 && !m.x2 && m.y1 && m.y2) return INSIDERIGHT;

	if (m.x1 && m.x2 && m.y1 && !m.y2) return INSIDEBOTTOM;
	
	if (!m.x1 && m.x2 && m.y1 && m.y2) return INSIDELEFT;
	
	if (m.x1 && m.x2 && m.y1 && m.y2) return INSIDE;
	
	if (!m.x1 && !m.x2 && !m.y1 && !m.y2) return OUTSIDE;
	
	return 99;
	
}