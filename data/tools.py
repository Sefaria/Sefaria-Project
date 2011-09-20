# -*- coding: utf-8 -*-

import urllib
import urllib2
import json
import os
import re
from BeautifulSoup import BeautifulSoup


def soup(filename):
	f = open(filename, "r")
	page = f.read()
	f.close()
	return BeautifulSoup(page)


def parseIndex():
	s = soup("index.html")
	table = s.find("table", {"border": 8})
	trs = table.findAll("tr")	
	
	talmud = []
	links = {}
	
	
	f = open("names.json")
	names = json.load(f)
	f.close()
	
	talmudMap = {}
	
	for i in range(len(names)):
		talmudMap[names[i]["titleHe"]] = names[i]["title"]
		
	for i in range(2, len(trs)):
		tds = trs[i].findAll("td")
		for k in range(len(tds)):
			a = tds[k].findAll("a")
			if a:
				t = {}
				t["titleHe"] = a[0].string
				t["title"] = talmudMap[t["titleHe"]]
				talmud.append(t)
				links[t["title"]] = "http://he.wikisource.org%s" % (a[0]["href"])
										
	return links
	
def getIndexPages():
	links = parseIndex()
	
	for book in links:
		wikiGet(links[book], book.replace(" ", "_"))

def getDafLinks(name):
	s = soup("./pages/%s" % (name))
	p = s.findAll("span", "mw-headline")
	
	links = {}
	
	for i in range(len(p)):
		a = p[i].findAll("a")
		if a and not "action=edit" in a[0]["href"]:
			links["%s.%d" % (name, i+1)] = "http://he.wikisource.org%s" % (a[0]["href"])
			
	return links
			

def getDafs():
	ls = os.listdir("./pages")
	for filename in ls:
		if not "." in filename:
			links = getChapterLinks(filename)
			for chapter in links:
				wikiGet(links[chapter], chapter)
		

def parseChapter(filename):
	s = soup(filename)
	mishna = 0
	text = []
	n = s.find("h2").previousSibling
	if not n:
		print "Parsing failed for %s (couldn't find first h2)" % (filename)	
		return
	
	while n.nextSibling:
		n = n.nextSibling
		if n.__class__.__name__ == "NavigableString" or n.__class__.__name__ == "Comment" : continue
		if n.get("class")  == "printfooter": break
		if n.name == "h2":
			if n.nextSibling.nextSibling.name == "div":
				break
			mishna += 1
			text.append("")
			continue
		if n.name == "p":
			if mishna == 0: 
				print "Parsing failed for %s (didn't see mishna header)" % (filename)
				return
			text[mishna-1] += deepText(n)

	
	parsed = {
		"language": "he",
		"versionTitle": "Wikisource Mishna",
		"versionUrl": "http://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%A0%D7%94",
	}
	
	for i in range(len(text)):
		text[i] = text[i].encode("utf-8").strip()
	
	parsed["text"] = text
	
	return parsed
	
def parseAll():
	ls = os.listdir("./pages")
	for filename in ls:
		if not "." in filename or filename == ".DS_Store": continue
		print filename
		parsed = parseChapter("pages/%s" % (filename))
		
		if parsed:
			f = open("parsed/%s" % (filename), "w")
			json.dump(parsed, f, ensure_ascii=False, indent=4)
			f.close()
			print "ok: found %d mishnas" % len(parsed["text"])
			
			
def deepText(element):

	if element.string:
		text = element.string.replace("\n", " ")
		return text
		
	text = ""
	
	for i in element:
		text += deepText(i)
	
	if "nextSibling" in element:	
		text += deepText(element.next)
		
	return text


def wikiGet(url, name):
	"""
	Takes a url and saves it to ./page/name
	"""

	ls = os.listdir("./pages")
	if name in ls:
		print "Already have %s" % (name)
		return
	print "Getting %s" % (name)
	opener = urllib2.build_opener()
	opener.addheaders = [('User-agent', 'Mozilla/5.0')]
	page = opener.open(url)

	print "Ok"
	f = open("./pages/%s" %(name), "w")
	f.write(page.read())
	f.close()



def getOrders():
	s = soup("index")
	table = s.find("table", {"align": "center"})
	trs = table.findAll("tr")
	
	seders = []
	for seder in trs[1].findAll("td"):
		seders.append(seder.find("a").string)		
	
	mishnas = {}
	
	for i in range(2, len(trs)):
		tds = trs[i].findAll("td")
		for k in range(len(tds)):
			a = tds[k].findAll("a")
			if a:
				mishnas["Mishna %s" % (a[0].string)] = {"seder": seders[k], "order": i-1}
	
	return mishnas

def sederSort(a,b):

	seders = ("Seder Zeraim", "Seder Moed", "Seder Nashim", "Seder Nezikin", "Seder Kodashim", "Seder Tahorot")

	sa = seders.index(a["categories"][1])
	sb = seders.index(b["categories"][1])

	if sa < sb: return -1
	if sb < sa: return 1
	
	if a["order"] < b["order"]: return -1
	if b["order"] < a["order"]: return 1
	
	return 0


def postText(filename):
	f = open("./parsed/%s" % (filename), "r")
	textJSON = f.read()
	f.close()
	
	url = 'http://www.sefaria.org/texts/Mishna_%s' % (filename)
	values = {'json': textJSON}
	data = urllib.urlencode(values)
	req = urllib2.Request(url, data)
	response = urllib2.urlopen(req)
	print "Posted %s" % (filename)
		

def postAll(prefix=None):
	files = os.listdir("./parsed")
	
	for f in files:
		if "." in f:
			if not prefix or f.startswith(prefix):
				parsed = postText(f)


