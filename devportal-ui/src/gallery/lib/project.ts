import { parseCategories, type CategoryId } from './categories';
import { resourceGroup } from './endpoints';
import { languageName } from './languages';
import { parseExperience, type ExperienceLevel } from './experience';
import { parseReach, type ReachBucket } from './reach';
import { parseTech } from './tech';

export type ProjectStatus = 'unknown' | 'live' | 'dead';

/** One row of `GET /api/powered-by`, as the server sends it. */
export interface RawProject {
  id: number;
  project_name: string;
  project_desc: string | null;
  project_why: string | null;
  project_link: string | null;
  project_source_code: string | null;
  project_category: string | null;
  tags: string[];
  sefaria_tools_used: unknown[];
  tech_used_raw: string | null;
  technical_experience: string | null;
  project_reach: string | null;
  vibe_coded: boolean;
  is_buggy: boolean;
  status: ProjectStatus;
  featured: boolean;
  /** Not in the API yet: absent or null sorts after any number. */
  featured_order?: number | null;
  submission_source: 'formstack' | 'manual' | 'in_the_wild';
  submission_date: string | null;
  created_at: string;
  image_url: string | null;
  has_pbs_logo: boolean;
  is_published: boolean;
  consent_to_display: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  backstory: string | null;
  /** Safe http(s) only. */
  url: string | null;
  /** Hostname without "www.". */
  domain: string | null;
  /** Safe http(s) only. */
  sourceUrl: string | null;
  categories: CategoryId[];
  /** Cleaned tags, without language tags (see {@link languages}). */
  topics: string[];
  /** Language tags pulled out of `tags`: "English", "Hebrew", … */
  languages: string[];
  resources: string[];
  /** `resources` mapped to the /charts groups, deduped. The generic "Sefaria API" is dropped. */
  resourceGroups: string[];
  builtWith: string | null;
  reach: ReachBucket | null;
  submittedAt: Date | null;
  /** Set in Django admin; selects the featured band. */
  featured: boolean;
  /** Lower first within the featured band; null when unset. */
  featuredOrder: number | null;
  /** Hidden from the public site unless "Show projects with known issues" is on. */
  isBuggy: boolean;
  /** Technologies found in `builtWith`, for the "Built with" filter and /charts. */
  techMentions: string[];
  // Analytics only: never rendered in the project UI.
  experience: ExperienceLevel | null;
  vibeCoded: boolean;
}

export function safeUrl(value: string | null | undefined): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

const MONTH_YEAR = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/i;
const META_TAGS = new Set(['not vibe-coded', 'no experience', 'experience unspecified']);
const ALIASES: Record<string, string> = {
  kaballah: 'Kabbalah',
  halakha: 'Halakhah',
  chavruta: 'Chavruta',
  parasha: 'Parashah',
};

/** The canonical spelling of a topic, so older links and misspelt tags still match. */
export function canonicalTopic(topic: string): string {
  const trimmed = topic.trim();
  return ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/** Trim, dedupe case-insensitively, alias typos, drop dates and meta tags. */
export function cleanTopics(tags: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags ?? []) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim();
    if (!trimmed || MONTH_YEAR.test(trimmed) || META_TAGS.has(trimmed.toLowerCase())) continue;
    const topic = canonicalTopic(trimmed);
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
  }
  return out;
}

/** Cleaned tags split into topics and languages, each in first-seen order. */
export function splitTags(tags: readonly string[] | null | undefined): {
  topics: string[];
  languages: string[];
} {
  const topics: string[] = [];
  const languages: string[] = [];
  for (const tag of cleanTopics(tags)) {
    const language = languageName(tag);
    if (language) languages.push(language);
    else topics.push(tag);
  }
  return { topics, languages };
}

/** Strings only, trimmed, deduped, trailing "/" removed. */
export function cleanResources(tools: readonly unknown[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const tool of tools ?? []) {
    if (typeof tool !== 'string') continue;
    let value = tool.trim();
    while (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
    if (value) out.add(value);
  }
  return [...out];
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Distinct Sefaria resource groups for a project's raw resources, in first-seen order. */
export function cleanResourceGroups(resources: readonly string[]): string[] {
  const groups = new Set<string>();
  for (const resource of resources) {
    const group = resourceGroup(resource);
    if (group) groups.add(group);
  }
  return [...groups];
}

export function normalizeProject(raw: RawProject): Project {
  const url = safeUrl(raw.project_link);
  const { topics, languages } = splitTags(raw.tags);
  const resources = cleanResources(raw.sefaria_tools_used);
  return {
    id: raw.id,
    name: raw.project_name.trim(),
    description: raw.project_desc?.trim() ?? '',
    backstory: textOrNull(raw.project_why),
    url: url?.href ?? null,
    domain: url ? url.hostname.replace(/^www\./, '') : null,
    sourceUrl: safeUrl(raw.project_source_code)?.href ?? null,
    categories: parseCategories(raw.project_category),
    topics,
    languages,
    resources,
    resourceGroups: cleanResourceGroups(resources),
    builtWith: textOrNull(raw.tech_used_raw),
    reach: parseReach(raw.project_reach),
    submittedAt: parseDate(raw.submission_date),
    featured: raw.featured === true,
    featuredOrder: Number.isFinite(raw.featured_order) ? (raw.featured_order as number) : null,
    isBuggy: raw.is_buggy === true,
    experience: parseExperience(raw.technical_experience),
    vibeCoded: raw.vibe_coded === true,
    techMentions: parseTech(raw.tech_used_raw),
  };
}

/** Only published projects are ever shown. `consent_to_display` is deliberately not checked: some projects found in the wild are published without explicit consent. */
export function normalizeProjects(raw: readonly RawProject[]): Project[] {
  return raw.filter((p) => p.is_published).map(normalizeProject);
}

/** Topics for the detail view: the languages stand in only when there are no other topics. */
export function detailTopics(project: Project): string[] {
  return project.topics.length > 0 ? project.topics : project.languages;
}
