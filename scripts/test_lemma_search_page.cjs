// Run with node scripts/test_lemma_search_page.cjs (uses existing jsdom dev dependency).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../templates/lemma_search.html'), 'utf8');
(async () => {
  const dom = new JSDOM(html, {runScripts: 'dangerously', url: 'https://example.test/experimental/lemma-search/'});
  const w = dom.window;
  // The repository's older jsdom predates this browser API.
  if (!w.Element.prototype.replaceChildren) w.Element.prototype.replaceChildren = function(...nodes) {
    while (this.firstChild) this.removeChild(this.firstChild);
    this.append(...nodes);
  };
  let calls = 0;
  w.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://sefaria.loadbalancer.dicta.org.il/search');
    assert.deepEqual(JSON.parse(options.body), {query:'בראשית',from:0,size:10,limitedToBooks:['Tanakh'],sort:'pagerank',smallUnitsOnly:true});
    return {ok:true,json:async()=>({total:1,hits:[{xmlId:'Tanakh.Torah.Genesis.1.1',highlight:[{text:'<b>בראשית</b><img src=x onerror="window.injected=true"><script>window.injected=true</script>'}]}]})};
  };
  await w.dictaResults('בראשית', 10);
  const panel = w.document.getElementById('dicta');
  assert.match(panel.textContent, /Source: Dicta/);
  assert.equal(panel.querySelector('.passage').textContent, 'בראשית');
  assert.equal(panel.querySelector('img, script, b'), null);
  assert.equal(w.injected, undefined);
  assert.match(panel.querySelector('a').href, /Genesis_1%3A1/);
  await w.dictaResults('English', 10);
  assert.equal(calls, 1);
  assert.match(panel.textContent, /Hebrew queries only/);
  w.document.getElementById('baseline').textContent = 'Retained ES result';
  w.fetch = async () => {throw Error('Network failure');};
  await w.dictaResults('בראשית', 10);
  assert.match(panel.textContent, /unavailable/);
  assert.equal(w.document.getElementById('baseline').textContent, 'Retained ES result');
  w.fetch = async () => {const e = Error();e.name='AbortError';throw e;};
  await w.dictaResults('בראשית', 10);
  assert.match(panel.textContent, /timed out/);
  w.document.getElementById('display').value='dicta';w.display();
  assert.equal(panel.hidden, false);
  assert.equal(w.document.getElementById('baseline').hidden, true);
  dom.window.close();
  console.log('Dicta page checks passed: payload, safe snippets, links, language, independent failure, timeout, display.');
})().catch(error=>{console.error(error);process.exitCode=1;});
