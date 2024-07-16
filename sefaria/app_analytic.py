import os.path

from mixpanel import Mixpanel

MATRIX_TOKEN = os.getenv("MATRIX_PROJECT_TOKEN")
mp = Mixpanel(MATRIX_TOKEN)


def add_signup_info(email, first_name, last_name):
    mp.people_set(email, {
        '$firstName': first_name,
        '$lastName': last_name
    })
    mp.track(email, 'Sign Up', {
        'Signup Type': 'Normal'
    })


def track_page_to_mp(request, page_title, text_ref):
    device_id = request.user.id
    email = ''
    if request.user.is_authenticated:
        email = request.user.email
    mp.track(email, 'Page View', {
        "$title": page_title,
        "$path": text_ref,
        "$device_id": device_id
    })


def add_topic_data(email, topic_name, language):
    mp.track(email, 'Topic', {
        "name": topic_name,
        "language": language
    })


def add_sheet_data(request, title, action_type, owner):
    language = request.GET.get("lang")
    device_id = request.user.id
    email = ''
    if request.user.is_authenticated:
        email = request.user.email
    mp.track(email, 'Sheets', {
        "$title": title,
        "$owner": owner,
        "$action type": action_type,
        "$language": language,
        "$device_id": device_id
    })
