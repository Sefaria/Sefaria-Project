---
title: Accessibility at Sefaria
excerpt: Sefaria policies and standards for static web content accessibility.
deprecated: false
hidden: true
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
## The Problem

It’s relatively easy to make static web content accessible, so long as you use the right HTML tags, and include the proper alt and title tags to help assistive technology identify elements of the page that were are invisible. Using standard HTML web elements also allows for keyboard navigation to work more or less out of the box, and since early websites were essentially styled with a simple document structure to mirror the printed page, they remained relatively easy to navigate for all users.

But complex web applications require structures (e.g. interactive controls) that go beyond what regular HTML offers. We've crafted Sefaria using many divs and spans wrapped with lots of CSS and Javascript in order to get the site to "look" & function the way we might expect it to. However, doing so without paying attention to accessibility means that users who access the site using assistive technology are unable to access large swaths of the information and interactivity we offer.

## An Example

![Screen shot of Sefaria Source Sheet header](https://i.imgur.com/G567peP.png)

Original Code:\
`<div id="save" class="button" onclick="...">...</div>`

This example is visible and clickable to sighted-users, but is unselectable by users navigating via the keyboard, and is functionally invisible to a screen reader and other assistive technology which understands this to be identical to just regular text.

Better:\
`<div id="save" class="button" tabindex="0" onkeyup="..." onclick="...">...</div>`

This adds keyboard navigation to the element, but it's still functionally invisible to a screen reader.

Best:\
`<div id="save" role="button" class="button" tabindex="0" onkeyup="..." onclick="...">...</div>`

This adds the ARIA role attribute so that assistive technologies can now render it properly.

Another Best Alternative:\
`<button id="save" class="button">`\
No JS required, however requires additional CSS hacking to get it to look the same cross-browser, and isn't always possible in all situations

## A digression on ARIA

**ARIA =  Accessible Rich Internet Applications** in short it helps assistive technology understand the `role` (what type of widget is this? (e.g. 'slider')), the `state` (what is its situation? (e.g. 'disabled')), and its `identity` (what does it represent? (e.g. 'volume control'))

This information is mapped by the browser to the operating system's accessibility API and exposed to assistive technologies. Which (ideally) will automatically announce widget-specific hints and prompts (e.g. JAWS "... button - to activate, press SPACE bar")

More details: [https://www.w3.org/TR/wai-aria/](https://www.w3.org/TR/wai-aria/)

***

#### Use html elements other than `<span>` and `<div>` wherever possible

Old standby native HTML elements such as `<button>` `<a>` `<h1>` and newer semantic elements like  `<header>` `<footer>` `<section>` `<aside>` etc. are better for SEO, and out of the box is more easily rendered by accessible technology than `<div>` and `<span>`. Most things will work immediately and without any additional work required (though it may require some additional attention on the CSS side to get the look and feel just right)

***

#### Use ARIA

If you’re stuck with markup that you can’t change easily or really need to display it differently add the tags in. We’ve now tried to bake as many of these as possible into our existing React Components where we’ve already deployed them, and we will be deploying these as we move forward. 

*The general principle is to just tack on a role and and a specific aria-tag where appropriate.*\
e.g.:

* Headings -- if you can’t use `h1-h6`: 
  * `<p class="heading1" role="heading" aria-level="1">Fake Level Heading 1</p>`
  * `<p class="heading2" role="heading" aria-level="2">Fake Level Heading 2</p>`\
    *[Example](https://github.com/Sefaria/Sefaria-Project/blob/f4fbdd4c1033a0ad77ac5d226b5fc17a8ffc7e1a/static/js/ReaderTextTableOfContents.jsx#L290)*

* Toggle Button: 
  * `<span tabindex="0" role="button" aria-pressed="false" class="...">Option</span>`
  * `<span tabindex="0" role="button" aria-pressed="true" class="...">Option</span>`

* Radio Button: 
  * `<span tabindex="-1" role="radio" aria-checked="false" class="...">Yes</span>`
  * `<span tabindex="0" role="radio" aria-checked="true" class="... selected">No</span>`
  * `<span tabindex="-1" role="radio" aria-checked="false" class="...">Maybe</span>`\
    *[Example](https://github.com/Sefaria/Sefaria-Project/blob/585935056248a536cccc019d96361f201c906c84/templates/account_settings.html#L32)*

***

#### Anything that you click that doesn't have text in it needs an `aria-label` attribute.

#### If the role and aria attributes and text of the element doesn't adequately explain what the element does or how it functions, use `aria-label`.

This ARIA attribute effectively tacks on whatever message you assign to it, to whatever element its associated with, and is automagically read immediately after the content is by the screen reader. If you need to give directions or a little more explanation to a user who uses assistive technology, this is the most effective way to do so, even if the rest of the markup isn’t perfect. 

Some places we currently use this include:

* [Text Segments which toggle a new panel opening](https://github.com/Sefaria/Sefaria-Project/blob/f4fbdd4c1033a0ad77ac5d226b5fc17a8ffc7e1a/static/js/TextRange.jsx#L444)
* [Within the search filter box to explain how to navigate it](https://github.com/Sefaria/Sefaria-Project/blob/785da2b25fa6e354eb29d44285df58614328f9a2/static/js/SearchFilters.jsx#L458)

***

#### Set the `tabindex` to 0 on all clickable elements that don't already have focus by default (e.g. `<div>` & `<span>`)

* When these elements become disabled be sure to set the `tabindex` to -1

***

#### When a component becomes visible, you probably want to move the focus to that element.

e.g.:

* [Popup modals](https://github.com/Sefaria/Sefaria-Project/blob/c5bc8cefec7ab6ab88cfdf6150a1318d28b73f13/templates/js/linker.js#L306)
* [New reader panels](https://github.com/Sefaria/Sefaria-Project/blob/f4fbdd4c1033a0ad77ac5d226b5fc17a8ffc7e1a/static/js/ReaderApp.jsx#L708)
* [Search filter box](https://github.com/Sefaria/Sefaria-Project/blob/785da2b25fa6e354eb29d44285df58614328f9a2/static/js/SearchFilters.jsx#L402)

***

#### Clickable elements also need to be triggered on keypress

Much of this will be done for you automatically if you're following the rules above, but otherwise you'll need to write your own keypress events to listen for code 13 (enter) and then trigger the click accordingly. We use a similar pattern to listen for the escape key to [close panels in multipanel mode](https://github.com/Sefaria/Sefaria-Project/blob/f4fbdd4c1033a0ad77ac5d226b5fc17a8ffc7e1a/static/js/ReaderPanel.jsx#L437)

***

#### Notes on modals, menus and other interactive elements we don't use regularly

These are often difficult to manage and require a whole host of other javascript trickery including:

* [Tracking keyboard tab keystrokes and forcing them to stay inside an interface until it's closed](https://github.com/Sefaria/Sefaria-Project/blob/785da2b25fa6e354eb29d44285df58614328f9a2/static/js/SearchFilters.jsx#L340)
* Adding keyboard listener events for arrow keys to allow keyboard navigation\
  *In general, we're trying to build these in higher in the code so you won't need to worry about them, but be aware that this issue exists.*

## Current state and known issues

We now believe that users who access Sefaria with the help of assistive technologies should now have a comparable experience throughout the site to those who do so without (excepting editing source sheets). At worst, users should be able to explain to us what is and isn’t working for them so that we can fix it. 

We plan to continue to address these issues and build even richer accessible experiences going forward.
