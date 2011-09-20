
import sys
sys.path.insert(0, "/var/www/sefaria/")
import simplejson as json
from bottlez import *
from sefaria import *
import sheets

# --------------- APP ---------------

@route("/")
def home():
	f = open('/var/www/sefaria/reader.html', 'r')
	response_body = f.read()
	f.close()
	
	response_body = response_body.replace('initJSON: "initJSON"', "%s: %s" % ("'Genesis.1'", json.dumps(getText("Genesis"))))
	
	response_body = response_body.replace('books: [],', 'books: %s,' % json.dumps(getIndex()))


	return response_body

@get("/search")
@get("/search/")
def searchPage():
	f = open('/var/www/sefaria/search.html', 'r')
	response_body = f.read()
	f.close()
	return response_body

@get("/search/:query")
def searchPage(query):
	query = query.replace("+", " ")
	f = open('/var/www/sefaria/search.html', 'r')
	response_body = f.read()
	response_body = response_body.replace('<input id="search" />', '<input id="search" value="%s"/>' % query)
	f.close()
	return response_body


@get("/sheets")
@get("/sheets/")
def sheetsApp():
	f = open('/var/www/sefaria/sheets.html', 'r')
	response_body = f.read()
	f.close()

	return response_body

@get("/sheets/:sheetId")
def viewSheet(sheetId):
	f = open('/var/www/sefaria/sheets.html', 'r')
	response_body = f.read()
	f.close()
	response_body = response_body.replace('current: null,', 'current: %s,' % json.dumps(sheets.sheetJSON(sheetId)))
	return response_body


# -------------- API -----------------


@get("/texts/:ref")
def getTextJSON(ref):
	j = getText(ref)
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
	return saveText(ref, json.loads(j))

@get("/index/:book")
def getIndexAPI(book):
	return getIndex(book)
		
@post("/links")
def postLink():
	j = request.POST.get("json")
	link = saveLink(json.loads(j))
	return link # TODO: covert to commentary format

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
	
@error(404)
def error404(error):
    return 'Nothing here, sorry'


application = default_app()
