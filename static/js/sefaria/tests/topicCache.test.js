import Sefaria from '../sefaria';


describe("Topic SSR cache hydration", function() {
  beforeEach(function() {
    Sefaria._topics = {};
    Sefaria.getBackgroundData = jest.fn();
  });

  it("caches topicData under the key TopicPage reads", function() {
    const topicData = {
      slug: "shabbat",
      primaryTitle: {en: "Shabbat", he: "שבת"},
      description: {en: "SSR description", he: "תיאור"},
      refs: {},
    };

    Sefaria.unpackDataFromProps({
      initialTopic: "shabbat",
      topicData,
      initialPanels: [],
      versionPrefsByCorpus: {},
    });

    expect(Sefaria.getTopicFromCache("shabbat", {with_html: true}).description.en).toBe("SSR description");
  });
});
