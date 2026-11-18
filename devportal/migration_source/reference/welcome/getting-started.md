---
title: Getting Started With the Sefaria API
excerpt: >-
  Learn how to use the Sefaria API to access Jewish texts and their
  interconnections. Get started without needing API keys or authorization.
deprecated: false
hidden: false
link:
  new_tab: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  pages:
    - slug: tutorial-dvar-torah-outliner
      title: 'Tutorial: Dvar Torah Outliner'
      type: endpoint
---
## The Sefaria API

The Sefaria API allows live access to the Sefaria Library’s structured database of Jewish texts and their interconnections. It is designed to make it as simple as possible to get a new web or mobile app up and running.

## Welcome to the Sefaria API Reference!

This is where you will find documentation and interactive playgrounds for many of our most important API endpoints. This reference is powered by our [OpenAPI spec](https://github.com/Sefaria/Sefaria-Project/blob/master/docs/openAPI.json).

> 🚧 Work-In-Progress
>
> Please note: this reference is a work in progress. We are continually refining and improving both the API and its documentation, and we plan to document additional endpoints here in the future. Looking for something you can’t find? [Contact us](page:contact-us) — we'd love to hear from you.

For additional documentation, [check out our technical docs](https://developers.sefaria.org/docs/welcome).

## Getting Started

You don't need much in order to get started with our API; all of our currently documented endpoints can be accessed without API keys, tokens, or authorization.

**Need a simple example?** In this [tutorial](ref:tutorial-dvar-torah-outliner), we guide you step by step through a short script that uses a handful of endpoints.

**Looking to dive deeper?** You can [jump right into our API Reference](ref:get-v3-texts)

**Still puzzled?** You can see what [others have asked](ref:others-have-asked) or [contact us](page:contact-us) for help!

## API Pathways

Below are several pathways through the Sefaria API for developers and researchers who want to become familiar with specific aspects of our data. Organized by use case, these entry points can help you navigate to the data you need as you learn the API.

### Where are the books?

The Sefaria Library offers an open-source digital collection of Jewish books. To see all of the books available right now in the Sefaria Library, see the [Table of Contents](ref:get-index). To retrieve all of the metadata related to a specific book, try out the [Index (v2)](ref:get-v2-index) endpoint.

### Ready to dive into some text data?

Start with [Texts (v3)](ref:get-v3-texts) to retrieve text editions, along with all of the metadata for that given version. Dive into the [Versions](ref:get-versions) endpoint to see all available editions of a given book.

### Links and relationships between texts

One of the most powerful features of Sefaria’s data is the network of links and other relationships between texts. To explore these connections, start with the [Related](ref:get-related) API, which allows you to retrieve related commentaries on a verse, parallel passages, and more.

### Building around a learning schedule?

Explore our [Calendars](ref:calendars)API to access data about the many study schedules tracked in the Sefaria Library.

### Topics

Interested in Topics on Sefaria, our curated pages that organize sources by theme? Check out the [Topic Graph](ref:get-topics-graph) endpoint to retrieve interrelated topics, and the [Ref-Topic-Links](ref:get-ref-topic-links) endpoint to retrieve all of the Topics associated with a given text.

### Images

Use our [Social Media Image](ref:get-img-gen) endpoint to generate shareable graphics based on a selected segment of text.

If you are looking for manuscript images, use the [Manuscripts](ref:get-manuscripts) endpoint to retrieve corresponding manuscript pages for a given text.

### Dictionaries and language tools

Check out the [Lexicon](ref:get-words) endpoint and [Word Completion](ref:get-words-completion) endpoint to get started.

### Building for non-English readers?

Use our [Languages](ref:get-translations) API to see all of the various languages on Sefaria, and query [Translations](ref:get-translations-lang) to see all text editions available for that language. Then use the [Texts (v3)](ref:get-v3-texts) to retrieve the text itself.

### Randomized Content

Need a random text? See [Random Text](ref:get-texts-random) and [Random By Topic](ref:get-random-by-topic) endpoints.
