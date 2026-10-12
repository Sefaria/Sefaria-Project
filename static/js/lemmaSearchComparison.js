/* Standalone experiment adapter. Ordinary search itself is not modified.
 * Reuse its Search class for Dicta requests, Hebrew routing, reference adaptation,
 * category replacement, score calibration, and reference/version grouping.
 */
(function(root) {
  const clone = value => JSON.parse(JSON.stringify(value));
  async function providers(query) {
    const search = new root.Sefaria.search.constructor();
    const args = {query,type:'text',exact:false,start:0,size:100,sort_type:'relevance',applied_filters:[]};
    search.queryDictaFlag = search.isDictaQuery(args);
    if (!search.queryDictaFlag) return {enabled:false,hits:[],total:0,note:'Dicta is not used for this query by ordinary search.'};
    const requests=[];
    let failed=false;
    const wrapper={addQuery(request){requests.push(request);request.fail(()=>{failed=true;});}};
    const timer=setTimeout(()=>requests.forEach(request=>request.abort()),20000);
    try {
      await Promise.all([search.dictaQuery(args,true,wrapper),search.dictaBooksQuery(args,wrapper)]);
      // A broken provider cannot establish a valid comparison; don't label a
      // partial response "the baseline" just because ordinary search swallows errors.
      if(failed) return {error:'Dicta is unavailable. Retry to compare against the ordinary baseline.'};
      return {enabled:search.queryDictaFlag,hits:clone(search.dictaQueryQueue.hits.hits),total:search.dictaQueryQueue.hits.total.getValue(),note:'Dicta and Elasticsearch merged using ordinary search’s code.'};
    } catch(error) {
      return {error:'Could not prepare ordinary search providers. Reload and retry.'};
    } finally {clearTimeout(timer);}
  }
  function combine(data, provider) {
    if(provider.error) throw Error(provider.error);
    const Search=root.Sefaria.search.constructor;
    const Total=root.Sefaria.search.dictaQueryQueue.hits.total.constructor;
    const output={...data,results:{},providers:{enabled:provider.enabled,note:provider.note,dictaTotal:provider.total,candidatePageSize:100}};
    for(const mode of ['baseline','enhanced']) {
      const engine=new Search();
      const es=data.results[mode];
      let hits=clone(es.hits).map(hit=>({...hit,score:-hit._score,cameFrom:'Sefaria',comp_date:hit._source.comp_date}));
      engine.queryDictaFlag=provider.enabled;
      if(mode==='enhanced' && data.weight>0 && provider.enabled) {
        // Retain ordinary ES hits plus the added lemma route, including Tanakh.
        // Pre-filter here so the inherited merge doesn't discard new lemma hits.
        hits=hits.filter(hit=>!hit._source.categories.includes('Tanakh')||(hit.matched_queries||[]).some(name=>name==='lemma'||name==='lemma_expanded'));
        engine.queryDictaFlag=false;
      }
      engine.sefariaQueryQueue={hits:{hits,total:new Total({value:es.total})}};
      engine.dictaQueryQueue={hits:{hits:clone(provider.hits),total:new Total({value:provider.total})}};
      const merged=engine.mergeQueries(false,'score',[]).hits.hits;
      // Same reference/version grouping as the ordinary results renderer.
      const grouped=engine.mergeTextResultsVersions(merged);
      output.results[mode]={...es,hits:grouped.slice(0,data.depth)};
    }
    return output;
  }
  root.LemmaSearchComparison={providers,combine};
})(typeof window==='undefined'?globalThis:window);
