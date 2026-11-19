---
title: Accessibility, Interns, and the Passages API (September 2025, Issue 6)
excerpt: >-
  Pass a Talmud reference, get back the full sugya — Sefaria's underrated
  Passages API explained, plus accessibility work making every element
  keyboard-navigable, and a community project that mapped 30M Hebrew words of
  commentary across the entire Babylonian Talmud.
deprecated: false
hidden: false
metadata:
  robots: index
---
<br />

Want to get this quarterly newsletter in your inbox? [Sign up today ](https://sefaria.activehosted.com/f/46)for the Sefaria Developer's Digest.

![](https://files.readme.io/ee0af6a0bec4e5f4a924d030475173f240b368a68075d233d6299f82ff110f93-image.png)

<br />

**Issue 6 | September 25, 2025 | 3 Tishrei, 5786**

A key part of Sefaria's vision is expanding access. From the outset, we’ve always been determined to build an open source database that would be future-proof, both serving Sefaria's UI and becoming the foundation of a world of Jewish learning as it grapples with unforeseen technologies. We are now beginning to see this future-focused intention come to fruition.

Before I joined Sefaria, I was making Aramaic flashcards as a hobby — and using Sefaria to get the job done! Even then, I was surprised by how many resources were offered through the free API. Now, as part of the team, I get to see how seriously Sefaria takes supporting the developer community. And, as the use of AI becomes more prevalent and development becomes quicker, I hope to see more projects use Sefaria’s resources to expand the world of Torah beyond what was previously imagined possible.

At Sefaria, we’re very careful when working with AI. We recognize the incredible possibilities AI presents, but we’re very deliberate when considering which AI-powered products to test and release. We have a deep appreciation for both the fundamental and practical limitations of AI, but we also believe Torah is sacred and learning is fundamentally human. We hope our resources continue to help you build products that further Jewish learning around the world.

Please remember that supporting our developer community is a core part of the Sefaria mission. Don’t hesitate to reach out with any question or request — just send an email to [developers@sefaria.org](mailto:developers@sefaria.org) and we’ll get back to you as soon as possible. To support this work (and more!) as we enter the new Jewish year, please consider making a matched donation.

All the best,
Daniel Schreiber
_Software Engineer_

P.S. To learn more about how we work with AI (and how we don’t) [explore our AI on Sefaria page.](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXiaT8Du0_LFVOLcEu2i)

## HOT OFF THE PRESSES:

### Meet the Interns!

For the past few months, our Sefaria engineers have had the pleasure of working closely with three fantastic engineering interns on important upgrades to the library’s infrastructure and capabilities.

From a streamlined app-testing tool to a highlighting feature that’s sure to make studying more straightforward, we’re grateful to Margo Levin, Hershel Thomas, and Aleksandr Gomelskii Kramar for their time and hard work.

[LEARN MORE ABOUT THEIR PROJECTS](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXicT8Du0_LFVOLcEu2i)

## QUICK TECH TIP:

### The Passages API

Have you heard of our Passages API yet? This little known Sefaria API is tremendously useful for those working on projects that reference talmudic texts.

So, how does it work? Simply pass in a reference to a talmudic segment (i.e. Berakhot 2a.1), and the Passages API will return the larger sugya (discussion) that encompasses the segment in question. Try these examples:

* [Berakhot 2a:1-5](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXmaT8Du0_LFVOLcEu2i)
* [Sanhedrin 3b:2-13](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXmbT8Du0_LFVOLcEu2i)
* [Bava Batra 5a:7-6a:6](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXmcT8Du0_LFVOLcEu2i)

And let us know if you find this useful!

[SHARE YOUR THOUGHTS](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXidT8Du0_LFVOLcEu2i)

<br />

## Behind the Scenes: Improving Accessibility

Accessibility is a key part of Sefaria’s work — for people everywhere, of all abilities. That’s why we’ve been working hard on improving our platform’s accessibility features. The core work on this project involves making every interactive element keyboard-navigable with clear focus indicators so users relying on keyboards or assistive technologies can navigate through menus, dropdowns, and text selections without ever touching a mouse. We're also adding ARIA (Accessible Rich Internet Applications) labels throughout (these tell screen readers what each button actually does), improving color contrasts for low-vision users, standardizing and consolidating our component architecture, and ensuring every image has descriptive text. This kind of foundational work will make future development faster and more reliable.

In addition, we're experimenting with BRF (Braille Ready Format) support in our download feature, which would allow direct translation to braille displays. If you have experience with BRF (or any other component of accessibility development), we'd love to hear from you!

[DROP US A LINE](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y.0OJs3HFzidbyj_Y2bHTDJXidT8Du0_LFVOLcEu2i)

## SPOTLIGHT: POWERED BY SEFARIA

### The Talmud Commentary Atlas

Ever wondered what a map of the rabbinic scholarship of the Talmud would look like? Wonder no longer! This project charts the breadth, depth, and evolution of commentary throughout the Babylonian Talmud through interactive visualizations and statistical analysis. By extracting and analyzing Jewish religious commentary from Sefaria's database (including over 30 million Hebrew words from 63 different collections that span all 36 sections of the Babylonian Talmud) the developers who created this project have created a refined dataset encompassing works from 47 verified religious scholars. Check out the [GitHub documentation](https://github.com/AChompSitsIn/The-Talmud-Commentary-Atlas?tab=readme-ov-file#visualizations) to see five sophisticated visualization analyses that reveal different aspects of talmudic scholarship patterns, including Archetypes of Scholarship, Center of Gravity Analysis, Evolving Style of Commentary, and more.

<Image align="center" src="https://files.readme.io/b694f092130a09830f6ed1f1485193b1e842fa1be5af748d1520f834f12ff6e6-archetypes_of_scholarship.png" />

# Helpful Links

[The Developer Portal](https://developers.sefaria.org/)   |   [Sefaria’s API ](https://developers.sefaria.org/reference/getting-started)  |  [GitHub](https://github.com/Sefaria/Sefaria-Project)   |   [About Sefaria](https://www.sefaria.org/about)
