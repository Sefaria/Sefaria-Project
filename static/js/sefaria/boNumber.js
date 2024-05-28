// this code first convert hebrew number to english number and then convert english number to tibetan number    
export function hebrewToTibetan(inputString, lang) {
    //trim space from input string if lang is hebrew
    let hebrewNumber = (lang === 'he') ? inputString?.trim() : inputString;
    let isHebNumber = isHebrewNumber(hebrewNumber)
    //return if lang is not hebrew or input string is not hebrew number
    if (lang !== 'he' || !isHebNumber) return hebrewNumber;
    const hebrewDigits = {
        'א': 1,
        'ב': 2,
        'ג': 3,
        'ד': 4,
        'ה': 5,
        'ו': 6,
        'ז': 7,
        'ח': 8,
        'ט': 9,
        'י': 10,
        'כ': 20,
        'ל': 30,
        'מ': 40,
        'נ': 50,
        'ס': 60,
        'ע': 70,
        'פ': 80,
        'צ': 90,
        'ק': 100,
        'ר': 200,
        'ש': 300,
        'ת': 400
    };

    let englishNumber = 0;
    let prevDigitValue = 0;

    for (let i = 0; i < hebrewNumber.length; i++) {
        const currentDigit = hebrewNumber[i];
        const currentDigitValue = hebrewDigits[currentDigit];

        if (currentDigitValue) {
            if (prevDigitValue && prevDigitValue < currentDigitValue) {
                englishNumber = englishNumber - prevDigitValue + (currentDigitValue - prevDigitValue);
                prevDigitValue = 0;
            } else {
                englishNumber += currentDigitValue;
                prevDigitValue = currentDigitValue;
            }
        }
    }
    return englishToTibetan(englishNumber.toString());
}

function englishToTibetan(englishNumber) {
    const englishDigits = {
        '0': '༠',
        '1': '༡',
        '2': '༢',
        '3': '༣',
        '4': '༤',
        '5': '༥',
        '6': '༦',
        '7': '༧',
        '8': '༨',
        '9': '༩'
    };

    const englishDigitsArray = englishNumber.split('');
    let tibetanEquivalent = '';

    for (let i = 0; i < englishDigitsArray.length; i++) {
        const digit = englishDigitsArray[i];
        const tibetanDigit = englishDigits[digit];

        if (tibetanDigit) {
            tibetanEquivalent += tibetanDigit;
        }
    }

    return tibetanEquivalent;
}

function isHebrewNumber(text) {
    const hebrewNumbers = /^[\u05D0-\u05EA\u05F0-\u05F4\u0591-\u05C7]+$/; // Regular expression to match Hebrew numerals
    // Check if every character in the text is a Hebrew numeral
    return hebrewNumbers.test(text);
}
