#Sefaria
#coding: utf-8
import requests 
import json
import pprint 
import re
import time


class Queue(object):
    def __init__(self, size):
        self.__maxSize = size
        self.__que = [None] * size
        self.__front = 1  # when Queue is empty, front 
        self.__rear = 0   # should be to right of rear.
        self.__nItems = 0
    
    # insert item at rear of queue   
    def insert(self, item):
        if self.isFull(): return False
        if self.__rear == self.__maxSize-1:  # deal with wraparound
            self.__rear = -1
        
        # increment rear and insert the item    
        self.__rear += 1
        self.__que[self.__rear] = item
        self.__nItems += 1
        return True
    
    # remove the front element of the queue, or None if empty
    def remove(self):
        if self.isEmpty(): return None
        temp = self.__que[self.__front]    # get the value at front

        self.__que[self.__front] = None    # keep garbage collector happy
        self.__front += 1                  # front is now one to the right
        if self.__front == self.__maxSize: # deal with wraparound
            self.__front = 0
            
        self.__nItems -= 1
        return temp
    
    # return the item at front or None if queue is empty
        
    def isEmpty(self): return self.__nItems == 0
    
    def isFull(self):  return self.__nItems == self.__maxSize 
    def size(self):    return self.__nItems
    
    def __str__(self):
        if self.__nItems <= 0:
            ans = "[]"
        else:
            ans = "[" + str(self.__que[self.__front])
            num = self.__nItems-1
            i = (self.__front + 1) % self.__maxSize
            while num > 0:
                ans += ", " + str(self.__que[i])
                i = (i + 1) % self.__maxSize
                num -= 1
            ans += "]"
            
        return ans    
    
    # Loops through the 5 books of Torah on Sefaria's text api and counts the number of pessukim in
    # each passuk. The information is stored in a queue and each value is a tuple of (passuk, # of words)
    def passuk_counter(self):
        sefarim = ["Genesis 1", "Exodus 1", "Leviticus 1", "Numbers 1", "Deuteronomy 1"]
        for book in range(len(sefarim)):
            reference = sefarim[book]
            while reference != None: 
                print(reference)
                try:
                    data = requests.get("https://www.sefaria.org/api/texts/"+reference+"?context=0")
                except:
                    continue
                resp = data.json()
                perek = resp['he']
                count = 1
                for passuk in perek:
                    key = reference+":"+str(count)
                    data = passuk.count(' ') + passuk.count(u'־') - passuk.count(u'׀') - passuk.count('(') + 1
                    self.insert((key, data))
                    count += 1
                reference = resp['next']  
        self.aliyot()
    
    # The PocketTorah audio files are stored by aliyah for each parsha. Using PT's aliyah.JSON file we loop
    # through the aliyot and process each one. 
    def aliyot(self):
        # parses the parshiyot and records number of pessukim in each aliyah
        f = open('C:/Users/Tamar Yastrab/Documents/Sefaria-Project/tamars_work/parsha_aliyot3.txt', 'rt')
        content = f.read()
        holder = content.split('\n')
        f.close()
        parshiyot = {}
        temp = []
        for key in holder:
            try:
                val = int(key)
                temp.append(key)
            except:
                parshiyot[key] = temp
                temp = [] 
        parshiyot.popitem()
        self.file_opener(parshiyot)
     
    
    def file_opener(self, parshiyot):
        for parsha in parshiyot:   #for each parsha
            aliyah = 0 
            while aliyah < 7: #look at aliyot 0-6
                num_verses = (parshiyot[parsha])[aliyah]
                parsha2 = parsha.replace('â€™', "’")
                print(parsha2, str(aliyah + 1))
                f = open('C:/Users/Tamar Yastrab/Documents/PocketTorah/data/torah/labels/'+ parsha2 + "-" + str(aliyah + 1) + '.txt', 'r')
                content = f.read()
                holder = content.split(',')
                f.close()    
                self.dictionary_maker(parsha2, holder, str(aliyah+1), num_verses)
                aliyah += 1
     
    def dictionary_maker(self, tag, holder, aliyot, num_verses):        
        time_stamps = {}
        start_time = 0
        last_passuk = len(holder)
        end_time = start_time + (self.__que[self.__front])[1] #fencepost
        cur_verse = 0
        
        while cur_verse < int(num_verses) -1:  # while we haven't found all of the pessukim in the aliyah         
            if end_time < last_passuk:
                start = holder[start_time]
                end = holder[end_time] # + cur node's value self[self.__front][1]
                time_stamps[(self.__que[self.__front])[0]] = (start, end)
                start_time = end_time
                self.remove()            
                end_time = start_time + (self.__que[self.__front])[1]
            #if  (tag == 'Pinchas') and (aliyot == 1):
                #if (self.__que[self.__front])[0] =='Numbers 26:4':
                    #cur += 1     
            else:
                if ((tag+"-" + aliyot) != 'Pinchas-1'):
                    time_stamps[(self.__que[self.__front])[0]] = ("ERROR")
                    self.remove()            
                    end_time = start_time + (self.__que[self.__front])[1]                
            cur_verse +=1
                #increment cur, remove 
        time_stamps[(self.__que[self.__front])[0]] = (holder[start_time], holder[last_passuk-1].strip())
        self.remove()    
        title = tag + "-" + aliyot
        #print(title, " = ", time_stamps)
        json_maker(title, time_stamps)
        
def json_maker(title, time_stamps):
    refs = [{}] * len(time_stamps)
    count = 0
    data = {}
    data['audio_url'] = 'https://raw.githubusercontent.com/rneiss/PocketTorah/master/data/audio/' + title + '.mp3'
    data['source'] = 'pockettorah'
    data['audio_type'] = "leyning"     
    for passuk in time_stamps:
        #refs[count]
        refs[count] = {
            'sefaria_ref' : passuk,
            'start_time': time_stamps[passuk][0],
            'end_time': time_stamps[passuk][1]
        }
        count += 1
    data['ref'] = refs
    print(data)
    json_file = json.dumps(data)
    file_name = title + ".json"
    f = open(file_name, "w")
    f.write(json_file)
    f.close()      
    
    
def __main():
    q = Queue(6000)
    q.passuk_counter()
    
if __name__ == '__main__':
    __main()
    
