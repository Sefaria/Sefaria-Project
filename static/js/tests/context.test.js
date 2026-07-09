/* Testing done using Jest */
import { unwrapStrapiCollection } from '../context';

describe('unwrapStrapiCollection', () => {
  it('returns a plain array for the empty Strapi collection wrapper (the reported crash case)', () => {
    // {"sidebarAds":{"data":[]}} unwrapped: a truthy {data:[]} used to make
    // Promotions.jsx's sidebarAds.forEach(...) throw and crash the app.
    const result = unwrapStrapiCollection({ data: [] });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    expect(() => result.forEach(() => {})).not.toThrow();
  });

  it('flattens { id, attributes } entries into flat objects with id preserved', () => {
    const collection = {
      data: [
        {
          id: '182',
          attributes: {
            internalModalName: '2026 General Fundraising - Test 2 afternoon',
            modalStartDate: '2026-07-08T12:00:00.000Z',
            modalEndDate: '2026-07-08T19:45:00.000Z',
          },
        },
      ],
    };
    expect(unwrapStrapiCollection(collection)).toEqual([
      {
        id: '182',
        internalModalName: '2026 General Fundraising - Test 2 afternoon',
        modalStartDate: '2026-07-08T12:00:00.000Z',
        modalEndDate: '2026-07-08T19:45:00.000Z',
      },
    ]);
  });

  it('the entry id always wins over an attributes.id, regardless of spread order', () => {
    const collection = { data: [{ id: '182', attributes: { id: 'should-not-win', title: 't' } }] };
    expect(unwrapStrapiCollection(collection)[0].id).toBe('182');
  });

  it('passes through already-flat entries unchanged (defensive — no double-unwrap)', () => {
    const entry = { id: '1', title: 'already flat' };
    expect(unwrapStrapiCollection({ data: [entry] })).toEqual([entry]);
  });

  it('returns an empty array for null/undefined input', () => {
    expect(unwrapStrapiCollection(null)).toEqual([]);
    expect(unwrapStrapiCollection(undefined)).toEqual([]);
  });

  it('passes through an entry with attributes: null unchanged (Strapi soft-delete shape)', () => {
    const entry = { id: '3', attributes: null };
    expect(unwrapStrapiCollection({ data: [entry] })).toEqual([entry]);
  });

  it('passes through a null entry in the array unchanged', () => {
    expect(unwrapStrapiCollection({ data: [null] })).toEqual([null]);
  });
});
