/* Testing done using Jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

// Misc.jsx imports CSS, which Jest has no transform for.
jest.mock('../Misc.jsx', () => ({
  InterfaceText: ({children, text}) => children || (text && text.en) || null,
  LoadingMessage: () => 'Loading...',
}));
jest.mock('../ContentText', () => ({ContentText: ({text}) => text.en}));
jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    _: key => key,
    _uid: null,
    nusach: null,
    interfaceLang: 'english',
    countryCode: 'us',
    index: () => null,
    normRef: ref => ref.replace(/ /g, '_'),
    editProfileAPI: jest.fn(),
    getIndexDetails: jest.fn(),
    util: {currentPath: () => '/Siddur_Sefard,_Weekday_Mincha,_Amidah', getUrlVersionsParams: () => ''},
  },
}));

/* eslint-disable import/first */
import Sefaria from '../sefaria/sefaria';
import { SiddurNusachPicker, adoptStoredNusach, saveNusachChoice } from '../SiddurNusachPicker';
import SiddurTocOverlay from '../SiddurTocOverlay';
/* eslint-enable import/first */

let container = null;
const mount = element => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(element, container); });
};
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  localStorage.clear();
  Sefaria._uid = null;
  Sefaria.nusach = null;
  Sefaria.editProfileAPI.mockClear();
});

describe('SiddurNusachPicker', () => {
  test('preselects the default, switches, and confirms the choice', () => {
    const onConfirm = jest.fn();
    mount(<SiddurNusachPicker initialNusach="edot" onConfirm={onConfirm} onClose={() => {}} />);
    const checked = () => container.querySelector('input[type=radio]:checked').value;
    expect(checked()).toBe('edot');
    act(() => { container.querySelector('input[value=sfard]').click(); });
    expect(checked()).toBe('sfard');
    act(() => { container.querySelector('.siddurNusachOk').click(); });
    expect(onConfirm).toHaveBeenCalledWith('sfard');
  });

  test('anonymous readers get login/register links that return to the chosen path', () => {
    mount(<SiddurNusachPicker initialNusach="ashkenaz" onConfirm={() => {}} onClose={() => {}}
                              nextPathFor={n => `/siddur-${n}`} />);
    const hrefs = [...container.querySelectorAll('.siddurNusachLogin a')].map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/login?next=%2Fsiddur-ashkenaz', '/register?next=%2Fsiddur-ashkenaz']);
    expect(container.querySelector('[data-signup-source="nusach_picker"]')).not.toBe(null);
  });

  test('logged-in readers see no login prompt', () => {
    Sefaria._uid = 7;
    mount(<SiddurNusachPicker initialNusach="ashkenaz" onConfirm={() => {}} onClose={() => {}} />);
    expect(container.querySelector('.siddurNusachLogin')).toBe(null);
  });
});

describe('saving the choice', () => {
  test('anonymous: localStorage only', () => {
    saveNusachChoice('sfard');
    expect(localStorage.getItem('siddur.nusach')).toBe('sfard');
    expect(localStorage.getItem('siddur.nusachPickerSeen')).toBe('1');
    expect(Sefaria.editProfileAPI).not.toHaveBeenCalled();
  });
  test('logged in: also the profile', () => {
    Sefaria._uid = 7;
    saveNusachChoice('edot');
    expect(Sefaria.nusach).toBe('edot');
    expect(Sefaria.editProfileAPI).toHaveBeenCalledWith({settings: {nusach: 'edot'}});
  });
  test('a pre-login choice is adopted into the profile once', () => {
    localStorage.setItem('siddur.nusach', 'sfard');
    adoptStoredNusach();
    expect(Sefaria.editProfileAPI).not.toHaveBeenCalled();
    Sefaria._uid = 7;
    adoptStoredNusach();
    adoptStoredNusach();
    expect(Sefaria.editProfileAPI).toHaveBeenCalledTimes(1);
    expect(Sefaria.nusach).toBe('sfard');
  });
});

describe('SiddurTocOverlay', () => {
  test('lists the whole TOC, filters as you type, and navigates on click', async () => {
    Sefaria.getIndexDetails.mockResolvedValue({schema: {nodes: [
      {title: "Weekday Mincha", heTitle: "מנחה", nodes: [
        {title: "Korbanot", heTitle: "קרבנות", depth: 1},
        {title: "Amidah", heTitle: "עמידה", depth: 1},
      ]},
      {title: "Bedtime Shema", heTitle: "קריאת שמע שעל המיטה", depth: 1},
    ]}});
    const onNavigate = jest.fn();
    const onSwitchNusach = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
    await act(async () => {
      mount(<SiddurTocOverlay title="Siddur Sefard" currentRef="Siddur Sefard, Weekday Mincha, Amidah 3"
                              nusach="sfard" onSwitchNusach={onSwitchNusach}
                              onNavigate={onNavigate} onClose={() => {}} />);
    });
    const titles = () => [...container.querySelectorAll('.siddurTocItem')].map(a => a.textContent);
    expect(titles()).toEqual(["Weekday Mincha", "Korbanot", "Amidah", "Bedtime Shema"]);
    expect(container.querySelector('.siddurTocItem.current').textContent).toBe("Amidah");
    // Opens at the top of the TOC rather than scrolled to the current section.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(container.querySelector('.siddurTocBody').scrollTop).toBe(0);

    // The nusach switcher sits above the search and marks the current book's nusach.
    const header = container.querySelector('.siddurTocTopRow');
    expect(header.compareDocumentPosition(container.querySelector('.siddurTocSearch')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const nusachButtons = [...container.querySelectorAll('.siddurTocNusach')];
    expect(nusachButtons.map(b => b.textContent)).toEqual(["siddur_nusach.ashkenaz", "siddur_nusach.sfard", "siddur_nusach.edot"]);
    expect(container.querySelector('.siddurTocNusach.selected').textContent).toBe("siddur_nusach.sfard");
    act(() => { nusachButtons[1].click(); });
    expect(onSwitchNusach).not.toHaveBeenCalled();
    act(() => { nusachButtons[2].click(); });
    expect(onSwitchNusach).toHaveBeenCalledWith("edot");

    const input = container.querySelector('.siddurTocSearch');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    act(() => {
      setValue.call(input, 'amid');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(titles()).toEqual(["Weekday Mincha", "Amidah"]);

    act(() => { container.querySelectorAll('.siddurTocItem')[1].click(); });
    expect(onNavigate).toHaveBeenCalledWith("Siddur Sefard, Weekday Mincha, Amidah");
  });
});

describe('siddur URLs', () => {
  test('carry the time-of-day ref, content language and pinned versions', () => {
    const {siddurUrl, timeOfDayUrl} = require('../SiddurNusachPicker');
    Sefaria.util.getUrlVersionsParams = v => v.en ? `&ven=english|${v.en.versionTitle.replace(/ /g, '_')}` : '';
    expect(siddurUrl("Siddur Sefard, Weekday Mincha, Amidah", "sfard")).toBe("/Siddur_Sefard,_Weekday_Mincha,_Amidah");
    expect(siddurUrl("Siddur Edot HaMizrach, Weekday Mincha, Amida", "edot"))
        .toBe("/Siddur_Edot_HaMizrach,_Weekday_Mincha,_Amida?ven=english|Sefaria_Community_Translation");
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(20);
    expect(timeOfDayUrl("edot")).toBe("/Siddur_Edot_HaMizrach,_Weekday_Arvit,_Barchu?lang=en&ven=english|Sefaria_Community_Translation");
    Sefaria.interfaceLang = 'hebrew';
    expect(timeOfDayUrl("ashkenaz")).toBe("/The_Koren_Shalem_Siddur;_Ashkenaz,_Weekdays,_Ma'ariv_for_Weekdays?lang=he");
    Sefaria.interfaceLang = 'english';
    Date.prototype.getHours.mockRestore();
  });
});
