import django
django.setup()
import argparse
from sefaria.settings import STATICFILES_DIRS
from sefaria.sitemap import SefariaSiteMapGenerator

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-o", "--output_directory", help="directory to write output", default=STATICFILES_DIRS[0])
    args = parser.parse_args()

    SefariaSiteMapGenerator('org', args.output_directory).generate_sitemaps()
    SefariaSiteMapGenerator('org.il', args.output_directory).generate_sitemaps()

