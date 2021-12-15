import React, {useState, useContext, useEffect} from 'react';
import { AdContext } from './context';
import classNames from 'classnames';
import { InterruptingMessage } from './Misc';
import Sefaria from './sefaria/sefaria';
const Ad = ({adType, rerender}) => {
    const [inAppAds, setInAppAds] = useState(Sefaria._inAppAds);
    const [matchingAd, setMatchingAd] = useState(null);
    const context = useContext(AdContext);
    useEffect(() => {
      // if (!inAppAds) {
        google.charts.load("current");
        google.charts.setOnLoadCallback(getAds)
      // }
    }, []);
    useEffect(() => {
      if(inAppAds) {
        const matchingAds = getCurrentMatchingAds();
        setMatchingAd(matchingAds.length ? matchingAds[0] : null);
      }
    }, [context, inAppAds]);

    function getAds() {
        const url = 
        'https://docs.google.com/spreadsheets/d/1UJw2Akyv3lbLqBoZaFVWhaAp-FUQ-YZfhprL_iNhhQc/edit#gid=0'
        const query = new google.visualization.Query(url);
        query.setQuery('select A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q');
        query.send(processSheetsData);
    }
   
        
  function getCurrentMatchingAds() {
    // TODO: refine matching algorithm to order by matchingness?
    return inAppAds.filter(ad => {
      return (
        !!ad.trigger.isLoggedIn === !!context.isLoggedIn &&
        ad.trigger.interfaceLang === context.interfaceLang &&
        ad.adType === adType &&
        context.dt > ad.trigger.dt_start && context.dt < ad.trigger.dt_end &&
        (context.keywordTargets.some(kw => ad.trigger.keywordTargets.includes(kw)) ||
        !context.keywordTargets.some(kw => ad.trigger.excludeKeywordTargets.includes(kw))) &&
        /* line below checks if ad with particular repetition number has been seen before and is a banner */
        (Sefaria._inBrowser && !document.cookie.includes(`${ad.campaignId}_${ad.repetition}`) || ad.adType === "sidebar") 
      )
    })
  }

    function processSheetsData(response) {
      if (response.isError()) {
        alert('Error in query: ' + response.getMessage() + ' ' + response.getDetailedMessage());
        return;
      }
      const data = response.getDataTable();
      const columns = data.getNumberOfColumns();
      const rows = data.getNumberOfRows();
      Sefaria._inAppAds = [];
      for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < columns; c++) {
          row.push(data.getFormattedValue(r, c));
        }
        const keywordTargetsArray = row[5].split(",");
        const excludeKeywordTargets = keywordTargetsArray.filter(x => x.indexOf("!") === 0);
        excludeKeywordTargets = excludeKeywordTargets.map(x => x.slice(1));
        keywordTargetsArray = keywordTargetsArray.filter(x => x.indexOf("!") !== 0)
        Sefaria._inAppAds.push(
            {
              campaignId: row[0],
              title: row[6],
              bodyText: row[7],
              buttonText: row[8],
              buttonUrl: row[9],
              buttonIcon: row[10],
              buttonLocation: row[11],
              buttonBgColor: row[12],
              adType: row[13],
              hasBlueBackground: row[14],
              repetition: row[15],
              buttonStyle: row[16],
              trigger: {
                isLoggedIn: row[4],
                interfaceLang: row[3],
                dt_start: Date.parse(row[1]),
                dt_end: Date.parse(row[2]),
                keywordTargets: keywordTargetsArray,
                excludeKeywordTargets: excludeKeywordTargets
              }
            }
        )
      }
      setInAppAds(Sefaria._inAppAds);
      
    }

    function styleAd() {
        if (adType === "banner") {
            Sefaria.track.event("BannerMessages", "View", matchingAd.campaignId); // TODO?: check when scrolled into view
            const bannerHtml = matchingAd.bodyText + `<a href="${matchingAd.buttonUrl}" onClick="Sefaria.track.event('BannerMessages', 'Click', '${matchingAd.campaignId}')">${matchingAd.buttonText}</a>`;
            return <InterruptingMessage
            messageName={matchingAd.campaignId}
            messageHTML={bannerHtml}
            style="banner"
            repetition={matchingAd.repetition}
            onClose={rerender} />
        } else {
        Sefaria.track.event("SidebarMessages", "View", matchingAd.campaignId); // TODO?: check when scrolled into view
        const classes = classNames({
            sidebarAd: 1,
            blue: parseInt(matchingAd.hasBlueBackground),
        })
        return <div className={classes}>
            <h3>{matchingAd.title}</h3>
            {matchingAd.buttonLocation === "below" ?
                <><p>{matchingAd.bodyText}</p>{getButton()}</> :
                <>{getButton()}<p>{matchingAd.bodyText}</p></>}
        </div>
        }
    }

    function getButton() {
        return <a className={matchingAd.buttonStyle} href={matchingAd.buttonUrl} onClick={() => Sefaria.track.event("SidebarMessages", "Click", matchingAd.campaignId)}>
        <img src={`/static/icons/${matchingAd.buttonIcon}`} aria-hidden="true" />
        {matchingAd.buttonText}</a>
    }

    return matchingAd ? styleAd() : null

}

export {
    Ad
}
