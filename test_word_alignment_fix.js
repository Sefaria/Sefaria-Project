#!/usr/bin/env node

/**
 * Test Hebrew-Transliteration Word Alignment Fix
 * Verifies that Hebrew and transliteration maintain 1:1 word correspondence on each line
 */

const puppeteer = require('puppeteer');

async function testWordAlignmentFix() {
    console.log('🔧 Testing Hebrew-Transliteration 1:1 Word Alignment...');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    const htmlFile = '/Users/mami/projects/hebrew-sefaria/Sefaria-Project/authentic_sefaria_demo.html';
    const fileUrl = `file://${htmlFile}`;
    
    console.log(`📖 Loading: ${fileUrl}`);
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    
    // Wait for content to render and word alignment to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test word alignment correspondence
    const alignmentTest = await page.evaluate(() => {
        const verseContainers = document.querySelectorAll('.verse-container');
        const results = [];
        
        verseContainers.forEach((container, verseIndex) => {
            const threeColumns = container.querySelector('.verse-three-columns');
            if (!threeColumns) return;
            
            const hebrewLines = threeColumns.querySelectorAll('.hebrew-word-line');
            const translitLines = threeColumns.querySelectorAll('.transliteration-word-line');
            const englishLines = threeColumns.querySelectorAll('.english-word-line');
            
            const verseResult = {
                verseIndex,
                lineCount: {
                    hebrew: hebrewLines.length,
                    translit: translitLines.length,
                    english: englishLines.length
                },
                wordAlignment: [],
                issues: []
            };
            
            // Check each line for 1:1 word correspondence
            const maxLines = Math.max(hebrewLines.length, translitLines.length, englishLines.length);
            
            for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
                const hebrewLine = hebrewLines[lineIndex];
                const translitLine = translitLines[lineIndex];
                const englishLine = englishLines[lineIndex];
                
                const hebrewWords = hebrewLine ? hebrewLine.textContent.trim().split(/\s+/).filter(w => w) : [];
                const translitWords = translitLine ? translitLine.textContent.trim().split(/\s+/).filter(w => w) : [];
                const englishWords = englishLine ? englishLine.textContent.trim().split(/\s+/).filter(w => w) : [];
                
                const lineAlignment = {
                    lineIndex,
                    wordCounts: {
                        hebrew: hebrewWords.length,
                        translit: translitWords.length,
                        english: englishWords.length
                    },
                    hebrewText: hebrewWords.join(' '),
                    translitText: translitWords.join(' '),
                    englishText: englishWords.join(' '),
                    hebrewTranslitMatch: hebrewWords.length === translitWords.length
                };
                
                verseResult.wordAlignment.push(lineAlignment);
                
                // Check for alignment issues
                if (hebrewWords.length !== translitWords.length) {
                    verseResult.issues.push({
                        lineIndex,
                        type: 'hebrew_translit_mismatch',
                        hebrewCount: hebrewWords.length,
                        translitCount: translitWords.length,
                        description: `Line ${lineIndex + 1}: Hebrew has ${hebrewWords.length} words, Transliteration has ${translitWords.length} words`
                    });
                }
                
                // Check for empty lines where they shouldn't be
                if ((hebrewWords.length === 0) !== (translitWords.length === 0)) {
                    verseResult.issues.push({
                        lineIndex,
                        type: 'empty_line_mismatch',
                        description: `Line ${lineIndex + 1}: One column is empty while the other has words`
                    });
                }
            }
            
            results.push(verseResult);
        });
        
        return results;
    });
    
    console.log('\n📊 Word Alignment Test Results:');
    
    let totalLines = 0;
    let perfectAlignmentLines = 0;
    let totalIssues = 0;
    
    alignmentTest.forEach((verse, index) => {
        console.log(`\n📚 Verse ${index + 1}:`);
        console.log(`   Lines - Hebrew: ${verse.lineCount.hebrew}, Translit: ${verse.lineCount.translit}, English: ${verse.lineCount.english}`);
        
        verse.wordAlignment.forEach(line => {
            totalLines++;
            const isAligned = line.hebrewTranslitMatch;
            if (isAligned) perfectAlignmentLines++;
            
            console.log(`   Line ${line.lineIndex + 1}: H:${line.wordCounts.hebrew} | T:${line.wordCounts.translit} | E:${line.wordCounts.english} ${isAligned ? '✅' : '❌'}`);
            
            if (!isAligned && line.wordCounts.hebrew > 0 && line.wordCounts.translit > 0) {
                console.log(`      Hebrew: "${line.hebrewText}"`);
                console.log(`      Translit: "${line.translitText}"`);
            }
        });
        
        if (verse.issues.length > 0) {
            console.log(`   🚨 Issues found: ${verse.issues.length}`);
            verse.issues.forEach(issue => {
                console.log(`      • ${issue.description}`);
                totalIssues++;
            });
        } else {
            console.log(`   ✅ Perfect alignment - no issues`);
        }
    });
    
    console.log('\n📈 Overall Results:');
    console.log(`   Total Lines: ${totalLines}`);
    console.log(`   Perfect Hebrew-Translit Alignment: ${perfectAlignmentLines}/${totalLines} (${(perfectAlignmentLines/totalLines*100).toFixed(1)}%)`);
    console.log(`   Total Issues: ${totalIssues}`);
    console.log(`   Success Rate: ${totalIssues === 0 ? '✅ 100% - PERFECT' : `❌ ${((totalLines-totalIssues)/totalLines*100).toFixed(1)}%`}`);
    
    // Generate test PDF
    const pdfPath = '/Users/mami/projects/hebrew-sefaria/Sefaria-Project/word_alignment_test.pdf';
    console.log('\n📄 Generating word alignment test PDF...');
    
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
            top: '0.25in',
            right: '0.25in',
            bottom: '0.25in',
            left: '1.25in'
        }
    });
    
    console.log(`✅ Word alignment test PDF generated: ${pdfPath}`);
    
    await browser.close();
    
    // Final assessment
    const success = totalIssues === 0 && perfectAlignmentLines > totalLines * 0.95;
    console.log(`\n🎯 Test Result: ${success ? '✅ SUCCESS - Hebrew-Transliteration alignment fixed!' : '❌ ISSUES REMAIN - Further fixes needed'}`);
    
    return success;
}

testWordAlignmentFix().catch(console.error);