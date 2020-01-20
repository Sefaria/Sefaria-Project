# encoding=utf-8

import csv
from sefaria.model import *


def compile_refs(row):
    """
    Given a row from Mishnah Map.csv, extract the mishnah and talmud refs
    :param row: dictionary returned from class csv.DictReader
    :return: dictionary with keys m_ref and t_ref which map to mishnah and talmud refs respectively
    """

    m_ref = 'Mishnah {} {}:{}'.format(row['Book'], row['Mishnah Chapter'], row['Start Mishnah'])
    if row['Start Mishnah'] != row['End Mishnah']:
        m_ref += '-{}'.format(row['End Mishnah'])

    t_ref = '{} {}:{}'.format(row['Book'], row['Start Daf'], row['Start Line'])
    if row['End Daf'] != row['Start Daf']:
        t_ref += '-{}:{}'.format(row['End Daf'], row['End Line'])
    elif row['Start Line'] != row['End Line']:
        t_ref += '-{}'.format(row['End Line'])

    return {'m_ref': Ref(m_ref).normal(), 't_ref': Ref(t_ref).normal()}

counts = 0

# nuke this one bad link
l = LinkSet({'refs':{'$all': ['Mishnah Niddah 10:2', 'Niddah 68a:18']}})
assert l.count() <= 1
l.delete()
with open('../data/Mishnah Map.csv') as mmap:
    map_rows = csv.DictReader(mmap)
    for row_num, map_row in enumerate(map_rows):
        refs = compile_refs(next(map_rows))

        ls = LinkSet({'refs': {'$all': [refs['m_ref'], refs['t_ref']]},
                      'type': 'mishnah in talmud',
                      'auto': True,
                      'generated_by': 'mishnah_map'})

        if ls.count() == 0:
            counts += 1
            print('on line {}: '.format(row_num+2), end=' ')
            ls = LinkSet({'refs': {'$all': [refs['m_ref'], refs['t_ref']]}})
            if ls.count() == 0:
                print('{}, {} not found'.format(refs['m_ref'], refs['t_ref']))
                Link({
                    'refs': [refs['m_ref'], refs['t_ref']],
                    'type': 'mishnah in talmud',
                    'auto': True,
                    'generated_by': 'mishnah_map'
                }).save()
            else:
                print('{}, {} exists with incorrect attributes'.format(refs['m_ref'], refs['t_ref']))
                for l in ls:
                    l.type = 'mishnah in talmud'
                    l.auto = True
                    l.generated_by = 'mishnah_map'
                    l.save()
print('number of issues identified: {}'.format(counts))

