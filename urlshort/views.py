import json
from django.views.decorators.csrf import csrf_exempt
from sefaria.client.util import jsonResponse
from .models import ShortURL
from django.shortcuts import redirect


def redirect_to_original(request, code):
    if request.method == "GET":
        if code:
            obj = ShortURL.objects.filter(code=code).first()
        else:
            return jsonResponse({"error": "Provide a short URL"})
        if not obj:
            return jsonResponse({"error": "Either url is expired or does not exist. Please ask to resend."})

        return redirect(obj.original_url)


@csrf_exempt
def shorturl_api(request):
    # --------- POST ---------
    if request.method == 'POST':
        json_data = json.loads(request.body)
        if not json_data:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        try:
            data = json_data["json"]
            original_url = data.get("original_url")
            if not original_url:
                return jsonResponse({"error": "Missing 'original_url'"})
        except Exception as e:
            return jsonResponse({"error": f"Invalid JSON: {str(e)}"})

        # Check if already exists
        existed_obj = ShortURL.objects.filter(original_url=original_url).first()
        if existed_obj:
            return jsonResponse({
            "original_url": existed_obj.original_url,
            "short_url": existed_obj.short_url
        })

        # Create new entry
        obj = ShortURL.create_from_original(original_url)
        
        return jsonResponse({
            "original_url": obj.original_url,
            "short_url": obj.short_url
        })
