---
title: Topic Ontology
excerpt: >-
  Learn how Topics on Sefaria are organized, and how to access them using the
  Sefaria API.
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
      slug: api-wiki
      title: The Sefaria API
---
To learn more about Topics on Sefaria, see the [Topics API](ref:get-topic-slug).

Sefaria's Topics collection is organized as an ontology based on [BFO](https://en.wikipedia.org/wiki/Basic_Formal_Ontology). Below is a basic overview of BFO's structure, followed by some of the more important nodes Sefaria has added. The `slug` is the unique ID used in our database.

# An Overview of BFO

The BFO, or Basic Formal Ontology, is a foundational ontology that provides a set of fundamental terms and relationships for describing the structure of reality. BFO aims to provide a common framework for describing entities and their relationships that is independent of any specific domain. Sefaria has built upon this to create an ontology for Topics on Sefaria.

_For a complete documentation of BFO, see [here](https://github.com/BFO-ontology/BFO#implementations)._

## Slugs and Nodes

The following table includes information about the various nodes and their meanings.

| `slug`                                      | Name                                      | Description                                                                                                                                                                                                                                      | Parents                             |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `entity`                                    | Entity                                    | This is a root node                                                                                                                                                                                                                              | N/A                                 |
| `continuant`                                | Continuant                                | Can only be sliced in space and not in time. This entity continues to exist through time while maintaining its identity.                                                                                                                         | `entity`                            |
| `occurent`                                  | Occurent                                  | This is where continuants get applied or executed. It can be sliced in time.                                                                                                                                                                     | `entity`                            |
| `independent-continuant`                    | Independent Continuant                    | This continuant exists independent of any other entity. Examples include people, planets, and ping pong balls.                                                                                                                                   | `continuant`                        |
| `specifically-dependent-continuant`         | Specifically Dependent Continuant         | This is a continuant whose existence is dependent on another entity, also described as a quality. For example, you can't have a headache without a head. Therefore, the headache is specifically dependent.                                      | `continuant`                        |
| `generically-dependent-continuant`          | Generically Dependent Continuant          | This is a continuant whose existence is not dependent on a specific entity but on another entity in a more general way. Examples include a PDF file or a law.                                                                                    | `continuant`                        |
| `acts`                                      | Process                                   | This is always 1D. It is an act that takes time to complete.                                                                                                                                                                                     | `occurent`                          |
| `process-boundary`                          | Process Boundary                          | This is the boundary of a process: the beginning, end, or other threshold. By definition, this occupies a 0D temporal region.                                                                                                                    | `occurent`                          |
| `time`                                      | Time                                      | This is a temporal region, an occurrent entity that is part of time, as defined in relation to a reference frame.                                                                                                                                | `occurent`                          |
| `spatiotemporal-region`                     | Spatiotemporal Region                     | A spatiotemporal region is an occurrent entity that is part of space-time.                                                                                                                                                                       | `occurent`                          |
| `material-entity`                           | Material Entity                           | This is an entity composed of molecules.                                                                                                                                                                                                         | `independent-continuant`            |
| `immaterial-entity`                         | Immaterial Entity                         | This is an entity that is not composed of molecules.                                                                                                                                                                                             | `independent-continuant`            |
| `quality`                                   | Quality                                   | This describes the attributes of an entity, such as width or color.                                                                                                                                                                              | `specifically-dependent-continuant` |
| `realizable-entity`                         | Realizable Entity                         | This is an entity that is actualized when a specific action is performed.                                                                                                                                                                        | `specifically-dependent-continuant` |
| `process-profile`                           | Process Profile                           | This is an abstract representation or a smaller part of a larger process.                                                                                                                                                                        | `acts`                              |
| `instant`                                   | Zero-Dimensional Temporal Region          | This is an occurrent that has zero dimensions, representing a specific, indivisible point in time.                                                                                                                                               | `time`                              |
| `one-dimensional-temporal-region`           | One-Dimensional Temporal Region           | This is an extended region of time that possesses duration.                                                                                                                                                                                      | `time`                              |
| `object`                                    | Object                                    | This is an entity that has a continuous boundary, such as an animal or a building.                                                                                                                                                               | `material-entity`                   |
| `fiat-object-part`                          | Fiat Object Part                          | This is a subjective sub-part of a larger object. For example, an arm is an object, but it is part of a larger object: a human.                                                                                                                  | `material-entity`                   |
| `object-aggregate`                          | Object Aggregate                          | This is a collection of objects that are, themselves, objects or object aggregates. For example, a population or nation.                                                                                                                         | `material-entity`                   |
| `relational-quality`                        | Relational Quality                        | This is a specific type of attribute that connects more than one independent continuant simultaneously, binding them together by the nature of their relationship to one another.                                                                | `quality`                           |
| `role`                                      | Role                                      | This is a specific type of realizable entity (a dependent continuant) that is assigned to an entity based on its social, institutional, or contextual use rather than its intrinsic or physical makeup                                           | `realizable-entity`                 |
| `disposition`                               | Disposition                               | This is a specifically dependent continuant that can only exist if certain features of its bearer exist. It requires a physical change in the bearer to begin or to cease in order to exist.                                                     | `realizable-entity`                 |
| `places`                                    | Site                                      | This is a three-dimensional entity that is not made of matter and is partially bounded by either a material entity or by fiat boundaries. For example, valleys, tunnels, dents, and airspace are all spaces that are not fully bounded.          | `immaterial-entity`                 |
| `continuant-fiat-boundary`                  | Continuant Fiat Boundary                  | This is an immaterial entity of zero, one, or two dimensions that exists based on human convention or cognitive reference, rather than a physical or natural discontinuity. For example, the entrance to a cave. It serves to demarcate objects. | `immaterial-entity`                 |
| `zero-dimensional-continuant-fiat-boundary` | Zero-dimensional Continuant Fiat Boundary | This is a fiat point. It is an immaterial, zero-dimensional entity whose location is defined in relation to a material entity and that exists without corresponding to any physical discontinuity or spatial mark.                               | `continuant-fiat-boundary`          |
| `one-dimensional-continuant-fiat-boundary`  | One-dimensional Continuant Fiat Boundary  | This is an arbitrary, one-dimensional border or edge defined by human agreement or cognitive framing, rather than by physical boundaries                                                                                                         | `continuant-fiat-boundary`          |
| `two-dimensional-continuant-fiat-boundary`  | Two-dimensional Continuant Fiat Boundary  | This is an immaterial entity with a location determined by a material entity.                                                                                                                                                                    | `continuant-fiat-boundary`          |
| `function`                                  | Function                                  | This is a specific type of realizable dependent continuant. It represents an internal capability, tendency, or power that an object possesses by virtue of how it was built or how it evolved.                                                   | `disposition`                       |

# Overview of Sefaria's Nodes

Below are some of the most important nodes the Sefaria infrastructure uses, in addition to the existing ontology. In the table below, you'll see them delineated according to the relevant BFO node.

## BFO Node: Process

| `slug`                | Name                | Parents   |
| --------------------- | ------------------- | --------- |
| `musical-process`     | Musical Process     | `art`     |
| `history`             | History             | `acts`    |
| `lifecycle-events`    | Lifecycle Events    | `acts`    |
| `halachic-process`    | Halakhic Process    | `acts`    |
| `art`                 | Art                 | `acts`    |
| `weather`             | Weather             | `acts`    |
| `theological-process` | Theological Process | `acts`    |
| `biblical-event`      | Biblical Event      | `history` |

## BFO Node: Temporal Region

| `slug`              | Name              | Parents                           |
| ------------------- | ----------------- | --------------------------------- |
| `weeks`             | Weeks             | `one-dimensional-temporal-region` |
| `months`            | Months            | `one-dimensional-temporal-region` |
| `seasons`           | Seasons           | `one-dimensional-temporal-region` |
| `years`             | Years             | `one-dimensional-temporal-region` |
| `part-of-day`       | Part of Day       | `one-dimensional-temporal-region` |
| `days`              | Days              | `one-dimensional-temporal-region` |
| `fasting`           | Fasting           | `days`                            |
| `holidays`          | Holidays          | `one-dimensional-temporal-region` |
| `rabbinic-holidays` | Rabbinic Holidays | `holidays`                        |
| `torah-holidays`    | Torah Holidays    | `holidays`                        |
| `shalosh-regalim`   | Shalosh Regalim   | `torah-holidays`                  |
| `high-holidays`     | High Holidays     | `torah-holidays`                  |

## BFO Node: Realizable Entity

| `slug`                              | Name                              | Parents                           |
| ----------------------------------- | --------------------------------- | --------------------------------- |
| `freedom`                           | Freedom                           | `disposition`                     |
| `middot`                            | Middot                            | `disposition`                     |
| `emotions`                          | Emotions                          | `disposition`                     |
| `knowledge`                         | Knowledge                         | `disposition`                     |
| `divine-names`                      | Divine Names                      | `role`                            |
| `halachic-role`                     | Halakhic Role                     | `role`                            |
| `role-of-person`                    | Role of Person                    | `role`                            |
| `halachic-role-of-inanimate-object` | Halakhic Role of Inanimate Object | `halachic-role`                   |
| `halachic-role-of-person`           | Halakhic Role of Person           | `halachic-role`, `role-of-person` |
| `family-roles`                      | Family Roles                      | `role-of-person`                  |
| `vocations`                         | Vocations                         | `role-of-person`                  |

## BFO Node: Qualities

| `slug`                                  | Name                                  | Parents                        |
| --------------------------------------- | ------------------------------------- | ------------------------------ |
| `halachic-quality`                      | Halakhic Quality                      | `quality`                      |
| `material-quality`                      | Material Quality                      | `quality`                      |
| `numbers`                               | Numbers                               | `quality`                      |
| `relational-quality`                    | Relational Quality                    | `quality`                      |
| `colors`                                | Colors                                | `material-quality`             |
| `preposition`                           | Preposition                           | `relational-quality`           |
| `covenants`                             | Covenants                             | `relational-quality`           |
| `specific-person-relationship`          | Specific Person Relationship          | `relational-quality`           |
| `specific-biblical-person-relationship` | Specific Biblical Person Relationship | `specific-person-relationship` |

## BFO Node: Generically Dependent Continuants

The topic `religion` here could also be referred to as `religious-idea` or similar.

| `slug`                | Name                | Parents                            |
| --------------------- | ------------------- | ---------------------------------- |
| `laws`                | Laws                | `generically-dependent-continuant` |
| `philosophy`          | Philosophy          | `generically-dependent-continuant` |
| `science`             | Science             | `generically-dependent-continuant` |
| `language-entity`     | Language Entity     | `generically-dependent-continuant` |
| `texts`               | Texts               | `generically-dependent-continuant` |
| `ethics`              | Ethics              | `generically-dependent-continuant` |
| `halakhah`            | Halakhah            | `law`                              |
| `halachic-principles` | Halakhic Principles | `halakhah`                         |
| `language`            | Language            | `language-entity`                  |
| `letters`             | Letters             | `language-entity`                  |
| `phrase`              | Phrase              | `language-entity`                  |
| `words`               | Words               | `language-entity`                  |
| `religion`            | Religion            | `philosophy`                       |
| `magic`               | Magic               | `philosophy`                       |
| `spiritual-places`    | Spiritual Places    | `religion`                         |
| `theological-tenets`  | Theological Tenets  | `religion`                         |
| `biblical-source`     | Biblical Source     | `texts`                            |

## BFO Node: Object Aggregate

| `slug`                       | Name                       | Parents                     |
| ---------------------------- | -------------------------- | --------------------------- |
| `group-of-living-creatures`  | Group of Living Creatures  | `object-aggregate`          |
| `group-of-inanimate-objects` | Group of Inanimate Objects | `object-aggregate`          |
| `group-of-animals`           | Group of Animals           | `group-of-living-creatures` |
| `group-of-plants`            | Group of Plants            | `group-of-living-creatures` |
| `group-of-people`            | Group of People            | `group-of-living-creatures` |
| `peoples`                    | Peoples                    | `group-of-people`           |

## BFO Node: Object

| `slug`             | Name             | Parents            |
| ------------------ | ---------------- | ------------------ |
| `living-creature`  | Living Creature  | `object`           |
| `inanimate-object` | Inanimate Object | `object`           |
| `food`             | Food             | `inanimate-object` |
| `animals`          | Animal           | `living-creature`  |
| `people`           | People           | `living-creature`  |
| `plants`           | Plants           | `living-creature`  |
| `biblical-figures` | Biblical Figures | `People`           |
| `mishnaic-people`  | Mishnaic People  | `People`           |
| `talmudic-people`  | Talmudic People  | `People`           |
| `geon-person`      | Geon Person      | `People`           |
| `rishon-person`    | Rishon Person    | `People`           |
| `achron-person`    | Achron Person    | `People`           |
| `modern-person`    | Modern Person    | `People`           |
| `mammals`          | Mammals          | `animals`          |
| `fish`             | Mammals          | `animals`          |
| `birds`            | Birds            | `animals`          |
| `bugs`             | Bugs             | `animals`          |
| `reptiles`         | Reptiles         | `animals`          |
| `amphibians`       | Amphibians       | `animals`          |
| `worms`            | Worms            | `animals`          |

## BFO Node: Immaterial Entity

| `slug`                | Name                | Parents  |
| --------------------- | ------------------- | -------- |
| `geography`           | Geography           | `places` |
| `geographic-features` | Geographic Features | `places` |
| `structures`          | Structures          | `places` |

## BFO Node: Fiat Object Part

| `slug`       | Name       | Parents            |
| ------------ | ---------- | ------------------ |
| `body-parts` | Body Parts | `fiat-object-part` |

# Overview of Sefaria Link Types

Below is a comprehensive list of link types that can exist between nodes in the Sefaria infrastructure. Please note:

- Every Topic link in our database must be one of these types.
- Every link is bidirectional. Therefore, if you're reading the link in the forward direction, you should use `slug`, but if you're reading it in the backward direction, use `inverseSlug`.

Below is an example of a bidirectional Topic link:

```
{
    "fromTopic": "isaac",
    "toTopic": "abraham",
    "linkType": "child-of"
}
```

In the forward direction, this link would be read as `isaac` -`child-of`-> `abraham`. In the backward direction, however, this link would be read as `abraham`-`parent-of`-> `isaac`. All links in our database are saved using the link type's `slug`, not the `inverseSlug`.

Links with the same `slug` and `inverseSlug` are symmetrical. As yet, we have not inferred Topic links from existing links (e.g., if we know "a" is a child of "b", and "c" is a sibling of "a", then "c" is a child of "b").

## Link Types Between People

The following are link types that connect two individual people.

| `slug`              | `inverseSlug`       | Description                                                                                                                     |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `child-of`          | `parent-of`         |                                                                                                                                 |
| `child-in-law-of`   | `parent-in-law-of`  |                                                                                                                                 |
| `sibling-of`        | `sibling-of`        |                                                                                                                                 |
| `descendant-of`     | `ancestor-of`       | Used for relating a descendant to their ancestor, e.g., David -`descendant-of` -> Ruth                                          |
| `taught`            | `learned-from`      | Usually used for connecting a rabbi and a student                                                                               |
| `corresponded-with` | `corresponded-with` | Used to connect two people who have communicated with one another, and whose relationship does not fit under another link type. |
| `opposed`           | `opposed`           | Used to connect two people whose views are in opposition to one another.                                                        |
| `cousin-of`         | `cousin-of`         |                                                                                                                                 |
| `spouse-of`         | `spouse-of`         |                                                                                                                                 |

## Link Types Between Other Types of Nodes

Each link type is only valid if the `fromTopic` is of type `Valid From` _and_ if the `toTopic` is of the type `Valid To`.

| `slug`                         | `inverseSlug`                  | Description                                                                                                                                                                            | Valid From                                                                | Valid To                 |
| ------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------ |
| `has-role`                     | `role-of`                      | This is a physical entity that has a social role. For example, David -`has-role`-> king                                                                                                | `material-entity`                                                         | `role`                   |
| `gender-of`                    | `has-gender`                   | This is the gender of a person. For example, male -`gender-of`-> David                                                                                                                 | `gender`                                                                  | `people`                 |
| `person-participates-in-event` | `event-has-person-participant` | This is a person who participated in a historical event.                                                                                                                               | `people`                                                                  | `history`                |
| `adjacent-to`                  | `adjacent-to`                  | This is an independent entity that is located spatially next to another independent entity. For example, menorah -`adjacent-to`-> shulchan                                             | `independent-continuant`                                                  | `independent-continuant` |
| `causes`                       | `has-cause`                    | This is an action which causes another action.                                                                                                                                         | `acts`                                                                    | `acts`                   |
| `member-of`                    | `has-member`                   | This is a physical entity that is part of a larger group. For example, Judah Maccabee -`member-of`-> Maccabees                                                                         | `material-entity`                                                         | `object-aggregate`       |
| `physically-contains`          | `physically-contained-in`      | This is an independent entity that physically contains another independent entity. For example, Israel -`physically-contains`-> Jerusalem                                              | `independent-continuant`                                                  | `independent-continuant` |
| `temporally-contains`          | `temporally-contained-in`      | This is a time thing that contains another time entity. For example, A week -`temporally-contains`-> Shabbat                                                                           | `occurent`                                                                | `occurent`               |
| `participates-in`              | `has-participant`              | This is a non-time entity that takes part in a time entity. For example, shabbat-candles - `participates-in`-> Shabbat                                                                 | `continuant`                                                              | `occurent`               |
| `precedes`                     | `preceded-by`                  | This is a time entity that temporally precedes another time entity. For example, Shabbat -`precedes`-> Sunday                                                                          | `occurent`                                                                | `occurent`               |
| `applies-halacha`              | `has-halachic-application`     | This is a halakhic action that applies a certain halakhic ruling. For example, shaking-lulav -`applies-halacha`-> laws-of-lulav                                                        | `halachic-process`                                                        | `halakhah`               |
| `specifically-dependent-on`    | `has-specific-dependence`      | This is a specifically dependent continuant whose existence depends on another entity. For example, the role `god-of-the-patriarchs` is `specifically-dependent-on`-> `the-patriarchs` | `specifically-dependent-continuant` OR `generically-dependent-continuant` | `entity`                 |
| `relationship-of`              | `has-relationship`             | This is a relationship's dependence on the people in the relationship. For example, `moshe-and-aharons-relationship` is -`specifically-dependent-on`-> Moses                           | `specific-person-relationship`                                            | `people`                 |
| `leader-of`                    | `has-leader`                   | This is a person who was a leader of a specific group of people.                                                                                                                       | `people`                                                                  | `peoples`                |

## General Link Types

The following link types can connect any two nodes:

| `slug`              | `inverseSlug`           | Description                                                                                                                                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is-a`              | `is-category-of`        | This describes an ontological hierarchy between nodes. A - `is-a` -> B implies that B is a more general type of A.                                                          |
| `displays-under`    | `displays-above`        | This describes the display structure of nodes. It is used to display the Table of Contents for Topics on Sefaria's frontend.                                                |
| `synonymous-with`   | `synonymous-with`       | This describes two Topics that are almost always interchangeable. For example, `totafot` is -`synonymous-with`-> tefillin                                                   |
| `similar-to`        | `similar-to`            | This describes Topics that have many similar attributes. For example, `saving` is -`similar-to`-> `rescuing`                                                                |
| `dissimilar-to`     | `dissimilar-to`         | This describes two topics that share few attributes. For example, `work` is -`dissimilar-to`-> `rest`                                                                       |
| `related-to`        | `related-to`            | This describes two topics that are related in a general sense. Usually, this is used to describe two Topics with a relationship that doesn't fit under any other link type. |
| `sheets-related-to` | `has-sheets-related-to` | This describes two topics with a relationship derived from co-location of tags on Sheets.                                                                                   |

<br />
