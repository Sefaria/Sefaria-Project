// The state of one endpoint page, shared by the article (form inputs) and the playground (samples, Try It).
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AnalyticsEvent, TryItMethod } from '../analytics/events';
import type { OperationSpec } from '../contracts';
import { endpointForm, initialValues, type EndpointForm, type FormValues } from './model/fields';
import { responseExamples, type ResponseExample } from './model/responses';
import { describeRequest, toHar, tryItUrl, UnsafeRequestUrlError, type HeaderEntry } from './request/request';
import { generateSnippet } from './snippets/generate';
import { findLanguage, findLibrary, type Language, type Library } from './snippets/languages';
import { addRecentRequest, readRecentRequests, type RecentRequest } from './tryit/recent';
import { sendTryIt, type TryItResult } from './tryit/send';

/** Per-browser code language choice (localStorage, never a cookie: the portal is cookie-free). */
export const LANGUAGE_KEY = 'dp:code-language:v1';

interface LanguagePreference {
  language: string;
  libraries: Record<string, string>;
}

const DEFAULT_PREFERENCE: LanguagePreference = { language: 'shell', libraries: {} };

function readPreference(): LanguagePreference {
  try {
    if (typeof window === 'undefined') return DEFAULT_PREFERENCE;
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LANGUAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCE;
    const p = parsed as Partial<LanguagePreference>;
    return {
      language: typeof p.language === 'string' ? p.language : 'shell',
      libraries: typeof p.libraries === 'object' && p.libraries !== null ? p.libraries : {},
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function writePreference(preference: LanguagePreference) {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, JSON.stringify(preference));
  } catch {
    // Storage blocked: the choice lasts for this page view.
  }
}

/** What the response panel shows. */
export type ResponseView =
  | { kind: 'empty' }
  | { kind: 'example'; exampleId: string }
  | { kind: 'loading' }
  | { kind: 'result'; result: TryItResult; requestHeaders: HeaderEntry[] };

export interface EndpointOptions {
  /** `site.apiOrigin` from the page payload: the only origin Try It calls. */
  apiOrigin: string;
  /** Receives the C8 `try_it_run` event; the analytics module (W11) sends it to GA4. */
  onAnalyticsEvent?: (event: AnalyticsEvent) => void;
  /** Injected in tests; defaults to the browser's fetch. */
  fetchImpl?: typeof fetch;
}

export interface EndpointState {
  op: OperationSpec;
  form: EndpointForm;
  /** The form's initial values (required defaults prefilled). */
  initial: FormValues;
  values: FormValues;
  setValue: (key: string, value: string) => void;
  setValues: (values: FormValues) => void;
  language: Language;
  library: Library;
  setLanguage: (id: string) => void;
  setLibrary: (id: string) => void;
  snippet: string;
  examples: ResponseExample[];
  response: ResponseView;
  setResponse: (view: ResponseView) => void;
  recent: RecentRequest[];
  selectedRecent: number | null;
  selectRecent: (index: number | null) => void;
  tryIt: () => Promise<void>;
  /** Text for the polite live region ("Response 200"). */
  announcement: string;
}

export function useEndpointState(op: OperationSpec, options: EndpointOptions): EndpointState {
  const form = useMemo(() => endpointForm(op), [op]);
  const initial = useMemo(() => initialValues(form), [form]);
  const [values, setValuesState] = useState<FormValues>(initial);
  const [preference, setPreference] = useState<LanguagePreference>(readPreference);
  const examples = useMemo(() => responseExamples(op), [op]);
  const [response, setResponse] = useState<ResponseView>(() =>
    examples[0] !== undefined ? { kind: 'example', exampleId: examples[0].id } : { kind: 'empty' }
  );
  const [recent, setRecent] = useState<RecentRequest[]>(() =>
    readRecentRequests().filter((r) => r.operationId === op.operationId)
  );
  const [selectedRecent, selectRecent] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const language = findLanguage(preference.language);
  const library = findLibrary(language, preference.libraries[language.id]);
  const request = useMemo(() => describeRequest(op, form, values), [op, form, values]);
  const snippet = useMemo(
    () => generateSnippet(toHar(request, op.server), language, library),
    [request, op.server, language, library]
  );

  const setValue = useCallback((key: string, value: string) => setValuesState((v) => ({ ...v, [key]: value })), []);
  const setLanguage = useCallback((id: string) => {
    setPreference((p) => {
      const next = { ...p, language: id };
      writePreference(next);
      return next;
    });
  }, []);
  const setLibrary = useCallback(
    (id: string) => {
      setPreference((p) => {
        const next = { ...p, libraries: { ...p.libraries, [language.id]: id } };
        writePreference(next);
        return next;
      });
    },
    [language.id]
  );

  const tryIt = useCallback(async () => {
    const { apiOrigin, fetchImpl, onAnalyticsEvent } = options;
    setResponse({ kind: 'loading' });
    setAnnouncement('');
    const headers: Record<string, string> = {};
    for (const h of request.headers) headers[h.name] = h.value;
    let result: TryItResult;
    try {
      const url = tryItUrl(apiOrigin, request);
      result = await sendTryIt({ url, method: request.method, headers, body: request.body?.text }, fetchImpl);
    } catch (error) {
      if (!(error instanceof UnsafeRequestUrlError)) throw error;
      result = { ok: false, status: 0, message: error.message };
    }
    setResponse({ kind: 'result', result, requestHeaders: request.headers });
    setAnnouncement(result.ok ? `Response ${result.status}` : 'The request failed');
    const next = addRecentRequest({
      time: new Date().toISOString(),
      status: result.status,
      method: request.method,
      path: op.path,
      operationId: op.operationId,
    });
    setRecent(next.filter((r) => r.operationId === op.operationId));
    selectRecent(null);
    onAnalyticsEvent?.({
      name: 'try_it_run',
      params: { operation_id: op.operationId, method: request.method as TryItMethod, status: result.status },
    });
  }, [request, op.path, op.operationId, options]);

  return {
    op,
    form,
    initial,
    values,
    setValue,
    setValues: setValuesState,
    language,
    library,
    setLanguage,
    setLibrary,
    snippet,
    examples,
    response,
    setResponse,
    recent,
    selectedRecent,
    selectRecent,
    tryIt,
    announcement,
  };
}

export const EndpointContext = createContext<EndpointState | null>(null);

export function useEndpoint(): EndpointState {
  const state = useContext(EndpointContext);
  if (state === null) throw new Error('useEndpoint outside <EndpointProvider>');
  return state;
}
