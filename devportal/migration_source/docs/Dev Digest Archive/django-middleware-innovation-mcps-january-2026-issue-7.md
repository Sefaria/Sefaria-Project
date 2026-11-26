---
title: Django middleware innovation & MCPs (January 2026, Issue 7)
excerpt: >-
  How do you split one monolith into three products without touching the
  codebase? Sefaria's engineering team did it with subdomain-aware Django
  middleware — read how a single dictionary lookup powers module-aware routing
  across 100+ views.
deprecated: false
hidden: false
metadata:
  robots: index
---
Want to get this quarterly newsletter in your inbox? [Sign up today](https://sefaria.activehosted.com/f/46) for the Sefaria Developer's Digest.

![](https://files.readme.io/ee0af6a0bec4e5f4a924d030475173f240b368a68075d233d6299f82ff110f93-image.png)

**Issue 7 | January 28, 2026 |  10 Shevat, 5786**

Each Kabbalat Shabbat, Jews around the world sing the 16th-century liturgical poem [Lekha Dodi](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y7xeFr13InikA0_ueglPHFJXmc95_6yd-YVvFv2XMojq). The text includes the words "shamor vezakhor bedibbur echad" ("keep and remember in one saying"), a phrase that celebrates the mystical incomprehensibility of the revelation at Mount Sinai.

This concept might make for lovely poetry, but saying _shamor_ and _zakhor_ at the same time doesn't make for a good user experience. That's why the engineering team has been hard at work creating a newly modularized structure for Sefaria's platform. This project adds no new features; it simply separates our content into distinct modules for the sake of a better user experience. Now the Sefaria website is divided into three spaces: the [Sefaria Library](https://www.sefaria.org) (for texts), [Voices on Sefaria](https://voices.sefaria.org) (for user-created content), and [Developers on Sefaria](https://developers.sefaria.org) (for developer tools).

The engineering of a modularized Sefaria has been almost entirely a matter of refactoring and reorganizing our code, a process that brings to mind the work of the 12th-century scholar Rambam when composing his seminal text, the Mishneh Torah. He, too, was reorganizing — separating the Talmud into 14 different books.

In his own way, Rambam was trying to solve a similar problem: How can one present a massive body of information in a finite, user-friendly way? Like any good refactorer, he didn't change the underlying content but instead revealed its underlying structure. Working on Sefaria's modularization has felt like participating in this same tradition of clarifying the path upon which others can walk towards Torah learning.

We hope you enjoy the new Developers on Sefaria space (formerly the Sefaria Developer Portal). As always, you can reach out with questions or ideas at any time — just drop us a note at [developers@sefaria.org](mailto:developers@sefaria.org).

Happy coding,

Steve Kaplan

_Software Engineer_

## HOT OFF THE PRESSES

### Django Middleware for a Modularized Platform

Building Sefaria's newly restructured platform was anything but simple. We had to split one space into two spaces for two distinct user experiences: the Sefaria Library for text study, Voices on Sefaria for producing or exploring user-created content. The core challenge was extracting user-created Sheets from the Library and building a new (and user-friendly!) space just for this independently created content. (Thankfully, Developers on Sefaria only needed a new homepage, but we still had to connect it to the other two products.)

Working with a legacy, monolith codebase made this especially tricky. Plus, we'd decided against refactoring into multiple services. We needed a way to split the content previously hosted on Sefaria.org into the Library and Voices — all while maintaining the current site, shipping features, and maintaining the monolith codebase.

Two domains, two products, two distinct themes, two sets of features. And one codebase.

Our solution? Implementing subdomain-based routing with middleware that made every request "module-aware". This enabled us to:

- Simplify rendering of over 100 views (just hostname parsing by the middleware, no database calls)
- Achieve zero performance degradation despite dividing into two products vs. single-product baseline
- Maintain the monolith legacy codebase, while being flexible for modularity (a shared database with a separate UX)

Using this elegant approach, we were able to meet our technical constraints and enable module separation while minimizing code duplication and preventing performance degradation. The core of the configuration is the DOMAIN_MODULES setting structure, which serves as the single source of truth to map hostnames to the product modules. This is then used in the deployment configuration, to help with the frontend theming, and for the backend routing via the middleware.

### Middleware Implementation

The core pattern of the middleware is that the middleware parses the hostname, refers to the dictionary lookup, and then enriches the request with the specific module awareness. The middleware runs once per request, before any view code. There are no database queries, just in-memory dictionary lookups.


<Image src="https://files.readme.io/db6878f5e7eae2061f2b467445d63547349138ab6eecbf32d0e2725cc249d227-image.png" align="center" caption="Middleware implementation example" />


This is an example of a simplified implementation.

### Usage in Views & Templates

Downstream, every view automatically has access to the valuable request.active_module which contains the const value of the current active module. This allows for content filtering (i.e., do I render sheets-topics or library-topics?), feature toggling, and even allows analytics to be module-aware and module-specific.

Here's a simplified example, in which we can render history on a module-aware basis (i.e., in the Voices on Sefaria product, this will show your history as related to Sheets, while in the Sefaria Library product, this will show your history as related to Library sources).


<Image src="https://files.readme.io/b94ad18b77da0b60c8f33fe97767625b2a1a3b56a624ac78813c90b17ce763e1-image.png" align="center" caption="Usage in views and templates example" />


<br />

## QUICK TECH TIP

### The Sefaria MCPs

Do you use an AI assistant for everyday questions or coding projects? If so, you'll want to know about these two useful new tools. Each one integrates your AI tools with Sefaria's library and data in a distinct way. The Sefaria Developers MCP allows your favorite AI coding agent (like Claude Code or Cursor) to connect directly with our API and documentation. This means it can write code using the Sefaria API in just a few moments. The Sefaria Text MCP connects your AI assistant straight to our actual digital stacks, so you can ask Claude or ChatGPT to search in the Sefaria Library and get an answer in seconds.

[LEARN HOW TO GET STARTED](https://newsletter.sefaria.org/lt.php?x=4lZy~GDDU6ScE8Ctyt~LVulu13QljQH0kewvYHTJV3XN583.-0y7xeFr13InikA0_ueglPHFJXmc95_6yd-YVvFv2XMok8)

<br />

# Helpful Links

[The Developer Portal](https://developers.sefaria.org/)   |   [Sefaria’s API ](https://developers.sefaria.org/reference/getting-started)  |  [GitHub](https://github.com/Sefaria/Sefaria-Project)   |   [About Sefaria](https://www.sefaria.org/about)
