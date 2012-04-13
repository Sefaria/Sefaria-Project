import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from config import *
import simplejson as json
from bottlez import *
from sefaria import *
import sheets

if __name__ == '__main__':
  home_path = ''
else:
  home_path = SEFARIA_PATH

# --------------- APP ---------------

@route("/")
def home():

	f = open(os.path.join(home_path, 'reader.html'), 'r')
	response_body = f.read()
	f.close()
	
	response_body = response_body.replace('initJSON: "initJSON"', "%s: %s" % ("'Genesis.1'", json.dumps(getText("Genesis"))))
	response_body = response_body.replace('books = [];', 'books = %s;' % json.dumps(getIndex()))


	return response_body

@get("/search")
@get("/search/")
def searchPage():

	f = open(os.path.join(home_path, 'search.html'), 'r')
	response_body = f.read()
	f.close()
	return response_body

@get("/search/:query")
def searchPage(query):
	query = query.replace("+", " ")

	f = open(os.path.join(home_path, 'search.html'), 'r')
	response_body = f.read()
	response_body = response_body.replace('<input id="search" />', '<input id="search" value="%s"/>' % query)
	f.close()
	return response_body


@get("/sheets")
@get("/sheets/")
def sheetsApp():

	f = open(os.path.join(home_path, 'sheets.html'), 'r')
	response_body = f.read()
	f.close()

	return response_body

@get("/sheets/:sheetId")
def viewSheet(sheetId):

	f = open(os.path.join(home_path, 'sheets.html'), 'r')
	response_body = f.read()
	f.close()
	response_body = response_body.replace('current: null,', 'current: %s,' % json.dumps(sheets.sheetJSON(sheetId)))
	return response_body


# -------------- CSS -----------------

@route("/css/:filename")	
def serveCss(filename):
	return static_file(filename, root=os.path.join(home_path, "webroot/css"), mimetype='text/css')


# -------------- API -----------------

@get("/texts/:ref")
def getTextJSON(ref):
	j = getText(ref)
	if "_id" in j: 
		del j["_id"]
	cb = request.GET.get("callback", "")
	if cb:
		j = "%s(%s)" % (cb, json.dumps(j))
		response.content_type = "application/javascript"
	return j

@post("/texts/:ref")
def postText(ref):
	j = request.POST.get("json")
	if not j:
		return {"error": "No postdata."}
	response = saveText(ref, json.loads(j))
	if 'revisionDate' in response:
		del response['revisionDate']
	return response

@get("/index/:book")
def getIndexAPI(book):
	return getIndex(book)

@post("/index/:book")
def saveIndexAPI(book):
	j = json.loads(request.POST.get("json"))
	j["title"] = book.replace("_", " ")
	return saveIndex(j)	
		
@post("/links")
def postLink():
	j = request.POST.get("json")
	j = json.loads(j)
	if j["type"] == "note":
		return saveNote(j)
	else:
		return saveLink(j)

@delete("/links/:id")
def delLink(id):
	return deleteLink(id)

@delete("/notes/:id")
def delNote(id):
	return deleteNote(id)

@get("/api/sheets")
@get("/api/sheets/")
def getSheetsList():
	return sheets.sheetsList()

@get("/api/sheets/:sheetId")
def getSheet(sheetId):
	return sheets.sheetJSON(int(sheetId))
	
@post("/api/sheets/")	
def saveNewSheet():
	j = request.POST.get("json")
	return sheets.saveSheet(json.loads(j))
	
@post("/api/sheets/:sheetId")
def updateSheet(sheetId):
	return "TODO"
	
@post("/api/sheets/:sheetId/add")
def addSheet(sheetId):
	ref = request.POST.get("ref")
	return sheets.addToSheet(int(sheetId), ref)

@error(404)
def error404(error):
    return 'Nothing here, sorry'

if __name__ == "__main__":
	@route('/:path#.+#')
	def server_static(path):
		return static_file(path, root='./webroot')
	run(host='localhost', port=8080, reloader=True)
else:
	application = default_app()
