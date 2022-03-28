import React, {useState, useContext, useEffect} from 'react';
import { AdContext } from './context';
import classNames from 'classnames';
import { InterruptingMessage } from './Misc';
import Sefaria from './sefaria/sefaria';

const Promotions = ({adType, rerender}) => {
    const [inAppAds, setInAppAds] = useState(Sefaria._inAppAds);
    const [matchingAds, setMatchingAds] = useState(null);
    const [prevMatchingAdIds, setPrevMatchingAdIds] = useState([])
    const context = useContext(AdContext);
    useEffect(() => {
        google.charts.load("current");
        google.charts.setOnLoadCallback(getAds)
    }, []);
    useEffect(() => {
      if(inAppAds) {
        setMatchingAds(getCurrentMatchingAds());
      }
    }, [context, inAppAds]);
    useEffect(() => {
        if (!matchingAds) {return}
        const matchingAdIds = matchingAds.map(x => x.campaignId).sort();
        const newIds = matchingAdIds.filter(value=> !(prevMatchingAdIds.includes(value)));

        if (newIds.length > 0) {
            for (const matchingAd of matchingAds) {
                if (newIds.includes(matchingAd.campaignId)) {
                    Sefaria.track.promoView(matchingAd.campaignId, matchingAd.adType)
                }
            }
            setPrevMatchingAdIds(newIds)
        }
    }, [matchingAds])

    function getAds() {
        const url = 
        'https://docs.google.com/spreadsheets/d/1UJw2Akyv3lbLqBoZaFVWhaAp-FUQ-YZfhprL_iNhhQc/edit#gid=0'
        const query = new google.visualization.Query(url);
        query.setQuery('select A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P');
        query.send(processSheetsData);
    }

    function showToUser(ad) {
        if (ad.trigger.showTo === "all") {
            return true;
        } else if (ad.trigger.showTo === "loggedIn" && context.isLoggedIn) {
            return true;
        } else if (ad.trigger.showTo === "loggedOut" && !context.isLoggedIn) {
            return true;
        } else {
            return false;
        }
    }
   
        
  function getCurrentMatchingAds() {
    // TODO: refine matching algorithm to order by matchingness?
    return inAppAds.filter(ad => {
      return (
        showToUser(ad) &&
        ad.trigger.interfaceLang === context.interfaceLang &&
        ad.adType === adType &&
        context.dt > ad.trigger.dt_start && context.dt < ad.trigger.dt_end &&
        (context.keywordTargets.some(kw => ad.trigger.keywordTargets.includes(kw)) ||
        (ad.trigger.excludeKeywordTargets.length !== 0 && !context.keywordTargets.some(kw => ad.trigger.excludeKeywordTargets.includes(kw)))) &&
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
        let keywordTargetsArray = row[5].split(",");
        let excludeKeywordTargets = keywordTargetsArray.filter(x => x.indexOf("!") === 0);
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
              adType: row[12],
              hasBlueBackground: parseInt(row[13]),
              repetition: row[14],
              buttonStyle: row[15],
              trigger: {
                showTo: row[4] ,
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

    // TODO: refactor once old InterruptingMessage pattern is retired
    function createBannerHtml(matchingAd) {
        return `<div id="bannerTextBox">
	<span class="${context.interfaceLang === "hebrew" ? "int-he" : "int-en" }" style="font-weight: bold">
        ${matchingAd.bodyText}
    </span>
</div>
<div id="bannerButtonBox">
	<a class="button white ${context.interfaceLang === "hebrew" ? "int-he" : "int-en" }" href="${matchingAd.buttonUrl}"
    onClick="Sefaria.track.promoClick('${matchingAd.campaignId}', '${matchingAd.adType}');"
    target="_blank">
        <span>${matchingAd.buttonText}</span>
    </a>
</div>`
    }

    function styleAds() {
        if (adType === "banner") {
            const matchingAd = matchingAds[0] // Only allow a single banner
            if (!matchingAd) {return null}
            const bannerHtml = createBannerHtml(matchingAd);
            return <InterruptingMessage
            messageName={matchingAd.campaignId}
            messageHTML={bannerHtml}
            style="banner"
            repetition={matchingAd.repetition}
            onClose={rerender} />
        } else {
              const sidebarAds = matchingAds.map(ad => <SidebarAd matchingAd={ad} key={ad.campaignId} />);
              return (sidebarAds)
        }
    }

    return matchingAds ? styleAds() : null

}

const SidebarAd = ({matchingAd}) => {
    const classes = classNames({
        sidebarPromo: 1,
        blue: matchingAd.hasBlueBackground,
    })

    function getButton() {
        return <a className={matchingAd.buttonStyle} href={matchingAd.buttonUrl} onClick={() => Sefaria.track.promoClick(matchingAd.campaignId, matchingAd.adType)}>
        <img src={`/static/icons/${matchingAd.buttonIcon}`} aria-hidden="true" />
        {matchingAd.buttonText}</a>
    }

    return <div className={classes}>
        <h3>{matchingAd.title}</h3>
        {matchingAd.buttonLocation === "below" ?
            <><p>{matchingAd.bodyText}</p>{getButton()}</> :
            <>{getButton()}<p>{matchingAd.bodyText}</p></>}
    </div>
}

export {
    Promotions
}
