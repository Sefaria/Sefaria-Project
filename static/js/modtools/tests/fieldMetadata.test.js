/**
 * Tests for fieldMetadata constants
 *
 * These constants define the schema for bulk editing operations.
 * Tests ensure the structure is correct and validation functions work.
 */
import {
  INDEX_FIELD_METADATA,
  VERSION_FIELD_METADATA,
  BASE_TEXT_MAPPING_OPTIONS
} from '../constants/fieldMetadata';

describe('INDEX_FIELD_METADATA', () => {
  describe('structure validation', () => {
    it('has all expected fields', () => {
      const expectedFields = [
        'enDesc', 'enShortDesc', 'heDesc', 'heShortDesc',
        'categories', 'authors', 'compDate', 'compPlace', 'heCompPlace',
        'pubDate', 'pubPlace', 'hePubPlace', 'toc_zoom',
        'dependence', 'base_text_titles', 'collective_title', 'he_collective_title'
      ];
      expectedFields.forEach(field => {
        expect(INDEX_FIELD_METADATA).toHaveProperty(field);
      });
    });

    it('each field has required properties', () => {
      Object.entries(INDEX_FIELD_METADATA).forEach(([fieldName, meta]) => {
        expect(meta).toHaveProperty('label');
        expect(meta).toHaveProperty('type');
        expect(typeof meta.label).toBe('string');
        expect(['text', 'textarea', 'select', 'array', 'number', 'daterange']).toContain(meta.type);
      });
    });

    it('select fields have options array', () => {
      Object.entries(INDEX_FIELD_METADATA).forEach(([fieldName, meta]) => {
        if (meta.type === 'select') {
          expect(meta.options).toBeDefined();
          expect(Array.isArray(meta.options)).toBe(true);
          expect(meta.options.length).toBeGreaterThan(0);
        }
      });
    });

    it('Hebrew fields have rtl direction', () => {
      const hebrewFields = ['heDesc', 'heShortDesc', 'heCompPlace', 'hePubPlace', 'he_collective_title'];
      hebrewFields.forEach(field => {
        expect(INDEX_FIELD_METADATA[field].dir).toBe('rtl');
      });
    });
  });

  describe('toc_zoom validation', () => {
    const validate = INDEX_FIELD_METADATA.toc_zoom.validate;

    it('accepts empty values', () => {
      expect(validate('')).toBe(true);
      expect(validate(null)).toBe(true);
      expect(validate(undefined)).toBe(true);
    });

    it('accepts valid integers 0-10', () => {
      for (let i = 0; i <= 10; i++) {
        expect(validate(String(i))).toBe(true);
      }
    });

    it('rejects integers outside 0-10 range', () => {
      expect(validate('-1')).toBe(false);
      expect(validate('11')).toBe(false);
      expect(validate('100')).toBe(false);
    });

    it('rejects non-numeric values', () => {
      expect(validate('abc')).toBe(false);
      expect(validate('one')).toBe(false);
    });

    it('accepts decimals (parseInt truncates to integer)', () => {
      // Note: parseInt('1.5') = 1, which is valid
      expect(validate('1.5')).toBe(true);
      expect(validate('5.9')).toBe(true);
    });
  });

  describe('auto-detect fields', () => {
    it('authors field supports auto-detect', () => {
      expect(INDEX_FIELD_METADATA.authors.auto).toBe(true);
    });

    it('dependence field supports auto-detect', () => {
      expect(INDEX_FIELD_METADATA.dependence.auto).toBe(true);
    });

    it('base_text_titles field supports auto-detect', () => {
      expect(INDEX_FIELD_METADATA.base_text_titles.auto).toBe(true);
    });

    it('collective_title field supports auto-detect', () => {
      expect(INDEX_FIELD_METADATA.collective_title.auto).toBe(true);
    });
  });
});

describe('VERSION_FIELD_METADATA', () => {
  describe('structure validation', () => {
    it('has all expected fields', () => {
      const expectedFields = [
        'versionTitle', 'versionTitleInHebrew', 'versionSource',
        'license', 'status', 'priority',
        'digitizedBySefaria', 'isPrimary', 'isSource',
        'versionNotes', 'versionNotesInHebrew',
        'purchaseInformationURL', 'purchaseInformationImage', 'direction'
      ];
      expectedFields.forEach(field => {
        expect(VERSION_FIELD_METADATA).toHaveProperty(field);
      });
    });

    it('each field has required properties', () => {
      Object.entries(VERSION_FIELD_METADATA).forEach(([fieldName, meta]) => {
        expect(meta).toHaveProperty('label');
        expect(meta).toHaveProperty('type');
        expect(typeof meta.label).toBe('string');
        expect(['text', 'textarea', 'select', 'number']).toContain(meta.type);
      });
    });

    it('versionTitle is marked as required', () => {
      expect(VERSION_FIELD_METADATA.versionTitle.required).toBe(true);
    });

    it('Hebrew fields have rtl direction', () => {
      expect(VERSION_FIELD_METADATA.versionTitleInHebrew.dir).toBe('rtl');
      expect(VERSION_FIELD_METADATA.versionNotesInHebrew.dir).toBe('rtl');
    });
  });

  describe('license options', () => {
    const licenseOptions = VERSION_FIELD_METADATA.license.options;

    it('includes common Creative Commons licenses', () => {
      const values = licenseOptions.map(o => o.value);
      expect(values).toContain('CC-BY');
      expect(values).toContain('CC-BY-SA');
      expect(values).toContain('CC-BY-NC');
      expect(values).toContain('CC0');
    });

    it('includes Public Domain option', () => {
      const values = licenseOptions.map(o => o.value);
      expect(values).toContain('Public Domain');
    });
  });

  describe('status options', () => {
    const statusOptions = VERSION_FIELD_METADATA.status.options;

    it('has empty value for editable', () => {
      expect(statusOptions.find(o => o.value === '')).toBeDefined();
    });

    it('has locked value for staff-only', () => {
      expect(statusOptions.find(o => o.value === 'locked')).toBeDefined();
    });
  });

  describe('boolean-like select fields', () => {
    const booleanFields = ['digitizedBySefaria', 'isPrimary', 'isSource'];

    booleanFields.forEach(fieldName => {
      it(`${fieldName} has true/false string options`, () => {
        const options = VERSION_FIELD_METADATA[fieldName].options;
        const values = options.map(o => o.value);
        expect(values).toContain('true');
        expect(values).toContain('false');
      });
    });
  });
});

describe('BASE_TEXT_MAPPING_OPTIONS', () => {
  it('is an array with expected options', () => {
    expect(Array.isArray(BASE_TEXT_MAPPING_OPTIONS)).toBe(true);
    expect(BASE_TEXT_MAPPING_OPTIONS.length).toBe(4);
  });

  it('each option has value and label', () => {
    BASE_TEXT_MAPPING_OPTIONS.forEach(option => {
      expect(option).toHaveProperty('value');
      expect(option).toHaveProperty('label');
    });
  });

  it('includes many_to_one_default_only for Mishnah/Tanakh', () => {
    const option = BASE_TEXT_MAPPING_OPTIONS.find(o => o.value === 'many_to_one_default_only');
    expect(option).toBeDefined();
    expect(option.label).toContain('Mishnah');
  });
});
