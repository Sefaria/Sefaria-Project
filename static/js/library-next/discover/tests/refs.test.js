import Sefaria from '../../../sefaria/sefaria';
import { refToUrl } from '../refs';

test('heuristic ref urls before setup', () => {
  Sefaria.virtualBooks = undefined;
  expect(refToUrl('Genesis 1:3')).toBe('/Genesis.1.3');
  expect(refToUrl('Rashi on Genesis 1:4:1')).toBe('/Rashi_on_Genesis.1.4.1');
  expect(refToUrl('Berakhot 11b:4')).toBe('/Berakhot.11b.4');
  expect(refToUrl('I Kings 8:54-66')).toBe('/I_Kings.8.54-66');
  expect(refToUrl('Genesis 1:1-6:8')).toBe('/Genesis.1.1-6.8');
  expect(refToUrl('Mishneh Torah, Foundations of the Torah 2:1')).toBe('/Mishneh_Torah,_Foundations_of_the_Torah.2.1');
  expect(refToUrl('Genesis')).toBe('/Genesis');
  expect(refToUrl('')).toBe('/');
});

test('uses normRef when the data layer is set up', () => {
  Sefaria.virtualBooks = [];
  const spy = jest.spyOn(Sefaria, 'normRef').mockReturnValue('Job.1.1');
  expect(refToUrl('Job 1:1')).toBe('/Job.1.1');
  spy.mockRestore();
  Sefaria.virtualBooks = undefined;
});
