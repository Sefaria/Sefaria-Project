---
title: Top Tech Tips, New Projects, and More! (March 2025, Issue 4)
excerpt: >-
  How to fetch Hebrew author names via the v2/index API, a zero-ellipsis CSS
  trick for clamped topic grids, and an interesting community project for a
  clean read of the Talmud building on Sefaria's data.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
Want to get this quarterly newsletter in your inbox? [Sign up today ](https://sefaria.activehosted.com/f/46)for the Sefaria Developer's Digest.

![](https://files.readme.io/ee0af6a0bec4e5f4a924d030475173f240b368a68075d233d6299f82ff110f93-image.png)

**Issue #4 | March 19, 2025 | 19 Adar, 5785**

Last week, Jews around the world celebrated Purim — a holiday that’s all about hidden miracles, made even more mysterious by the intricate workings of hidden systems of providence. The book of Esther is unique among biblical texts; it never explicitly mentions God’s name, yet divine providence is woven throughout. Throughout the text, Mordechai and Esther must navigate a world of political intrigue and make careful, calculated moves to save their people.

Sound familiar? It should — because this is exactly what we do as software engineers.

It’s no secret that the best software is often invisible. Users see a clean, intuitive interface, unaware of the intricate logic, data structures, and APIs operating in the background. Esther couldn't simply march into the king's court and demand justice — she had to maneuver carefully. Similarly, our work as developers is about crafting seamless experiences by ensuring the underlying code is structured, optimized, and resilient.

Likewise, Esther and Mordechai didn’t get to choose the rules of the Persian Empire — they had to work within them. The same is true for us: We deal with legacy code, API limitations, security requirements, and performance constraints. Our job isn’t to fight the system but to understand it, adapt, and innovate within the given framework. Just like Esther found a way to turn a seemingly hopeless decree into a victory for the Jewish people, we take on technical debt, tight deadlines, and external dependencies — and still ship great products.

In the spirit of Purim, let’s take a moment to appreciate the unseen work — the hidden intricacies of engineering that make everything run smoothly. Like Esther and Mordechai, we may not always be in the spotlight, but our careful planning and execution shape the world in ways that matter.

Happy coding!  
Ephraim Damboritz  
Principal Engineer

## HOT OFF THE PRESSES: Powered & Linked by Sefaria

Want to know who else is using Sefaria to build apps and projects powered by our data? We’ve got you covered with two new pages on the Sefaria Developer Portal.

**Powered by Sefaria:** See a detailed list of projects (including, in many cases, code repositories) using our data or API for everything from AI searches to audio/visual integrations with texts. [Learn more…](https://developers.sefaria.org/docs/powered-by-sefaria)

**Linked by Sefaria:** Check out a full list of sites using the Sefaria Linker to link text citations directly to their source text in the library. [Learn more…](https://developers.sefaria.org/docs/sites-using-the-linker)

Have a project powered by Sefaria data and don’t see yourself on the page? We want to hear about it! Fill out the form below to let us know and share what you’re building.

[SUBMIT YOUR PROJECT](https://sefaria.formstack.com/forms/powered_by_sefaria_submission_form)

## QUICK TECH TIP: Hebrew Author Names

Recently, a member of our developer community reached out and asked about how to retrieve Hebrew author names for texts. The answer is surprisingly simple — so we thought we’d share it here, too.

Retrieving Hebrew-language author names (e.g., instead of “Rashi” retrieving “רש״י”) can be achieved most effectively via the v2/index API. See the below image for clarity on how to retrieve this data.

Note: While the v2/Index API is well documented on the Developer Portal, this specific endpoint is not yet documented. It’s in the works, though, so stay tuned!

![](https://files.readme.io/6b123248280a0959fe2deb3da4e064134076d8a636e0582156d8190bc871116b-image.png)

[EXPLORE THE V2/INDEX API](https://developers.sefaria.org/reference/get-v2-index)

## Behind the Scenes: CSS Tricks

Earlier this month, Sefaria launched a new-and-improved Topics landing page, designed to help learners explore texts by topic instead of book title. As part of the page design, we wanted to display five rows of Topics that randomly populate on every page refresh. We achieved this by pinging the Topics API, which returns a large number of Topics.

Then, we restricted it to five rows using the `-webkit-line-clamp `[CSS property. ](https://developer.mozilla.org/en-US/docs/Web/CSS/line-clamp)This was great, but it still left us with a problem: `-webkit-line-clamp` appends an unnecessary ellipses after the last item! To work around this issue, we created a ‘[dummy’ font ](https://github.com/Sefaria/Sefaria-Project/blob/38c56cd3094a7306110b1db09170822f239563b1/static/css/s2.css)(as seen on [Stack Overflow](https://stackoverflow.com/questions/72207010/is-it-possible-to-use-line-clamp-without-displaying-an-ellipsis)) which takes the ellipses and reduces the size to 0%, essentially hiding it. You can see how it works in the below image.

![](https://files.readme.io/469dc03ffd6578479f909626f1200d1651970e10646fa893b5240b3db70f950f-image.png)

<br />

# SPOTLIGHT: POWERED BY SEFARIA**

## Read the Talmud

[Talmud.page](https://talmud.page/browse) provides a clear, visually pleasing way to read a number of canonical Jewish texts, including Tanakh, Talmud, Mishnah, and Rambam’s foundational 12th-century work of halakhah known as the Mishneh Torah. By using Sefaria’s data and API, the creators of the Read the Talmud page were able to get the site up and running in no time, bringing these important texts to more learners around the world.

[EXPLORE TALMUD.PAGE](https://talmud.page/browse)

![](https://files.readme.io/75d3121b43d6e04b7b8aaeeaf44ce5b3282a110d3cbaabaa03ef226a074f5b66-image.png)

<br />

# Helpful Links

[The Developer Portal](https://developers.sefaria.org/)   |   [Sefaria’s API ](https://developers.sefaria.org/reference/getting-started)  |  [GitHub](https://github.com/Sefaria/Sefaria-Project)   |   [About Sefaria](https://www.sefaria.org/about)