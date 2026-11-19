---
title: The Sefaria MCPs
excerpt: >-
  Use our MCPs to integrate your LLM of choice with the texts in the Sefaria
  Library and with our open-source data.
deprecated: false
hidden: false
link:
  new_tab: false
metadata:
  robots: index
---
The Sefaria MCP (Model Context Protocol) servers connect your favorite AI tools directly to Sefaria's vast library of Jewish texts — and to our API and data. Writing code and answering questions just got a lot easier.

## What is an MCP?

An MCP is a standardized way for LLMs to connect to external data sources and APIs. It's a bridge that lets your AI chat with databases, search engines, and specialized libraries. Think of it as an adaptor cable that lets your AI tools connect seamlessly with an external source.<br /><br />For those looking for a technical deep-dive, you can explore the code [here](https://github.com/Sefaria/sefaria-mcp).&#x20;

### The Sefaria Developers MCP - [https://developers.sefaria.org/mcp](https://developers.sefaria.org/mcp)

This tool allows your AI assistant of choice to converse directly with the Sefaria API. This means your LLM can search and retrieve any data and write the code you need to build tools and programs based on Sefaria’s indices. Connect to Claude Code, Cursor, or any other MCP-Compatible AI tool, and watch the JavaScript write itself.

### The Sefaria Texts MCP - [http://chat.sefaria.org/mcp/](http://chat.sefaria.org/mcp/ "http://chat.sefaria.org/mcp/")

This tool allows your AI assistant of choice to converse directly with the Sefaria Library. This means your LLM can search and retrieve any text from our database and return a response with precise citations to specific sources. Now, when you ask Claude or ChatGPT what Rashi says about Genesis 1:6, you can be sure you’re getting a precise answer.

<Callout icon="❗️" theme="error">
  ### Second-Party Requirements

  **Please note:** You must have a paid Claude or ChatGPT account to connect an MCP
</Callout>

## Quick Setup Guide

1. Copy the relevant MCP URL:
   1. Sefaria Texts MCP: [http://chat.sefaria.org/mcp/](http://chat.sefaria.org/mcp/ "http://chat.sefaria.org/mcp/")
   2. Sefaria Developers MCP: [https://developers.sefaria.org/mcp](https://developers.sefaria.org/mcp)
2. Ensure `no auth` option is toggled
3. Add to your AI Tool:
   1. **Claude**: Go to settings, add as a Custom Connector, enable.
   2. **Cursor**: Configure in MCP settings
   3. **ChatGPT**: Go to settings, then plugins, navigate to browse plugins, click on the "plus" button, configure accordingly
   4. **Gemini**: Click on the Gemini icon in the sidebar, click on the "more" button, followed by the "customize" button. Then, go to the "connectors" tab and click on the "+ custom" button and add the MCP URL.&#x20;
   5. **Other Tools:** Use the MCP URL in your client's server configuration
4. Start Exploring:
   1. Using the Sefaria Texts MCP, ask your questions about Jewish texts. For example:
      1. "What does Genesis 1:1 say?" or "Find me talmudic discussions about kindness"
   2. Using the Sefaria Developers MCP, ask the AI assistant to write code by pulling from our API. For example:
      1. “Help me build a GUI which uses the Sefaria API to focus on Sforno's commentary on Genesis.”