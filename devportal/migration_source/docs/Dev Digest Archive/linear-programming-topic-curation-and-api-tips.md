---
title: Linear Programming, Topic Curation, and API Tips (December 2024, Issue 3)
excerpt: >-
  How Sefaria used linear programming to optimize topic page curation across the
  Jewish canon, plus a trick for deriving Texts API refs from the site URL and
  calculating verse numbers using nested arrays.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: september-2024
      title: Celery Queues, Local Install and the Shape API (September 2024, Issue 2)
---
Want to get this quarterly newsletter in your inbox? [Sign up today ](https://sefaria.activehosted.com/f/46)for the Sefaria Developer's Digest.

![](https://files.readme.io/ee0af6a0bec4e5f4a924d030475173f240b368a68075d233d6299f82ff110f93-image.png)

**Issue #3 | December 19, 2024 | 18 Kislev, 5785**

Which specific texts should one study to fulfill the mitzvah of studying Torah? This can be a tricky question for many. The Talmud offers one potential answer, though! In tractate Kiddushin ([30a](https://www.sefaria.org.il/Kiddushin.30a.10?vhe=hebrew|William_Davidson_Edition_-_Vocalized_Aramaic\&lang=he)), the rabbis posit that we should ensure our study is evenly divided among three significant categories of the Jewish canon: Tanakh, Mishnah, and Talmud.

Recently, as I was participating in the technical aspects of curating sources for Sefaria's topic pages, this verse came to mind. Our team was using LLMs and text embeddings to facilitate curation of sources for approximately 1,000 topics, with a goal of creating engaging, relevant, and diverse pages. Following the wisdom of our sages, we aimed to represent as many different categories as possible from the library.

The curation process involved gathering sources and evaluating them based on "relevance" (how relevant they are to the topic) and "diversity" (how different they are from one another in terms of their meaning and ideas). But how could we ensure that the selected sources were not only optimal in terms of relevance and diversity but also represented a broad range of categories?

To address this challenge, we translated the problem into a linear programming framework — a general method for representing many optimization problems. We encoded our factors and constraints as a set of linear inequalities, with an objective function to maximize. In our case, the objective was to optimize for the inclusion of the greatest number of categories in the selected sources. We used [Python's PuLP library](https://github.com/Sefaria/LLM/blob/main/experiments/topic_source_curation/solver.py) to solve these Linear (Integer) Programming instances. If you'd like, you can see the formal mathematical Linear programming equations and objective function that we used [here](https://developers.sefaria.org/docs/linear-integer-programming-for-topic-pages-sources-selection).

I found this project fascinating — it took software engineering, theoretical computer science, and the words of our sages to tackle, and resolve, an important challenge.

Thank you for being part of Sefaria's developer community!

Until next time,<br />Yonadav Leibowitz<br />Junior Research Engineer

## HOT OFF THE PRESSES: Sefaria @ PyCon Israel

Back in September, Noah Santacruz (Sefaria Senior Engineering Manager) gave a presentation at PyCon Israel. Noah spoke about his journey working with K-Means on text clustering, discovering the algorithm's limitations, and introducing LLMs into the mix to achieve optimized results.

To learn more, [watch Noah's presentation](https://www.youtube.com/watch?v=JUSW7y4wYUQ). Or, give it a try yourself by installing the [llm-cluster-optimizer](https://pypi.org/project/llm-cluster-optimizer) from PyPi!

## QUICK TECH TIP: Using the Texts API

Trying to use the [Texts API](https://developers.sefaria.org/reference/get-v3-texts) for a text like the siddur? You might run into trouble trying to figure out which [ref](https://developers.sefaria.org/docs/text-references) to pass in. Unlike Tanakh or Talmud, where refs are more intuitive (i.e. Genesis 1.1 or Berakhot 2a), texts like the Siddur or the Passover Haggadah are structured a bit less intuitively.

But there's a simple solution! When you navigate to your desired text on [Sefaria.org](https://www.sefaria.org), you'll notice the header of the page contains a path to that specific text. This path is the same as the ref needed to query that specific text via the texts API!

In the example below, you'd follow Siddur Edot HaMizrach → Preparatory Prayers → Modeh Ani

Once you get the hang of it, you can shortcut the whole process by deriving the ref from the work's Table of Contents (ToC). The ref is often a sequence of the path through the ToC.


<Image src="https://files.readme.io/e2e52bd8b7e647a1dc4106f22b0c25d28c925f989ea11f3a8f16123e15261686-Screenshot_2025-01-26_at_11.23.41.png" align="center" width="500px" />


## Behind the Scenes

Did you know that Sefaria also has a [Google Docs browser extension](https://workspace.google.com/marketplace/app/sefaria_for_google_docs/849562338091) that allows you to add, link, and format sources within a Google Doc? We've been offering this product for almost a year, and one of the most frequently requested feature enhancements has been the addition of verse numbers.

This was a tricky puzzle to solve! Due to the technical constraints of working within [Google App Script](https://developers.google.com/apps-script/guides/docs), which doesn't give us access to our model and to the JavaScript utilities we rely on for implementing this feature in sheets, we had to figure out a way to do this with the [texts API](https://developers.sefaria.org/reference/get-v3-texts) alone. That was also problematic, though: The texts API doesn't include verse numbers alongside the text.

Ultimately, one of our senior engineers realized that using the often-overlooked `sections` and `toSections` data returned in the texts API, we'd be able to use a simple nested for loop to calculate the verse and chapter numbers, while still handling edge cases (i.e. a range of text spanning multiple chapters of different length).

Since our text is returned in a nested array structure, combining the dimensions of the array (i.e. the length of text) with this data allows us to increment and calculate the necessary verse numbers.

The basic logic was a simple nested `for` loop:


<Image src="https://files.readme.io/e0f8b68b640bd4ebb06e887603815c4c485c4e1657c3b3611d5e7cf6085036ed-Screenshot_2025-01-26_at_11.26.41.png" align="center" width="500px" />


- `toSections` - If there's a start segment explicit in the data, set the counter to start at that value. If not, set it to `1`. In the above, example, the counter would be set to `23` as seen in `sections`. **Note**: In cases where the `ref` is an entire chapter, there is no second value in the arrays `sections` or `toSections`.
- Iterate verse by verse through the length of the chapter until the end of the text, incrementing the verse number. Upon beginning the next chapter, restart the verse counter at `1`.
- Prior to insertion into the text (via simple text concatenation), we call another function to convert the number to Hebrew gematria for Hebrew texts.

We're thrilled to have used this logic to deploy a new enhancement for Tanakh sources this past month and hope to continue iterating in the future!

## SPOTLIGHT: POWERED BY SEFARIA

### Powering Talmud Study on Hadran

Hadran is an online educational resources dedicated to making Talmud study accessible to Jewish women of all backgrounds and experience levels. The organization achieves this by offering a diverse array of resources, including daily study support, commentary, topical shiurim, and insights — all delivered through the voices of women educators. By creating an accessible digital hub for Talmud learning, Hadran seeks to empower and advance women's engagement with Talmud worldwide.

...and it's also powered by Sefaria! By using our API to integrate relevant texts, Hadran learners have access to the entire Talmud alongside lessons by season women teachers and explanatory essays. In short, Hadran's site doesn't have to build the entire infrastructure or digitize the whole Talmud from scratch — they can just use our systems and data to connect their learns to a wealth of resources.


<Image src="https://files.readme.io/0aa9b75dd89d91b7f001fc7eafc01efd964193465feefa324e7e45fb3dd49b4e-Screenshot_2025-01-26_at_11.28.38.png" align="center" width="500px" />


To see more projects powered by our data, [check out the complete list](https://developers.sefaria.org/docs/powered-by-sefaria).

<br />

﻿

***

<br />

Want to get this quarterly newsletter in your inbox? [Sign up](🔗) today for the Sefaria Developer's Digest.

### Your donation powers the future of Torah - for _all_.

Sefaria’s resources have always been free to use — and that will always be true.<br />[Join the community of Sefaria supporters](https://www.sefaria.org/donate) who are the force behind new resources, new tech, new tools, and more.
