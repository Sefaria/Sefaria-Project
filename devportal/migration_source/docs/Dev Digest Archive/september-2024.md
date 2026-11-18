---
title: Celery Queues, Local Install and the Shape API (September 2024, Issue 2)
excerpt: >-
  Sefaria's citation detection upgraded from regex to a CNN-based ML model
  (Linker v3, available on HuggingFace), plus the underrated Shape API explained
  and how Celery queues solved text upload timeouts.
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
      slug: june-2024
      title: All About Texts, Volunteering for Tests (June 2024, Issue 1)
---
Want to get this quarterly newsletter in your inbox? [Sign up today ](https://sefaria.activehosted.com/f/46)for the Sefaria Developer's Digest.

![](https://files.readme.io/ee0af6a0bec4e5f4a924d030475173f240b368a68075d233d6299f82ff110f93-image.png)

I’ve always felt that [Pirkei Avot 6:6](https://www.sefaria.org/Pirkei_Avot.6?ven=The_Mishna_with_Obadiah_Bartenura_by_Rabbi_Shraga_Silverstein\&lang=bi) — "Anyone who says something in the name of the one who said it brings redemption to the world" — is a fundamental principle in Torah.

Among other ideas, this text underpins the importance of accurate citations throughout Jewish texts. To enhance the learning experience on Sefaria, we’ve been working diligently to ensure that these citations are easily accessible for our users.

Initially, we used a regular expressions-based approach to link citations, done by storing specific patterns in our database for each type of citation. For example, a typical Genesis citation might look like `<book title> <chapter>:<verse>`. These patterns were encoded into regular expressions to find all related citations. However, regular expressions have their limitations:

- **Inflexibility**: Even a minor deviation from the expected pattern could cause a citation to be missed.
- **Lack of contextual understanding**: Regular expressions can't differentiate between a genuine citation and a similar-looking phrase that isn’t a citation.

**To address these limitations, we’re excited to share that we’re transitioning to a machine learning-based approach.** Our new algorithm uses a convolutional neural network trained on hundreds of examples from our library. This means it can adapt to variations by recognizing citations even when they don’t match a pattern exactly. The algorithm also reduces the occurrence of false positives by understanding the context — a crucial part of identifying genuine citations. Once a citation is detected, a Python layer processes it and links it directly to the relevant text in our library.

We’re calling this new system Linker v3. Both Hebrew and English models are available for download on [HuggingFace](https://huggingface.co/Sefaria?sort_models=modified\&sort_datasets=modified). Additionally, Hebrew results from Linker v3 are accessible through our API, with English support coming soon. Over the next few months, we plan to fully integrate both models into the Sefaria site so our internal citation links are improved.

We hope these advancements support the learning experience on Sefaria and give you some ideas as you’re developing your own Torah-based technologies. Now, let’s dive into some of the tech-related happenings at Sefaria!

Yours,<br />Noah Santacruz<br />Senior Engineering Manager

P.S. I had the honor of giving a presentation about our machine learning research at PyCon Israel 2024 earlier this month and to meet some fantastic local engineers alongside the rest of our engineering team. Thank you to everyone in our community who came to listen!

## HOT OFF THE PRESSES: Local Install vs. API

Over the past months, our community of developers has been asking for a way to install Sefaria locally on their machines instead of working with our API.

As we continue to think about how we can better support you and anyone looking to work with our data, we’d love to hear more about your needs. Which aspects of a local install do you want and why? What advantage does it give you, personally, over using our API?

Please take a moment to [tell us your ideas](https://developers.sefaria.org/page/contact-us) so we can work on building the tools you need most to innovate.

## QUICK TECH TIP: Meet the Shape API

Have you ever met the [Shape API](ref:get-shape)? Often overlooked in favor of some of our more popular API endpoints, it can be a huge help for any text structuring project (i.e., building your own calendar cycle for a text). You can use this API endpoint to quickly see the number of chapters in a book, the number of verses per chapter, and more.

Note: In cases of a [complex text](doc:the-schema-of-a-complex-text), such as a specific commentary on the Torah, the Shape API returns JSON. At first, this might seem a bit more complicated, but if you focus on the depth of the text, you’ll see that the returned array reflects the depth of the text (minus one).

For the Jerusalem Talmud (a depth-3 text), the ‘chapters’ field returns a 2D array. Each sub-array represents a chapter, and each number within that array represents the number of segments for that halakhah. For example, below you’ll see that chapter one, halakhah one has 38 segments.


<Image src="https://files.readme.io/20f89fe0677105f4e991b78c471157c451a65f164a130e0d3c83e6fb6c2fcf8d-shape.jpg" alt="Annotated response of the Shape API" align="center" width="500px" />


## Behind the Scenes

Recently, Sefaria’s engineers encountered a problem: Our POST request for posting new texts to our server (which we rely on internally) had become a very flaky process because the upload process had to do many calculations.

These are the two main issues we ran into:

- **Overloading the web server**, which is already handling production traffic
- **Causing the request to time out** because it lasted longer than the POST timeout

After some consideration, we solved this by moving the POST-request to a dedicated queue. Essentially, all book uploads are now put on a queue and handled by a different, dedicated server. This both takes the load off our web server and avoids timeouts. Now the initial POST request can be finished quickly and the upload process can then take as long as needed.

We use a Python package called [Celery](https://docs.celeryq.dev/en/main/getting-started/introduction.html) to handle our queue management. Our hope is that this improvement will greatly improve our ability to use our POST API for text ingestion.

## Spotlight: Powered by Sefaria


<Image src="https://files.readme.io/949e940e7c352c55ec520329627395ef1464bc0b963a59f2eaf0d0431e3cdf4f-Screen_Shot_2024-10-08_at_12.20.31.png" align="center" width="500px" />


This summer, a fantastic high school volunteer wrote a new tutorial for using our Developer Portal. Using endpoints like the [Shape API](ref:get-shape) (see above) and [Ref-Topic-Links](ref:get-ref-topic-links), she was able to write the basic framework for a Tanakh trivia game in fewer than one hundred lines of Python code. Her tutorial provides yet another example of how simple it can be to build a powerful Torah-based using Sefaria’s API. You can see it [here](https://developers.sefaria.org/reference/tutorial-tanakh-trivia-game)!

Can you expand it further? Let us know what you build!

***

Want to get this quarterly newsletter in your inbox? [Sign up](https://sefaria.activehosted.com/f/46) today for the Sefaria Developer's Digest.

### Your donation powers the future of Torah - for _all_.

Sefaria’s resources have always been free to use — and that will always be true.<br />[Join the community of Sefaria supporters](https://www.sefaria.org/donate) who are the force behind new resources, new tech, new tools, and more.
