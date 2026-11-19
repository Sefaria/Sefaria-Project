---
title: Calendar API, a User-Requested feature, and More! (June 2025, Issue 5)
excerpt: >-
  Sefaria's Calendar API quirk explained, how a state-management overhaul saved
  half a million user sheets from data loss, and a tool that turns Torah verses
  into sound waves via Gematria.
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

Issue 5 | June 26, 2025 | 30 Sivan, 5785

At Sefaria, as on any engineering team, we spend quite some time trying to estimate the scope of our tasks. Attempting to understand the complexity of a feature, trying to pin down the underlying issue causing a bug, or even just evaluating the time-cost of a seemingly simple rewrite can be tricky. We are constantly trying to figure out how long things will take so that we can better utilize our time and prioritize our work.

We’re not the only people who have struggled with estimates, though. Famously, the people of Israel could have walked to the land of Israel in just 11 days after receiving the Torah at Mount Sinai: "It is eleven days from Horeb to Kadesh-barnea by the Mount Seir route." (Deuteronomy 1:2). But, as we know, it ultimately took the people of Israel over 40 years to reach the land of Israel. (That's more than 1000x longer!)

Estimates are just that — estimates. Far from an exact science, they are heavily dependent on many different factors, some within our control and some not. Of course, we always try our best to provide an accurate estimate. Still, it's important to remember (and remind others) that even the clearest and most direct path can be riddled with pitfalls or lead to unexpected results, which will quickly cause your estimate to slide. Don’t despair. Instead, focus on the end goal and eventually you will reach the promised land.

Happy coding!\
Yitzhak Clark\
Engineering Team Lead

## HOT OFF THE PRESSES:

### An Updated Sheet Editor

For years, the original version of Sefaria’s source sheet editor served our community, producing over half a million sheets in its time on our site! Recently, though, the time had come to deprecate this iteration of the editor — a huge project we completed in late April. All relevant code has now been removed from our codebase. 

Deprecating old features is never something to do lightly; this is especially true when the feature in question is so core to Sefaria. As a result, the project required a lot of careful work and consideration.

Our team put in a lot of hours to ensure the updated editor would be able to really shine, enabling users to create their best sheets while quashing various bugs related to data conversion and preventing data loss. We are, of course, always working to improve this (and all) our products, so keep an eye out for fixes and tweaks as we work!

[LEARN ABOUT THE UPDATED EDITOR](https://www.sefaria.org/sheets/639997?lang=en)

## QUICK TECH TIP:

### Something Odd About the Calendar API?

Have you ever explored our [Calendar API](https://developers.sefaria.org/reference/get-calendars)? This segment of code allows you to retrieve the daily or weekly learning schedule for a given date. It even allows you to customize your results depending on various factors, such as whether you want to see the schedule for learning in the diaspora or in Israel. 

Among the learning schedules available is the daily Tanya, a cycle for completing this foundational work of Chabad Chasidut over the course of a year. It differs from all the other schedules; while most schedules display the [textual reference](https://developers.sefaria.org/docs/text-references) (e.g. Genesis 1.1) as the displayed text, the Daily Tanya displays the date:

![](https://files.readme.io/10bfdd96570289b9d54b0c8ccafa47e0a4d0da78548ed76a4c8986c88da0bac7-image.png)

This is intentional! Unlike most texts, the Tanya actually has its daily portion mentioned as part of the text, so the learning schedule displays the actual date relevant to the Tanya learning cycle.

[TRY OUT THE CALENDAR API](https://developers.sefaria.org/reference/get-calendars)

## Behind the Scenes: A Key Feature for the Updated Editor

![](https://files.readme.io/2468ea53dcf2c4b4612a01fd65418d862716eaf86c05d44c85206a8e45dd8b63-image.png)

When users began writing in with stories of unsaved source sheets lost to a network problem, we knew we had to get to work fixing this issue as soon as possible. The Saved/Unsaved Indicator Project, as we called it, was fundamentally a state management problem, detecting and handling issues when sending user changes to the server. We developed a mechanism to classify different types of problems (network disconnection, user logout, etc.) and programmed the system to transition into appropriate states accordingly. In this way, we managed the flow between valid Changes Saved states and various invalid states that each require different responses.

Throughout this project, we worked closely with our new QA department, ensuring extensive testing for every change. This was achieved through both manual QA processes and rigorous automated tests. We found it particularly meaningful that many of our project specifications came directly from problems our users reported to us, such as losing unsaved changes after extended editing sessions that resulted in automatic logout, or losing data during network disconnections. Being able to provide a truly user-driven solution to real workflow challenges is always a pleasure.

## SPOTLIGHT: POWERED BY SEFARIA

## The Gematriaphone

Ever imagined the Torah as an abstract series of musical sounds? Alexander Boxer did, inspired by the 2020 Powered by Sefaria Contest calling for novel ways to showcase Sefaria’s library. He wondered whether he could use Gematria, the numerological system by which each letter of the Hebrew alphabet corresponds to a numerical value, to turn verses of Torah into sounds. Thus, the Gematriaphone was born.

Boxer built a website with a scroll-wheel interface with which users can quickly navigate to any word of Torah. To hear what the numerical value of a word (i.e. the sum of its letters’s values) sounds like when converted into hertz (Hz) and played as a soundwave, all you have to do is press play and ensure the tool and your device aren’t muted.

[EXPLORE THE GEMATRIAPHONE](https://alexboxer.com/gematriaphone/)

![](https://files.readme.io/c5853989ae7f6cae6a9ca0157420f44145ecf59968a7c8917b0ae1af36bfebca-image.png)

<br />

# Helpful Links

[The Developer Portal](https://developers.sefaria.org/)   \|   [Sefaria’s API ](https://developers.sefaria.org/reference/getting-started)  \|  [GitHub](https://github.com/Sefaria/Sefaria-Project)   \|   [About Sefaria](https://www.sefaria.org/about)