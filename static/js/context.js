import React, { useContext, useEffect, useState } from "react";
const ContentLanguageContext = React.createContext({
  language: "english",
});
ContentLanguageContext.displayName = "ContentLanguageContext"; //This lets us see this name in the devtools

const AdContext = React.createContext({});
AdContext.displayName = "AdContext";

const StrapiDataContext = React.createContext({});
StrapiDataContext.displayName = "StrapiDataContext";

function StrapiDataProvider({ children }) {
  const [dataFromStrapiHasBeenReceived, setDataFromStrapiHasBeenReceived] =
    useState(false);
  const [strapiData, setStrapiData] = useState(null);
  const [interruptingMessageModal, setInterruptingMessageModal] = useState(null);
  useEffect(() => {
    const getStrapiData = async () => {
      try {
        let getDateWithoutTime = (date) => date.toISOString().split("T")[0];
        let getJSONDateStringInLocalTimeZone = (date) => {
          let parts = getDateWithoutTime(date).split("-");
          return new Date(parts[0], parts[1] - 1, parts[2]).toJSON();
        };
        let currentDate = new Date();
        let oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(currentDate.getDate() + 7);
        currentDate.setDate(currentDate.getDate() - 2); // Fix time management, previous code got time 1 hour in the future in UTC
        let startDate = getJSONDateStringInLocalTimeZone(currentDate);
        let endDate = getJSONDateStringInLocalTimeZone(oneWeekFromNow);
        console.log(startDate);
        console.log(endDate);
        const query = `{"query":"# Write your query or mutation here\\nquery {\\n  banners(filters: {\\n      bannerStartDate: { gte: \\"${startDate}\\" }\\n      and: [{ bannerEndDate: { lte: \\"${endDate}\\" } }]\\n  } ) {\\n    data {\\n      id\\n      attributes {\\n        bannerEndDate\\n        bannerStartDate\\n        bannerText\\n        buttonText\\n        buttonURL\\n        createdAt\\n        locale\\n        publishedAt\\n        shouldDeployOnMobile\\n        showToNewVisitors\\n        showToNonSustainers\\n        showToReturningVisitors\\n        showToSustainers\\n        updatedAt\\n      }\\n    }\\n  }\\n  modals(filters: {\\n      modalStartDate: { gte: \\"${startDate}\\" }\\n      and: [{ modalEndDate: { lte: \\"${endDate}\\" } }]\\n  } ) {\\n    data {\\n      id\\n      attributes {\\n        buttonText\\n        buttonURL\\n        createdAt\\n        locale\\n        modalEndDate\\n        modalStartDate\\n        modalText\\n        publishedAt\\n        shouldDeployOnMobile\\n        showToNewVisitors\\n        showToNonSustainers\\n        showToReturningVisitors\\n        showToSustainers\\n        updatedAt\\n      }\\n    }\\n  }\\n  sidebarAds(filters: {\\n      startTime: { gte: \\"${startDate}\\" }\\n      and: [{ endTime: { lte: \\"${endDate}\\" } }]\\n  } ){\\n    data {\\n      id\\n      attributes {\\n        ButtonAboveOrBelow\\n        Title\\n        bodyText\\n        buttonText\\n        buttonUrl\\n        createdAt\\n        debug\\n        endTime\\n        hasBlueBackground\\n        internalCampaignId\\n        keywords\\n        locale\\n        publishedAt\\n        showTo\\n        startTime\\n        updatedAt\\n      }\\n    }\\n  }\\n}"}`;
        console.log(query);
        const result = fetch("http://localhost:1337/graphql", {
          method: "POST", // *GET, POST, PUT, DELETE, etc.
          mode: "cors", // no-cors, *cors, same-origin
          cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
          credentials: "same-origin", // include, *same-origin, omit
          headers: {
            "Content-Type": "application/json",
          },
          redirect: "follow", // manual, *follow, error
          referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
          body: query,
        })
          .then((response) => response.json())
          .then((result) => {
            setStrapiData(result.data);
            setDataFromStrapiHasBeenReceived(true);
            // maybe sort by start date to choose which one should have a greater priority if more than one compatible one exists
            // e.g. there are modals with overlapping time frames
            let modals = result.data?.modals?.data;
            console.log(modals);
            const currentDate = new Date();
            if (modals?.length) {
              // if they end up being sorted, the first one will be the compatible one
              let modal = modals.find(modal => 
                currentDate >= new Date(modal.attributes.modalStartDate) && 
                currentDate <= new Date(modal.attributes.modalEndDate)
              );
              console.log("found acceptable modal:");
              console.log(modal);
              if (modal) {
                console.log("setting the modal");
                setInterruptingMessageModal(modal.attributes);
              }
            }
          });
      } catch (error) {
        console.error("Failed to get strapi data", error);
      }
    };
    getStrapiData();
  }, []);

  return (
    <StrapiDataContext.Provider
      value={{ dataFromStrapiHasBeenReceived, strapiData, interruptingMessageModal }}
    >
      {children}
    </StrapiDataContext.Provider>
  );
}

// function ExampleComponent() {
//   const strapi = useContext(StrapiDataContext);
//   if (strapi.dataFromStrapiHasBeenReceived) {
//     return (
//       <div className="test">
//         <dialog open>{strapi.strapiData}</dialog>
//       </div>
//     );
//   } else {
//     return null;
//   }
// }

export {
  ContentLanguageContext,
  AdContext,
  StrapiDataProvider,
  // ExampleComponent,
  StrapiDataContext,
};
