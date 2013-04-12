from settings import *

def offline(request):
	return {"OFFLINE": OFFLINE}

def google_analytics(request):
	return {"GOOGLE_ANALYTICS_CODE": GOOGLE_ANALYTICS_CODE}