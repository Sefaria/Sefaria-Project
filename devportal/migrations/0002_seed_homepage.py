"""Seeds the homepage with live's three carousel cards and six tool tiles (PLAN.md Phase 5; brief §4.1).

Copy from docs/dev-portal/research/site/landing-custom.html, unchanged. The card screenshots are live's
images, now served from the portal bundle (devportal-ui/public/home/). Links to pages of this host are
paths, so they work on every environment. Additive: it only inserts rows, and only into empty tables,
so it never overwrites what an editor changed; reversing it deletes nothing.
"""

from django.db import migrations

IMAGES = "/static/bundles/devportal/home/"

CARDS = (
    {
        "title": "Yamim Noraim Machzor",
        "blurb": (
            "An app that utilizes a combination of text and audio to teach users how to lead prayers during "
            "Rosh Hashana and Yom Kippur."
        ),
        "link_url": "https://play.google.com/store/apps/details?id=com.machzoryamimnoraim&pli=1",
        "link_label": "Download the App Now",
        "image_url": IMAGES + "project-machzor.png",
    },
    {
        "title": "Koveah.org",
        "blurb": (
            "Koveah.org is an online tool to create personalized Torah learning schedules, with daily reminders "
            "to keep you on track. You choose what you want to learn, how quickly and how often, and we handle "
            "the rest."
        ),
        "link_url": "https://koveah.org/",
        "link_label": "Sign Up Now",
        "image_url": IMAGES + "project-koveah.png",
    },
    {
        "title": "Hadran.com",
        "blurb": (
            "Hadran aims to make Talmud study accessible to Jewish women at all levels. It does so in a unique "
            "way: by providing a wide range of resources – daily Talmud study support, shiurim and more."
        ),
        "link_url": "https://hadran.org.il/",
        "link_label": "Learn Today's Daf",
        "image_url": IMAGES + "project-hadran.png",
    },
)

TILES = (
    {
        "title": "Download Sefaria Data",
        "blurb": (
            "We want you to build the best experience possible for your users. Utilize Sefaria's free Jewish "
            "text database in your app."
        ),
        "link_url": "https://github.com/Sefaria/Sefaria-Export",
        "icon": "database",
        "color": "#802F3E",
    },
    {
        "title": "AI & ML Assets",
        "blurb": (
            "Sefaria is experimenting with machine learning and artificial intelligence in house, and we've made "
            "assets available for developers on Hugging Face."
        ),
        "link_url": "https://huggingface.co/Sefaria",
        "icon": "model",
        "color": "#00827F",
    },
    {
        "title": "Tutorial: Build a Data Visualization",
        "blurb": "Use Sefaria data to spin up a data visualization representing the Jewish canon.",
        "link_url": "/reference/data-visualization",
        "icon": "code",
        "color": "#4B71B7",
    },
    {
        "title": "API Reference",
        "blurb": (
            "Our growing collection of documentation is easy to follow and can be used to test methods and parameters."
        ),
        "link_url": "/reference/getting-started",
        "icon": "api",
        "color": "#18345D",
    },
    {
        "title": "AI at Sefaria",
        "blurb": (
            "As we experiment with AI-generated content to the Sefaria Library, we are committed to specific "
            "guardrails, making a fence around the Torah."
        ),
        "link_url": "https://www.sefaria.org.il/ai",
        "icon": "sparkle",
        "color": "#CCB479",
    },
    {
        "title": "Documentation",
        "blurb": (
            "Find essential information about the Sefaria Library and how to work with our data and services "
            "to build something amazing."
        ),
        "link_url": "/docs/welcome",
        "icon": "document",
        "color": "#CB6158",
    },
)


def seed(apps, schema_editor):
    for model_name, rows in (("HomepageCarouselCard", CARDS), ("HomepageToolTile", TILES)):
        model = apps.get_model("devportal", model_name)
        if model.objects.exists():
            continue
        model.objects.bulk_create(model(position=i, **row) for i, row in enumerate(rows, start=1))


class Migration(migrations.Migration):
    dependencies = [
        ("devportal", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
