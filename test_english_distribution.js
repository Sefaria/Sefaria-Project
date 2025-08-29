#!/usr/bin/env node

/**
 * Debug English Word Distribution
 * Check exactly what the English word distribution algorithm is producing
 */

// Simulate the distributeWordsEqually function locally to debug it
function createTextMeasurer() {
    return {
        measureHebrew: function(text) { return text.length * 12; }, // Rough estimate
        measureTranslit: function(text) { return text.length * 10; },
        measureEnglish: function(text) { return text.length * 8; }
    };
}

function distributeWordsEqually(hebrewWords, translitWords, englishWords, targetLineCount, measurer) {
    const hebrewLines = [];
    const translitLines = [];
    const englishLines = [];
    const hebrewLineWidths = [];
    const translitLineWidths = [];
    const englishLineWidths = [];
    
    // Calculate words per line for each language
    const hebrewWordsPerLine = Math.ceil(hebrewWords.length / targetLineCount);
    const translitWordsPerLine = Math.ceil(translitWords.length / targetLineCount);
    const englishWordsPerLine = Math.ceil(englishWords.length / targetLineCount);
    
    console.log(`📊 Target Lines: ${targetLineCount}`);
    console.log(`📊 Words per line: H:${hebrewWordsPerLine} T:${translitWordsPerLine} E:${englishWordsPerLine}`);
    console.log(`📊 Total words: H:${hebrewWords.length} T:${translitWords.length} E:${englishWords.length}`);
    
    // CRITICAL: Distribute words evenly across target number of lines
    for (let lineIndex = 0; lineIndex < targetLineCount; lineIndex++) {
        // Hebrew distribution - maintain 1:1 correspondence with transliteration
        const hebrewStartIndex = lineIndex * hebrewWordsPerLine;
        const hebrewEndIndex = Math.min(hebrewStartIndex + hebrewWordsPerLine, hebrewWords.length);
        const hebrewLineWords = hebrewWords.slice(hebrewStartIndex, hebrewEndIndex);
        
        // Transliteration distribution - MUST match Hebrew exactly for 1:1 correspondence
        const translitLineWords = translitWords.slice(hebrewStartIndex, hebrewEndIndex);
        
        // English distribution - independent but balanced
        const englishStartIndex = lineIndex * englishWordsPerLine;
        const englishEndIndex = Math.min(englishStartIndex + englishWordsPerLine, englishWords.length);
        const englishLineWords = englishWords.slice(englishStartIndex, englishEndIndex);
        
        console.log(`Line ${lineIndex + 1}:`);
        console.log(`  Hebrew: [${hebrewStartIndex}-${hebrewEndIndex}] = "${hebrewLineWords.join(' ')}"`);
        console.log(`  Translit: [${hebrewStartIndex}-${hebrewEndIndex}] = "${translitLineWords.join(' ')}"`);
        console.log(`  English: [${englishStartIndex}-${englishEndIndex}] = "${englishLineWords.join(' ')}"`);
        
        // Measure line widths
        const hebrewText = hebrewLineWords.join(' ');
        const translitText = translitLineWords.join(' ');
        const englishText = englishLineWords.join(' ');
        
        const hebrewWidth = hebrewText ? measurer.measureHebrew(hebrewText) : 0;
        const translitWidth = translitText ? measurer.measureTranslit(translitText) : 0;
        const englishWidth = englishText ? measurer.measureEnglish(englishText) : 0;
        
        // Store lines and widths
        hebrewLines.push(hebrewLineWords);
        translitLines.push(translitLineWords);
        englishLines.push(englishLineWords);
        hebrewLineWidths.push(hebrewWidth);
        translitLineWidths.push(translitWidth);
        englishLineWidths.push(englishWidth);
        
        console.log(`  Result: H:${hebrewLineWords.length}w(${hebrewWidth.toFixed(0)}px) T:${translitLineWords.length}w(${translitWidth.toFixed(0)}px) E:${englishLineWords.length}w(${englishWidth.toFixed(0)}px)`);
    }
    
    return {
        hebrew: hebrewLines,
        transliteration: translitLines,
        english: englishLines,
        maxHebrewWidth: Math.max(...hebrewLineWidths),
        maxTranslitWidth: Math.max(...translitLineWidths),
        maxEnglishWidth: Math.max(...englishLineWidths)
    };
}

// Test with the problematic verse data from our debug output
console.log('🧪 Testing English Distribution Algorithm\n');

// Test case: Verse 2 (from debug output)
const hebrewWords2 = ['וְהָאָרֶץ', 'הָיְתָה', 'תֹהוּ', 'וָבֹהוּ', 'וְחֹשֶׁךְ', 'עַל־פְּנֵי', 'תְהוֹם', 'וְרוּחַ', 'אֱלֹהִים', 'מְרַחֶפֶת', 'עַל־פְּנֵי', 'הַמָּיִם:'];
const translitWords2 = ['V\'ha\'aretz', 'hay\'tah', 'tohu', 'vavohu', 'v\'choshech', 'al-p\'nei', 't\'hom', 'v\'ruach', 'Elohim', 'm\'rachefet', 'al-p\'nei', 'hamayim:'];
const englishWords2 = ['the', 'earth', 'being', 'unformed', 'and', 'void,', 'with', 'darkness', 'over', 'the', 'surface', 'of', 'the', 'deep', 'and', 'a', 'wind', 'from', 'God', 'sweeping', 'over', 'the', 'water—'];

console.log('Test Case: Verse 2 (Problematic - should distribute across multiple lines)');
const measurer = createTextMeasurer();

// Test with different target line counts to see what happens
for (let targetLines = 1; targetLines <= 5; targetLines++) {
    console.log(`\n=== Testing with ${targetLines} target lines ===`);
    const result = distributeWordsEqually(hebrewWords2, translitWords2, englishWords2, targetLines, measurer);
    
    console.log('📋 Final English Lines:');
    result.english.forEach((line, index) => {
        console.log(`  Line ${index + 1}: "${line.join(' ')}" (${line.length} words)`);
    });
}

// Also test the algorithm chosen by the optimization (which would be 12 lines for this verse)
console.log('\n=== Testing with 12 target lines (algorithm choice) ===');
const result12 = distributeWordsEqually(hebrewWords2, translitWords2, englishWords2, 12, measurer);

console.log('📋 Final English Lines (12 line distribution):');
result12.english.forEach((line, index) => {
    console.log(`  Line ${index + 1}: "${line.join(' ')}" (${line.length} words)`);
});

console.log('\n🎯 Summary: The algorithm should be distributing English words evenly, but if we\'re seeing all English on the first line in the browser, there must be a rendering issue.');