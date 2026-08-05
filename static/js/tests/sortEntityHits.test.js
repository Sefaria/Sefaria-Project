import { sortEntityHits } from '../sefaria/entitySort';

// A category row from the `category` index: stands in for a whole category's books, and
// carries no compDate because a category spans too many works to have one date.
const categoryRow = (title) => ({ title_en: title, isCategory: true, compDate: null });
// An author-works aggregation row: also isCategory, but it *does* carry a representative
// date (the average year of the works it collapses) so that it can be sorted.
const authorCategoryRow = (title, compDate) => ({ title_en: title, isCategory: true, compDate });
const book = (title, compDate) => ({ title_en: title, compDate });

describe('sortEntityHits', () => {
  test('relevance leaves the server order untouched', () => {
    const hits = [book('B', 1200), categoryRow('A')];
    expect(sortEntityHits(hits, 'book', 'relevance')).toBe(hits);
  });

  test('pins category rows above books under a year sort', () => {
    // Without pinning, the dateless category row falls to the bottom with the undated tail,
    // burying the very thing the query asked for.
    const hits = [categoryRow('Mishneh Torah'), book('Old', 900), book('New', 1800)];
    const sorted = sortEntityHits(hits, 'book', 'year_asc');
    expect(sorted.map(h => h.title_en)).toEqual(['Mishneh Torah', 'Old', 'New']);

    const desc = sortEntityHits(hits, 'book', 'year_desc');
    expect(desc.map(h => h.title_en)).toEqual(['Mishneh Torah', 'New', 'Old']);
  });

  test('pins category rows above books under A-Z, sorting the pinned block itself', () => {
    const hits = [categoryRow('Zohar'), categoryRow('Aggadah'), book('Aleph', 900)];
    const sorted = sortEntityHits(hits, 'book', 'alpha');
    expect(sorted.map(h => h.title_en)).toEqual(['Aggadah', 'Zohar', 'Aleph']);
  });

  test('author-works category rows keep sorting by their own date', () => {
    // These are isCategory too, but product chose to give them a representative date
    // precisely so they order chronologically. Pinning must not swallow them.
    const hits = [authorCategoryRow('Later Works', 1500), book('Early Book', 1100)];
    const sorted = sortEntityHits(hits, 'book', 'year_asc');
    expect(sorted.map(h => h.title_en)).toEqual(['Early Book', 'Later Works']);
  });

  test('authors sort on sortYear, undated last', () => {
    const hits = [
      { title_en: 'Undated' },
      { title_en: 'Later', sortYear: 1204 },
      { title_en: 'Earlier', sortYear: 1105 },
    ];
    expect(sortEntityHits(hits, 'author', 'year_asc').map(h => h.title_en))
      .toEqual(['Earlier', 'Later', 'Undated']);
  });
});
