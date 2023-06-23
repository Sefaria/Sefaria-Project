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
  useEffect(() => {
    const getStrapiData = async () => {
      try {
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
          body: '{"query":"# Write your query or mutation here\\nquery {\\n  sidebarAds(\\n    filters: {\\n      startTime: { gte: \\"2023-06-19T04:00:00.000Z\\" }\\n      and: [{ endTime: { lte: \\"2023-06-29T04:00:00.000Z\\" } }]\\n    }\\n  ) {\\n    data {\\n      id\\n      attributes {\\n        ButtonAboveOrBelow\\n        Title\\n        bodyText\\n        buttonText\\n        buttonUrl\\n        createdAt\\n        debug\\n        endTime\\n        hasBlueBackground\\n        internalCampaignId\\n        keywords\\n        locale\\n        publishedAt\\n        showTo\\n        startTime\\n        updatedAt\\n      }\\n    }\\n  }\\n}\\n"}',
        })
          .then((response) => response.json())
          .then((result) => {
            setStrapiData(result.data);
            setDataFromStrapiHasBeenReceived(true);
          });
      } catch (error) {
        console.error("Failed to get strapi data", error);
      }
    };
    getStrapiData();
  }, []);

  return (
    <StrapiDataContext.Provider
      value={{ dataFromStrapiHasBeenReceived, strapiData }}
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
