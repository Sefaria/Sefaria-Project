from sefaria.system.decorators import catch_error_as_json
from sefaria.client.util import jsonResponse
from guides.models import Guide


@catch_error_as_json
def guides_api(request, guide_key=None):
    """
    API endpoint that returns guide data for a specific guide.
    
    Args:
        guide_key (str): The guide key to fetch guide for (e.g., 'editor')
    
    Returns:
        JSON response with the following structure:
        {
            "titlePrefix": {"en": str, "he": str},
            "footerLinks": [{"text": {"en": str, "he": str}, "url": str}, ...],
            "cards": [
                {
                    "id": str,
                    "title": {"en": str, "he": str},
                    "text": {"en": str, "he": str},
                    "videoUrl": {"en": str, "he": str},

                },
                ...
            ]
        }
    """
    if not guide_key:
        return jsonResponse({"error": "Guide key is required"}, status=400)
    
    try:
        guide = Guide.objects.get(key=guide_key)
    except Guide.DoesNotExist:
        return jsonResponse({"error": f"Guide '{guide_key}' not found"}, status=404)
    
    response_data = guide.contents()
    
    return jsonResponse(response_data) 