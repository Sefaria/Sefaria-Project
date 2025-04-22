import json
from django.views.decorators.csrf import csrf_exempt
from sefaria.client.util import jsonResponse
from .models import ShortURL
from django.shortcuts import redirect


def redirect_to_original(request, code):
    try:
    if request.method == "GET":
        if code:
            obj = ShortURL.objects.filter(code=code).first()
        else:
            return jsonResponse({"error": "Provide a short URL"})
        if not obj:
            return jsonResponse({"error": "Either url is expired or does not exist. Please ask to resend."})

        return redirect(obj.original_url)
    except Exception as e:
        return jsonResponse({"error": f"An error occurred: {str(e)}"})


@csrf_exempt
def shorturl_api(request):
    if request.method != 'POST':
        return jsonResponse({"error": "Method not allowed"}, status=405)

    try:
        # Parse JSON body
        json_data = json.loads(request.body)
        original_url = json_data.get("original_url")

        if not original_url:
            return jsonResponse({"error": "Missing 'original_url'"}, status=400)

        # Check for existing short URL
        existed_obj = ShortURL.objects.filter(original_url=original_url).first()
        if existed_obj:
            return jsonResponse({
                "original_url": existed_obj.original_url,
                "short_url": existed_obj.short_url
            })

        # Create new short URL entry
        obj = ShortURL.create_from_original(original_url)
        return jsonResponse({
            "original_url": obj.original_url,
            "short_url": obj.short_url
        })

    except json.JSONDecodeError:
        return jsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return jsonResponse({"error": f"Unexpected error: {str(e)}"}, status=500)