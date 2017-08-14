var $         = require('jquery');
    $.cookie  = require('jquery.cookie');

$(function() {

var settings = {
  language: "{{ request.contentLang }}",
  layoutDefault: "segmented", //$.cookie("layoutDefault") ||
  layoutTalmud:  "continuous", //$.cookie("layoutTalmud")  ||
  layoutTanakh:  "segmented", //$.cookie("layoutTanakh")  ||
  color:         "light", //$.cookie("color")         ||
  fontSize:      62.5 //$.cookie("fontSize")      ||
};
var multiPanel    = $(window).width() > 600;

var container = document.getElementById('s2');
var component = React.createElement(ReaderApp, {
    headerMode: true,
    multiPanel: multiPanel,
    initialRefs: [],
    initialFilter: [],
    initialMenu: null,
    initialQuery: null,
    initialSheetsTag: null,
    initialNavigationCategories: [],
    initialSettings: settings,
    initialPanels: [],
    interfaceLang: "{{ request.interfaceLang }}"
    });
ReactDOM.render(component, container);
ReactDOM.render(React.createElement(Footer), document.getElementById('footer'));
});
