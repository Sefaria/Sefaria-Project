#!/usr/bin/env node

/**
 * Debug Line Balance Issue
 * Check exactly why English words are all going to first line only
 */

const puppeteer = require('puppeteer');

async function debugLineBalance() {
    console.log('🔍 Debugging line balance issue...');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Monitor console messages from the page
    const consoleMessages = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleMessages.push(text);
        console.log(`📝 Page Console: ${text}`);
    });
    
    const htmlFile = '/Users/mami/projects/hebrew-sefaria/Sefaria-Project/authentic_sefaria_demo.html';
    const fileUrl = `file://${htmlFile}`;
    
    console.log(`📖 Loading: ${fileUrl}`);
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    
    // Wait for content to render and line balance algorithm to run
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check the actual line distribution for a few verses
    const lineBalanceAnalysis = await page.evaluate(() => {
        const verses = document.querySelectorAll('.verse-container');
        const analysis = [];
        
        // Check first 3 verses to understand the pattern
        for (let i = 0; i < Math.min(3, verses.length); i++) {
            const verse = verses[i];
            const threeColumns = verse.querySelector('.verse-three-columns');
            
            if (threeColumns) {
                const hebrewLines = threeColumns.querySelectorAll('.hebrew-word-line');
                const translitLines = threeColumns.querySelectorAll('.transliteration-word-line');
                const englishLines = threeColumns.querySelectorAll('.english-word-line');
                
                const verseAnalysis = {
                    verseIndex: i + 1,
                    lineCount: {
                        hebrew: hebrewLines.length,
                        translit: translitLines.length,
                        english: englishLines.length
                    },
                    lines: []
                };
                
                // Analyze each line to see word distribution
                const maxLines = Math.max(hebrewLines.length, translitLines.length, englishLines.length);
                
                for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
                    const hebrewLine = hebrewLines[lineIndex];
                    const translitLine = translitLines[lineIndex];
                    const englishLine = englishLines[lineIndex];
                    
                    const lineData = {
                        lineIndex: lineIndex + 1,
                        hebrew: hebrewLine ? {
                            text: hebrewLine.textContent.trim(),
                            wordCount: hebrewLine.textContent.trim().split(/\s+/).filter(w => w).length
                        } : { text: '', wordCount: 0 },
                        translit: translitLine ? {
                            text: translitLine.textContent.trim(),
                            wordCount: translitLine.textContent.trim().split(/\s+/).filter(w => w).length
                        } : { text: '', wordCount: 0 },
                        english: englishLine ? {
                            text: englishLine.textContent.trim(),
                            wordCount: englishLine.textContent.trim().split(/\s+/).filter(w => w).length
                        } : { text: '', wordCount: 0 }
                    };
                    
                    verseAnalysis.lines.push(lineData);
                }
                
                analysis.push(verseAnalysis);
            }
        }
        
        return analysis;
    });
    
    console.log('\n📊 Line Balance Analysis:');
    
    lineBalanceAnalysis.forEach(verse => {
        console.log(`\n📚 Verse ${verse.verseIndex}:`);
        console.log(`   Total lines: H:${verse.lineCount.hebrew} T:${verse.lineCount.translit} E:${verse.lineCount.english}`);
        
        verse.lines.forEach(line => {
            const hWords = line.hebrew.wordCount;
            const tWords = line.translit.wordCount;
            const eWords = line.english.wordCount;
            
            console.log(`   Line ${line.lineIndex}: H:${hWords} T:${tWords} E:${eWords}`);
            
            // Show actual text for non-empty lines
            if (hWords > 0 || tWords > 0 || eWords > 0) {
                if (hWords > 0) console.log(`      Hebrew: "${line.hebrew.text}"`);
                if (tWords > 0) console.log(`      Translit: "${line.translit.text}"`);
                if (eWords > 0) console.log(`      English: "${line.english.text}"`);
            }
        });
        
        // Check if English is balanced
        const englishWordDistribution = verse.lines.map(l => l.english.wordCount);
        const totalEnglishWords = englishWordDistribution.reduce((sum, count) => sum + count, 0);
        const nonEmptyEnglishLines = englishWordDistribution.filter(count => count > 0).length;
        
        console.log(`   📈 English balance: ${totalEnglishWords} words across ${nonEmptyEnglishLines} lines`);
        console.log(`   🎯 Balance status: ${nonEmptyEnglishLines === verse.lineCount.hebrew ? '✅ BALANCED' : `❌ UNBALANCED (should be ${verse.lineCount.hebrew} lines)`}`);
    });
    
    // Filter console messages that show our algorithm working
    const algorithmMessages = consoleMessages.filter(msg => 
        msg.includes('LINE BALANCE') || msg.includes('Distribution:') || msg.includes('Line ')
    );
    
    console.log('\n🔧 Algorithm Messages:');
    algorithmMessages.slice(0, 20).forEach(msg => console.log(`   ${msg}`)); // Show first 20 relevant messages
    
    await browser.close();
    
    console.log('\n🎯 Debug Summary:');
    console.log('Issue: English words are all going to the first line instead of being distributed evenly.');
    console.log('Next steps: Need to fix the English word distribution logic in the packWordsWithCorrespondence function.');
}

debugLineBalance().catch(console.error);