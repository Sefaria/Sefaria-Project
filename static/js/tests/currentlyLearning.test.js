/**
 * The history page's Books view groups the reader's places (newest first) by book.
 */
jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {} }));
jest.mock('../Misc', () => ({ InterfaceText: () => null }));
jest.mock('../common/DropdownMenu', () => ({ DropdownMenu: () => null }));
jest.mock('../common/Button', () => ({ __esModule: true, default: () => null }));

import { groupPlacesByBook } from '../CurrentlyLearning';

const place = (ref, time_stamp) => ({ ref, book: ref.split(' ')[0], time_stamp });

describe('groupPlacesByBook', () => {
  test('orders books by their latest place, and each book by its places, newest first', () => {
    const places = [place('Exodus 2:1', 4), place('Genesis 3:1', 3), place('Exodus 1:1', 2), place('Genesis 1:1', 1)];
    expect(groupPlacesByBook(places).map((days) => days.map((p) => p.ref))).toEqual([
      ['Exodus 2:1', 'Exodus 1:1'],
      ['Genesis 3:1', 'Genesis 1:1'],
    ]);
  });
});
