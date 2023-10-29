const { el, mount, setChildren } = redom;

const byLastName = (a, b) => {
  const c = a.teamMemberDetails.teamName.en;
  const d = b.teamMemberDetails.teamName.en;
  const lastNameA = c.split(" ").pop();
  const lastNameB = d.split(" ").pop();
  return lastNameA.localeCompare(lastNameB);
};

const partition = (arr, prop) =>
  arr.reduce(
    (accumulator, currentValue) => {
      accumulator[prop(currentValue) ? 0 : 1].push(currentValue);
      return accumulator;
    },
    [[], []]
  );

function LocalizedText(text) {
  return [el("span.int-en", text.en), el("span.int-he", text.he)];
}

function TeamTitle(teamTitle) {
  return el(".teamTitle", LocalizedText(teamTitle));
}

function TeamName(teamName) {
  return el(".teamName", LocalizedText(teamName));
}

function TeamMemberDetails(teamMemberDetails) {
  return el(".teamMemberDetails", [
    TeamName(teamMemberDetails.teamName),
    TeamTitle(teamMemberDetails.teamTitle),
  ]);
}

function TeamMemberImage(teamMember) {
  return el(
    ".teamMemberImage",
    el("img", {
      src: teamMember.teamMemberImage,
      alt: "Headshot of " + teamMember.teamMemberDetails.teamName.en,
    })
  );
}

function TeamMember(teamMember) {
  return el(".teamMember", [
    TeamMemberImage(teamMember),
    TeamMemberDetails(teamMember.teamMemberDetails),
  ]);
}

function TeamMembers(teamMembers) {
  return teamMembers.map((teamMember) => TeamMember(teamMember));
}

function Placeholders(teamMembersCount, cls) {
  // Determine the number of empty spots to have as placeholders in the last row
  placeholdersCount = 3 - (teamMembersCount - 3 * ~~(teamMembersCount / 3));
  return Array.from({ length: placeholdersCount }, () =>
    el("." + cls + ".placeholder")
  );
}

function BoardMember(boardMember) {
  return el(
    ".teamBoardMember",
    TeamMemberDetails(boardMember.teamMemberDetails)
  );
}

function BoardMembers(boardMembers) {
  // Separate out the chairman and co-founders for the correct ordering
  let chairmanBoardMember;
  let chairmanIndex = boardMembers.findIndex(
    (boardMember) =>
      boardMember.teamMemberDetails.teamTitle.en.toLowerCase() === "chairman"
  );
  if (chairmanIndex !== -1) {
    chairmanBoardMember = boardMembers.splice(chairmanIndex, 1);
  }
  const [cofounderBoardMembers, regularBoardMembers] = partition(
    boardMembers,
    (boardMember) =>
      boardMember.teamMemberDetails.teamTitle.en.toLowerCase() === "co-founder"
  );
  // Produce the nodes with the right order for the board members
  // Chairman, Co-founders, rest of the board
  return [
    ...(chairmanBoardMember ?? []),
    ...(cofounderBoardMembers ?? []),
    ...regularBoardMembers.sort(byLastName),
  ].map((boardMember) => BoardMember(boardMember));
}

if (typeof STRAPI_INSTANCE !== "undefined" && STRAPI_INSTANCE) {
  async function fetchTeamMembersJSON() {
    const query = `
      query { 
        teamMembers(pagination: { limit: -1 }) {
          data {
            id
            attributes {
              teamName
              teamTitle
              isTeamBoardMember
              teamMemberImage {
                data {
                  attributes {
                    url
                  }
                }
              }
              localizations {
                data {
                  attributes {
                    locale
                    teamName
                    teamTitle
                  }
                }
              }
            }
          }
        }
      }
      `;
    try {
      const response = await fetch(STRAPI_INSTANCE + "/graphql", {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
        },
        redirect: "follow",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  }

  (async () => {
    try {
      const teamMembersData = await fetchTeamMembersJSON();

      const teamMembersFromStrapi = teamMembersData.data.teamMembers.data.map(
        (teamMember) => {
          const heLocalization = teamMember.attributes.localizations.data[0];

          return {
            isTeamBoardMember: teamMember.attributes.isTeamBoardMember,
            teamMemberImage:
              teamMember.attributes.teamMemberImage?.data?.attributes?.url,
            teamMemberDetails: {
              teamName: {
                en: teamMember.attributes.teamName,
                he: heLocalization.attributes.teamName,
              },
              teamTitle: {
                en: teamMember.attributes.teamTitle,
                he: heLocalization.attributes.teamTitle,
              },
            },
          };
        }
      );

      const [ordinaryTeamMembers, teamBoardMembers] = partition(
        teamMembersFromStrapi,
        (teamMember) => !teamMember.isTeamBoardMember
      );

      setChildren(document.querySelector("section.main-text.team-members"), [
        ...TeamMembers(ordinaryTeamMembers.sort(byLastName)),
        ...Placeholders(ordinaryTeamMembers.length, "teamMember"),
      ]);

      setChildren(document.querySelector("section.main-text.board-members"), [
        ...BoardMembers(teamBoardMembers),
        ...Placeholders(teamBoardMembers.length, "teamBoardMember"),
      ]);
    } catch (error) {
      setChildren(document.querySelector("div.row.static-text"), el("h1", "Error: Sefaria's CMS cannot be reached"));
      console.error(error);
    }
  })();
} else {
  setChildren(document.querySelector("div.row.static-text"), el("h1", "Error: Sefaria's CMS cannot be reached"));
}
