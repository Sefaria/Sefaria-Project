import React, {useState, useContext, useEffect} from 'react';
import { AdContext } from './context';
import classNames from 'classnames';
import { InterruptingMessage } from './Misc';
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
        context.keywordTargets.some(kw => ad.trigger.keywordTargets.includes(kw)) &&
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
      console.log(response);
      const data = response.getDataTable();
      console.log(data);
      const columns = data.getNumberOfColumns();
      const rows = data.getNumberOfRows();
      Sefaria._inAppAds = [];
      for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < columns; c++) {
          row.push(data.getFormattedValue(r, c));
        }
        console.log(row)
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
                keywordTargets: row[5].split(","),
              }
            }
        )
      }
      setInAppAds(Sefaria._inAppAds);
      
    }

    function styleAd() {
        if (adType === "banner") {
            const bannerHtml = matchingAd.bodyText;
            return <InterruptingMessage
            messageName={matchingAd.campaignId}
            messageHTML={bannerHtml}
            style="banner"
            repetition={matchingAd.repetition}
            onClose={rerender} />
        } else {
        const classes = classNames({
            sidebarAd: 1,
            blue: parseInt(matchingAd.hasBlueBackground),
        })
        return <div className={classes}>
            <h3>{matchingAd.title}</h3>
            {matchingAd.buttonLocation === "above" ?
                <><p>{matchingAd.bodyText}</p><a className={matchingAd.buttonStyle} href={matchingAd.buttonUrl}>
                <img src={`/static/img/${matchingAd.buttonIcon}.png`} aria-hidden="true" />
                {matchingAd.buttonText}</a></> :
                <><a className={matchingAd.buttonStyle} href={matchingAd.buttonUrl}>                <img src={`/static/img/${matchingAd.buttonIcon}.png`} aria-hidden="true" />{matchingAd.buttonText}</a><p>{matchingAd.bodyText}</p></>}
        </div>
        }
    }

    return (matchingAd ? styleAd()
      : null)

}

export {
    Ad
}
