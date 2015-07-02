# -*- coding: utf-8 -*-

import pdb
import urllib
import urllib2
from urllib2 import URLError, HTTPError
import json
from sefaria.model.schema import AddressTalmud	
import os

def post_text(ref, text):
    textJSON = json.dumps(text)
    ref = ref.replace(" ", "_")
    url = 'http://localhost:8000/api/texts/'+ref
    values = {'json': textJSON, 'apikey': 'YourApiKey'}
    data = urllib.urlencode(values)
    req = urllib2.Request(url, data)
    try:
        response = urllib2.urlopen(req)
        print response.read()
    except HTTPError, e:
        print 'Error code: ', e.code
        print e.read()


genesis_parshiot = ["Introduction", "Bereshit", "Noach", "Lech Lecha", "Vayera", "Chayei Sara", "Toldot", "Vayetzei", "Vayishlach", "Vayeshev", "Miketz", "Vayigash", "Vayechi"]
exodus_parshiot = ["Shemot", "Vaera", "Bo", "Beshalach", "Haman", "Yitro", "Mishpatim", "Terumah", "Tetzaveh", "Ki Tisa", "Vayakhel", "Pekudei"]
leviticus_parshiot = ["Vayikra", "Tzav", "Shmini", "Tazria", "Metzora", "Achrei Mot", "Kedoshim", "Emor", "Behar", "Bechukotai"]
numbers_parshiot = ["Bamidbar", "Nasso", "Beha'alotcha", "Sh'lach", "Korach", "Chukat", "Balak", "Pinchas", "Matot"]
deut_parshiot = ["Devarim", "Vaetchanan", "Eikev", "Shoftim", "Ki Teitzei", "Vayeilech", "Ha'Azinu", "Ha_Idra"]
english_parshiot = genesis_parshiot+exodus_parshiot+leviticus_parshiot+numbers_parshiot+deut_parshiot

curr_parsha = 0
curr_parsha_file = ""
prev_vol = 0
prev_daf = -1
prev_para = 0
current_line = "not header"
prev_line = "not header"
prev_prev_line = "not header"
zohar_struct = range(3)
for vol_num in range(3):
	para_count = 1	
	if vol_num == 0:
		daf_count = -1
		vol_file = 'intro'
		zohar_struct[vol_num] = []
	elif vol_num == 1:
		daf_count = 1
		vol_file = 'shemot_parsed'
		zohar_struct[vol_num] = []
		zohar_struct[vol_num].append([])
		zohar_struct[vol_num].append([])
	elif vol_num == 2:
		daf_count = 1
		vol_file = 'lnd'
		zohar_struct[vol_num] = []
		zohar_struct[vol_num].append([])
		zohar_struct[vol_num].append([])
	first_line = True
	vol = open(vol_file, 'r')
	for line in vol:
		stray_tag = False
		blank_line = False
		no_spaces = line.replace(" ", "")
		no_return = no_spaces.replace("\n", "")
		if len(no_return)==0:
			blank_line = True
		if len(line.split(' '))==1 and (line.find('<b>')>=0 or line.find('</b>')>=0):
			stray_tag = True			
		if first_line == True:
			first_line = False
			if curr_parsha_file != "":
				curr_parsha_file.write('\n'+str(prev_vol+1)+":"+AddressTalmud.toStr("en", prev_daf+1)+":"+str(prev_para))
				curr_parsha_file.close()	
			if os.path.exists(english_parshiot[curr_parsha]) == True:
				os.remove(english_parshiot[curr_parsha])		
			curr_parsha_file = open(english_parshiot[curr_parsha], 'a')
			curr_parsha_file.write(str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count+2)+":1")  
			curr_parsha += 1
		elif blank_line==False and stray_tag==False:
			prev_prev_line = prev_line
			prev_line = current_line
			new_daf = line.find('דף')
			new_parsha = line.find('h1') #all parsha titles are surrounded by <h1> tags
			if new_daf >= 0 and len(line.split(' ')) < 6:  
				current_line = "daf"
				daf_count += 1
				zohar_struct[vol_num].append([])
				prev_para = para_count
				para_count = 1
			elif new_parsha >= 0 and len(line.split(' ')) < 6:
				current_line = "parsha"
				if para_count==1:
					curr_parsha_file.write('\n'+str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count)+":"+str(prev_para-1))
				else:
					curr_parsha_file.write('\n'+str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count+1)+":"+str(para_count-1))
				curr_parsha_file.close()
				if os.path.exists(english_parshiot[curr_parsha]) == True:
					os.remove(english_parshiot[curr_parsha])		
				curr_parsha_file = open(english_parshiot[curr_parsha], 'a')
				curr_parsha += 1					
			else:
				current_line = "neither"
				zohar_struct[vol_num][daf_count].append(line)
				para_count += 1
			if current_line == "daf" and prev_line == "parsha": #typical case: parsha, daf
				curr_parsha_file.write(str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count+1)+":1")
			elif current_line=="parsha" and prev_line == "daf": #Chayei Sara case: daf, parsha
				curr_parsha_file.write(str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count+1)+":1")
			elif current_line == "neither" and prev_line == "parsha" and prev_prev_line == "neither": #Lech Lecha case: new parsha in middle of page
				curr_parsha_file.write(str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count+1)+":"+str(para_count-1))
	
				
	prev_para = para_count-1
	prev_vol = vol_num
	prev_daf = daf_count
	if vol_file=='lnd':
		curr_parsha_file.write('\n'+str(vol_num+1)+":"+AddressTalmud.toStr("en", daf_count+1)+":"+str(para_count-1))
		curr_parsha_file.close()



text = {
"versionTitle": "Zohar",
"versionSource": "http://www.toratemetfreeware.com/online/d_root__106_kblh.html",
"language": "he",
"text": zohar_struct,
}
post_text("Zohar", text)
