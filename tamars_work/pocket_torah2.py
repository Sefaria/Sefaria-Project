#Sefaria
# -*- coding: utf-8 -*-
import requests 
import json
import pprint 
import re

#what are we looking at?

##open txt file of labels from Pocket Torah
def file_opener(tag):
    f = open('C:/Users/Tamar Yastrab/Documents/PocketTorah/data/torah/labels/'+ tag + '.txt', 'r')
    content = f.read()
    holder = content.split(',')
    f.close()    
    word_counter(holder, tag)

# count the words of pessukum in the tag
def word_counter(holder, tag):
    reference = "Genesis 1"
    parsed_perek = dict() 
    while reference != "Genesis 6": #None: 
        data = requests.get("https://www.sefaria.org/api/texts/"+reference+"?context=0")
        resp = data.json()
        perek = resp['he']
        count = 1
        for passuk in perek:
            parsed_perek[reference+":"+str(count)] = passuk.count(' ') + passuk.count(u'־') - passuk.count(u'׀') - passuk.count('(') + 1
            count += 1
        reference = resp['next']
    #print(holder, end ="\n")
    print(parsed_perek)
    dictionary_maker(holder, parsed_perek)  


# create dictionary of pessukim and tuple(start, end time)
def dictionary_maker(holder, parsed_perek):
    time_stamps = dict()
    index = 0
    total_num_pessukim = 34
    num_pessukim = 0 
    last_passuk = len(holder)
    for passuk in parsed_perek:
        end_time = index+parsed_perek[passuk]
        if num_pessukim < total_num_pessukim-1:
            start = holder[index]
            end = holder[end_time]
            time_stamps[passuk] = (start, end)
            #print(passuk + "=" + start +","+ end)
            index = index+parsed_perek[passuk]
            num_pessukim +=1
        else: 
            time_stamps[passuk] = (holder[index], holder[last_passuk-1].strip()) 
            break
        
    # remove used pesukim so next loop starts from the right place
    print(time_stamps)
    #json_file = json.dumps(time_stamps)
    #f = open("Genesis-1.json","w")
    #f.write(json_file)
    #f.close()      
     
        
    
    
def main():
    tag = "Bereshit-1"
    file_opener(tag)
    
    
main()

