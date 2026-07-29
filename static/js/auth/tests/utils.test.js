/* Testing done using Jest */
import {
  safeNext, pathToFlow, flowToPath, withNext, nextFromPath,
  checkPasswordsMatch, requiredFieldValidate, onBlurValidate, onChangeClear,
  pickFirstError, authError, postJson, postForm,
} from '../utils.js';

describe('safeNext', () => {
  it('allows a plain relative path', () => {
    expect(safeNext('/sheets/123')).toBe('/sheets/123');
  });

  it('rejects a protocol-relative path (open redirect via //)', () => {
    expect(safeNext('//evil.example.com')).toBe('/');
  });

  it('rejects an absolute URL', () => {
    expect(safeNext('https://evil.example.com')).toBe('/');
  });

  it('rejects a bare path with no leading slash', () => {
    expect(safeNext('sheets/123')).toBe('/');
  });

  it('defaults to / for empty/undefined input', () => {
    expect(safeNext('')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});

describe('pathToFlow', () => {
  it('reads reset for the reset-confirm path', () => {
    expect(pathToFlow('/password/reset/confirm/abc123/token/')).toBe('reset');
  });

  it('reads register for /register and its variants', () => {
    expect(pathToFlow('/register')).toBe('register');
    expect(pathToFlow('/register/')).toBe('register');
    expect(pathToFlow('/register?next=/sheets/1')).toBe('register');
  });

  it('defaults to login for everything else, including /login itself', () => {
    expect(pathToFlow('/login')).toBe('login');
    expect(pathToFlow('/texts/Genesis')).toBe('login');
  });
});

describe('withNext / flowToPath', () => {
  it('appends an encoded next param when next is not the default', () => {
    expect(withNext('/login', '/sheets/1?x=y')).toBe('/login?next=%2Fsheets%2F1%3Fx%3Dy');
  });

  it('omits the next param when next is "/" or absent', () => {
    expect(withNext('/login', '/')).toBe('/login');
    expect(withNext('/login')).toBe('/login');
  });

  it('flowToPath maps register/login to their base paths', () => {
    expect(flowToPath('register', '/sheets/1')).toBe('/register?next=%2Fsheets%2F1');
    expect(flowToPath('login')).toBe('/login');
  });
});

describe('nextFromPath', () => {
  it('extracts and safety-checks the next query param', () => {
    expect(nextFromPath('/login?next=%2Fsheets%2F1')).toBe('/sheets/1');
  });

  it('falls back to / when next is missing or unsafe', () => {
    expect(nextFromPath('/login')).toBe('/');
    expect(nextFromPath('/login?next=https%3A%2F%2Fevil.example.com')).toBe('/');
  });
});

describe('checkPasswordsMatch', () => {
  it('returns null while the confirmation field is still empty', () => {
    expect(checkPasswordsMatch('abc', '')).toBeNull();
  });

  it('returns null once both fields match', () => {
    expect(checkPasswordsMatch('abc', 'abc')).toBeNull();
  });

  it('returns the mismatch key once a non-empty confirmation differs', () => {
    expect(checkPasswordsMatch('abc', 'abd')).toBe('auth.passwords_dont_match');
  });
});

describe('requiredFieldValidate', () => {
  it('rejects empty/whitespace-only values', () => {
    expect(requiredFieldValidate('')).toBe('auth.required_field');
    expect(requiredFieldValidate('   ')).toBe('auth.required_field');
  });

  it('accepts any non-empty value (format-agnostic — used for password/name fields too)', () => {
    expect(requiredFieldValidate('Alice')).toBeNull();
  });
});

describe('onBlurValidate / onChangeClear field-error contract', () => {
  // The contract (documented in utils.js): blur SETS an error; typing only
  // ever CLEARS an already-shown error, it never sets one while the user is
  // still typing, and it leaves an error alone if the new value is still invalid.
  it('onBlurValidate sets whatever the validator returns', () => {
    const setFieldError = jest.fn();
    onBlurValidate('first', () => 'auth.required_field', setFieldError)();
    expect(setFieldError).toHaveBeenCalledWith('first', 'auth.required_field');
  });

  it('onChangeClear clears an existing error once the new value is valid', () => {
    const onChange = jest.fn();
    const setFieldError = jest.fn();
    const validate = (v) => (v ? null : 'auth.required_field');
    const handler = onChangeClear('first', onChange, validate, { first: 'auth.required_field' }, setFieldError);

    handler({ target: { value: 'Alice' } });

    expect(onChange).toHaveBeenCalled();
    expect(setFieldError).toHaveBeenCalledWith('first', null);
  });

  it('onChangeClear leaves the error alone if the new value is still invalid', () => {
    const setFieldError = jest.fn();
    const validate = (v) => (v ? null : 'auth.required_field');
    const handler = onChangeClear('first', jest.fn(), validate, { first: 'auth.required_field' }, setFieldError);

    handler({ target: { value: '' } });

    expect(setFieldError).not.toHaveBeenCalled();
  });

  it('onChangeClear never sets an error when none is currently shown', () => {
    const setFieldError = jest.fn();
    const validate = () => 'auth.required_field';
    const handler = onChangeClear('first', jest.fn(), validate, {}, setFieldError);

    handler({ target: { value: '' } });

    expect(setFieldError).not.toHaveBeenCalled();
  });
});

describe('pickFirstError', () => {
  it('prefers a top-level error string', () => {
    expect(pickFirstError({ error: 'auth.invalid_credentials', email: 'ignored' })).toBe('auth.invalid_credentials');
  });

  it('falls back to allauth-shaped errors[0].message', () => {
    expect(pickFirstError({ errors: [{ message: 'bad token' }] })).toBe('bad token');
  });

  it('falls back to the first string field, skipping _auth and errors', () => {
    expect(pickFirstError({ _auth: { code: 'x' }, password1: 'Too short' })).toBe('Too short');
  });

  it('returns null for empty/non-object input', () => {
    expect(pickFirstError(null)).toBeNull();
    expect(pickFirstError({})).toBeNull();
  });
});

describe('authError', () => {
  const realSefaria = global.Sefaria;
  beforeAll(() => { global.Sefaria = { _: (key) => `t:${key}` }; });
  afterAll(() => { global.Sefaria = realSefaria; });

  it('localizes the picked error message and passes through _auth metadata', () => {
    const result = authError(
      { _auth: { code: 'sso_only_account', providers: ['google'] }, error: 'auth.generic_error' },
      'auth.fallback',
    );
    expect(result).toEqual({
      message: 't:auth.generic_error',
      code: 'sso_only_account',
      providers: ['google'],
    });
  });

  it('uses the fallback message and empty providers when data has no error', () => {
    const result = authError(null, 'auth.fallback');
    expect(result).toEqual({ message: 't:auth.fallback', code: undefined, providers: [] });
  });
});

describe('postJson / postForm', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it('postJson sends a JSON body and reports ok on a 2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ foo: 'bar' }),
    });

    const result = await postJson('/api/auth/login', { email: 'a@test.com' }, 'csrf-token');

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json', 'X-CSRFToken': 'csrf-token' }),
      body: JSON.stringify({ email: 'a@test.com' }),
    }));
    expect(result).toEqual({ ok: true, data: { foo: 'bar' }, networkError: false });
  });

  it('postForm urlencodes the body and reports ok:false on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'auth.invalid_email' }),
    });
    const body = new URLSearchParams({ email: 'a@test.com' });

    const result = await postForm('/api/auth/password/reset', body, 'csrf-token');

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/password/reset', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body: body.toString(),
    }));
    expect(result).toEqual({ ok: false, data: { error: 'auth.invalid_email' }, networkError: false });
  });

  it('reports networkError:true when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await postJson('/api/auth/login', {}, 'csrf-token');

    expect(result).toEqual({ ok: false, data: {}, networkError: true });
  });

  it('tolerates a non-JSON response body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await postJson('/api/auth/login', {}, 'csrf-token');

    expect(result).toEqual({ ok: true, data: {}, networkError: false });
  });
});
