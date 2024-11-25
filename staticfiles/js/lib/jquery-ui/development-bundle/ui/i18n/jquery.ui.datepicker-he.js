/* Hebrew initialisation for the UI Datepicker extension. */
/* Written by Amir Hardon (ahardon at gmail dot com). */
jQuery(function($){
	$.datepicker.regional['he'] = {
		closeText: 'סגור',
		prevText: '&#x3c;הקודם',
		nextText: 'הבא&#x3e;',
		currentText: 'היום',
		monthNames: ['དང་པོ་','གཉིས་པ་','གསུམ་པ་','བཞི་པ་','ལྔ་པ་','དྲུག་པ་',
		'བདུན་པ་','བརྒྱད་པ་','དགུ་པ་','བཅུ་པ་','བཅུ་གཅིག','བཅུ་གཉིས'],
		monthNamesShort: ['1','2','3','4','5','6',
		'7','8','9','10','11','12'],
		dayNames: ['ཟླ་བ་','མིག་དམར་','ལྷག་པ་','ཕུར་བུ་','པ་སངས་','སྤེན་པ་','ཉི་མ་'],
		dayNamesShort: ['א\'','ב\'','ג\'','ד\'','ה\'','ו\'','שבת'],
		dayNamesMin: ['א\'','ב\'','ג\'','ד\'','ה\'','ו\'','שבת'],
		weekHeader: 'Wk',
		dateFormat: 'dd/mm/yy',
		firstDay: 0,
		isRTL: true,
		showMonthAfterYear: false,
		yearSuffix: ''};
	$.datepicker.setDefaults($.datepicker.regional['he']);
});
