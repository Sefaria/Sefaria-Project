/********
 * Still some work to be done here,
 *   the numbers don't print right at all yet.
 *   encodeHebrewNumeral(3) === גגג׳
 *
 */


function right(string, numChars) {
    'use strict';
    return string.slice(string.length - numChars);
}




/******* ENCODING *********/


var tibetanNumeral = function(num) {
    if (num < 10) {
        let tibNum = tibetanNumberFromEngNumber(num.toString());
        return '༠' + tibNum;

    }else {
        let tibetanTextArray = num
            .toString()
            .split("")
            .map(value => tibetanNumberFromEngNumber(value));
        return  tibetanTextArray.join("");
    }
}

function tibetanNumberFromEngNumber(numberAsString) {
    switch (numberAsString) {
        case "0":
            return "༠";
        case "1":
            return "༡";
        case "2":
            return "༢";
        case "3":
            return "༣";
        case "4":
            return "༤";
        case "5":
            return "༥";
        case "6":
            return "༦";
        case "7":
            return "༧";
        case "8":
            return "༨";
        case "9":
            return "༩";
    }
}