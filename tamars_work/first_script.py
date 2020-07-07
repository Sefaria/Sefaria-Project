#Sefaria
# -*- coding: utf-8 -*-
import requests 
import json
import pprint 
import re

#data = requests.get("https://sefaria.org/api/texts/Genesis 1:1?context=0") # returns request object which contains JSON
#inp = input("Please enter your sefer:")
#data = requests.get("https://sefaria.org/api/texts/"+ inp + "?context=0")
#if "error" in resp:
    #print(resp["error"])
#else: print(resp['ref'], resp['text'])


def nameFinder(holder, names):
    symbol_pat = re.compile(r'[^.“] ([A-Z][a-z]+)') 
    for data in holder:
        found = re.findall(symbol_pat, data) # if you find something that is probably a name
        if found: 
            for elem in found:
                if elem not in names.keys(): names[elem] = 0
                names[elem] += 1
                
def perekCount(holder, ref, names):
    symbol_pat = re.compile(r'[^.“] ([A-Z][a-z]+)') 
    cur = [] #list pf names in this perek
    for data in holder:
        found = re.findall(symbol_pat, data) # if you find something that is probably a name
        if found: 
            for elem in found:
                if elem not in cur: cur.append(elem) 
    for elem in cur:
        if elem not in names.keys(): names[elem] = [ref]
        else: names[elem].append(ref)
             

def torahScan(start, function):
    names = dict()
    inp = start
    while inp:
        data = requests.get("https://sefaria.org/api/texts/"+ inp+ "?context=1")
        resp = data.json()
        print(resp['ref'])
        if function == "nameFinder": nameFinder(resp['text'], names)
        elif function == "perekCount": perekCount(resp['text'], resp['sectionRef'], names)
        inp = resp['next']
    return names

def main():
    #How mnay times does this name appear?
    #names = torahScan("Genesis 1", "nameFinder")
    #name = (sorted(names.items(), key=lambda x:x[1],reverse=True))
    #print(name)
    
    #Which names appear in the most perakim?
    #names = torahScan("Genesis 48", "perekCount")
    #for elem in names.keys():
        #names[elem] = len(names[elem])
    #name = (sorted(names.items(), key=lambda x:x[1],reverse=True))
    #print(name)    
    
    data = requests.get("https://www.sefaria.org/api/texts/Genesis 48:1?context=0")
    resp = data.json()
    #pprint.pprint(resp['text'].encode('UTF-8'))  
    #print(resp['text'])
    #resp.replace('\u0591'-'u05C7',"")
    
    with open('data.txt') as json_file:
        data = json.load(json_file)    
   

main()

#Bereshit 1:1- http://www.bible.ort.org/webmedia/t1/0101.mp3
#Bereshit 1:2- http://www.bible.ort.org/webmedia/t1/0102.mp3
#Bereshit 2:20-http://www.bible.ort.org/webmedia/t1/0220.mp3
#Shemot 1:1- http://www.bible.ort.org/webmedia/t2/0101.mp3