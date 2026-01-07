import django
django.setup()
from tqdm import tqdm
from sefaria.helper.llm.tasks.sheet_scoring import generate_and_save_sheet_scoring
from sefaria.system.database import db


def rank_all_sheets(rerank=False):
    query = {'status': 'public'}
    if not rerank:
        query['llm_scoring'] = {'$exists': False}
    count = db.sheets.count_documents(query)
    for sheet in tqdm(db.sheets.find(query), total=count, desc="Scoring sheets"):
        generate_and_save_sheet_scoring(sheet)


if __name__ == '__main__':
    rank_all_sheets()
