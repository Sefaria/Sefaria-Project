/* Testing done using Jest */
import { unwrapStrapiCollection, unwrapStrapiRelation } from '../context';

describe('unwrapStrapiCollection', () => {
  it('returns a plain array for the empty collection wrapper (the reported crash case)', () => {
    // {"sidebarAds":{"data":[]}} unwrapped: a truthy {data:[]} used to make
    // Promotions.jsx's sidebarAds.forEach(...) throw and crash the app.
    const result = unwrapStrapiCollection({ data: [] });
    expect(Array.isArray(result)).toBe(true);
    expect(() => result.forEach(() => {})).not.toThrow();
  });

  it('flattens { id, attributes } entries into flat objects with id preserved', () => {
    const collection = { data: [{ id: '182', attributes: { internalModalName: 'Fundraising test' } }] };
    expect(unwrapStrapiCollection(collection)).toEqual([{ id: '182', internalModalName: 'Fundraising test' }]);
  });

  it('the entry id always wins over an attributes.id', () => {
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

describe('unwrapStrapiRelation', () => {
  it('flattens a single-relation { data: { id, attributes } } shape', () => {
    expect(unwrapStrapiRelation({ data: { id: '4', attributes: { url: '/icon.png' } } })).toEqual({
      id: '4',
      url: '/icon.png',
    });
  });

  it('represents an unset relation ({ data: null }) as null', () => {
    expect(unwrapStrapiRelation({ data: null })).toBeNull();
  });

  it('passes through null/undefined input unchanged', () => {
    expect(unwrapStrapiRelation(null)).toBeNull();
    expect(unwrapStrapiRelation(undefined)).toBeUndefined();
  });

  it('passes through an already-flat relation unchanged (defensive — no double-unwrap)', () => {
    const flat = { id: '4', url: '/icon.png' };
    expect(unwrapStrapiRelation(flat)).toBe(flat);
  });
});
