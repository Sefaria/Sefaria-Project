import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import {
  Box,
  CodeLanguage,
  HttpMethod,
  ParamSection,
  ParameterInfo,
  ResponseStatus,
  notImplemented,
} from './developersCommon';

/**
 * An endpoint page, `/reference/<slug>` (DEV-REF; PLAN §6.2 A–D and the tag popover of F):
 * headline, parameters, responses, the request card with code samples, and the response
 * card before Try It runs. Running requests is DevelopersTryItPage; sidebar, footer and
 * Discord are DevelopersShellPage.
 */
export class DevelopersReferencePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Headline ---------------------------------------------------------------------------

  async methodBadge(): Promise<HttpMethod> {
    return notImplemented('DevelopersReferencePage.methodBadge');
  }

  /** The URL line as shown, e.g. "https://www.sefaria.org/api/v3/texts/{tref}". */
  async urlLineText(): Promise<string> {
    return notImplemented('DevelopersReferencePage.urlLineText');
  }

  /** True when the "Deprecated Endpoint" marker is shown. */
  async isDeprecated(): Promise<boolean> {
    return notImplemented('DevelopersReferencePage.isDeprecated');
  }

  /** Click the tag button next to the title; returns the popover's text (the tag's name). */
  async openTagPopover(): Promise<string> {
    return notImplemented('DevelopersReferencePage.openTagPopover');
  }

  /** Bounding boxes of the three columns, for the breakpoint checks; null when not rendered. */
  async layoutBoxes(): Promise<{ sidebar: Box | null; article: Box | null; playground: Box | null }> {
    return notImplemented('DevelopersReferencePage.layoutBoxes');
  }

  // ---- Parameters (PLAN §6.2 B) -----------------------------------------------------------

  /** Parameter names of a section, in order; [] when the section is absent. */
  async parameterNames(section: ParamSection): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.parameterNames');
  }

  async parameterInfo(section: ParamSection, name: string): Promise<ParameterInfo> {
    return notImplemented('DevelopersReferencePage.parameterInfo');
  }

  /** Section anchor ids present on the page (`path-params`, `query-params`, `body-params`, `response-schemas`). */
  async sectionAnchors(): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.sectionAnchors');
  }

  /** Type into a text input (clears it first). For a body field use its dotted path, e.g. "text.body". */
  async fillParameter(section: ParamSection, name: string, value: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.fillParameter');
  }

  async parameterValue(section: ParamSection, name: string): Promise<string> {
    return notImplemented('DevelopersReferencePage.parameterValue');
  }

  async focusParameter(section: ParamSection, name: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.focusParameter');
  }

  async isParameterFocused(section: ParamSection, name: string): Promise<boolean> {
    return notImplemented('DevelopersReferencePage.isParameterFocused');
  }

  /** Choose an option of an enum's select. */
  async selectEnumValue(section: ParamSection, name: string, value: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.selectEnumValue');
  }

  /** The "Allowed:" chips of an enum. */
  async allowedChips(section: ParamSection, name: string): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.allowedChips');
  }

  /** Click an "Allowed:" chip; returns the feedback it shows ("Copied!"). */
  async clickAllowedChip(section: ParamSection, name: string, value: string): Promise<string> {
    return notImplemented('DevelopersReferencePage.clickAllowedChip');
  }

  /** Focus an input with examples; returns its "Use example value" entries. */
  async openExampleList(section: ParamSection, name: string): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.openExampleList');
  }

  async useExampleValue(section: ParamSection, name: string, example: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.useExampleValue');
  }

  /** Expand an object body parameter with "+"; returns its field names. */
  async expandBodyObject(name: string): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.expandBodyObject');
  }

  /** Click a `{placeholder}` chip in the URL line (focuses its input). */
  async clickUrlPlaceholder(name: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.clickUrlPlaceholder');
  }

  // ---- Responses (PLAN §6.2 C) ------------------------------------------------------------

  /** "Response" or "Responses". */
  async responsesHeading(): Promise<string> {
    return notImplemented('DevelopersReferencePage.responsesHeading');
  }

  async responseStatuses(): Promise<ResponseStatus[]> {
    return notImplemented('DevelopersReferencePage.responseStatuses');
  }

  async toggleResponse(code: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.toggleResponse');
  }

  async isResponseExpanded(code: string): Promise<boolean> {
    return notImplemented('DevelopersReferencePage.isResponseExpanded');
  }

  /** Property names shown under "RESPONSE BODY" of an expanded status, at the top level. */
  async responseProperties(code: string): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.responseProperties');
  }

  /** Open a property's "child attributes"; returns the child property names. */
  async expandChildAttributes(code: string, property: string): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.expandChildAttributes');
  }

  /** Pick a variant in a union type's select. */
  async selectUnionVariant(code: string, property: string, variant: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.selectUnionVariant');
  }

  /** Open a nested array's expander; returns its item properties. */
  async openNestedArray(code: string, property: string): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.openNestedArray');
  }

  /** Close the open nested array with its ✕. */
  async closeNestedArray(): Promise<void> {
    return notImplemented('DevelopersReferencePage.closeNestedArray');
  }

  // ---- Response card before Try It --------------------------------------------------------

  /** The example shown, e.g. "200 - Esther 1.1"; null in the empty state. */
  async responseExampleLabel(): Promise<string | null> {
    return notImplemented('DevelopersReferencePage.responseExampleLabel');
  }

  /** Open the status dropdown; returns its entries (examples, then "Clear Example"). */
  async openResponseExampleMenu(): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.openResponseExampleMenu');
  }

  async chooseResponseExample(label: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.chooseResponseExample');
  }

  async clearResponseExample(): Promise<void> {
    return notImplemented('DevelopersReferencePage.clearResponseExample');
  }

  /** The example chips of the empty state. */
  async emptyStateExampleChips(): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.emptyStateExampleChips');
  }

  // ---- Code samples (PLAN §6.2 D) ---------------------------------------------------------

  async languageButtons(): Promise<CodeLanguage[]> {
    return notImplemented('DevelopersReferencePage.languageButtons');
  }

  /** The pressed language button (aria-pressed). */
  async selectedLanguage(): Promise<CodeLanguage> {
    return notImplemented('DevelopersReferencePage.selectedLanguage');
  }

  async selectLanguage(language: CodeLanguage): Promise<void> {
    return notImplemented('DevelopersReferencePage.selectLanguage');
  }

  /** Open the "⋯" menu; returns its entries (18). */
  async openMoreLanguages(): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.openMoreLanguages');
  }

  async chooseMoreLanguage(name: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.chooseMoreLanguage');
  }

  /** Open the request card's library menu for the language; returns its entries. */
  async openLibraryMenu(): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.openLibraryMenu');
  }

  async selectLibrary(name: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.selectLibrary');
  }

  async selectedLibrary(): Promise<string> {
    return notImplemented('DevelopersReferencePage.selectedLibrary');
  }

  async codeSampleText(): Promise<string> {
    return notImplemented('DevelopersReferencePage.codeSampleText');
  }

  /** Click the request card's copy button; returns its label afterwards ("Copied!"). */
  async copyCodeSample(): Promise<string> {
    return notImplemented('DevelopersReferencePage.copyCodeSample');
  }

  /** POST pages: the "Examples" dropdown of request bodies; [] when absent. */
  async requestBodyExamples(): Promise<string[]> {
    return notImplemented('DevelopersReferencePage.requestBodyExamples');
  }

  async selectRequestBodyExample(name: string): Promise<void> {
    return notImplemented('DevelopersReferencePage.selectRequestBodyExample');
  }
}
