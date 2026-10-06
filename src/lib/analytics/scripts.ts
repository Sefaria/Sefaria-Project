/**
 * The third-party analytics scripts, written into the page head exactly as Django's templates/base.html does (same IDs, same
 * config parameters), each only when its setting is present (src/lib/config.ts). Development and tests configure none.
 *
 *  - Google Tag Manager (GOOGLE_TAG_MANAGER_CODE): the container snippet. GTM also installs the `ga` shim used by uaEvent.
 *  - gtag.js (GOOGLE_GTAG): config { user_id, traffic_type, site_lang, site_version } — user_id/traffic_type are filled once the
 *    signed-in user is known (setAnalyticsUser), as the old page does from DJANGO_VARS.
 *  - Simple Analytics (SIMPLE_ANALYTICS_HOSTNAME): the sa_event queue stub, sa_metadata, the script with data-collect-dnt.
 *
 * Not ported (owner decision pending, see docs/PHASE7_PLAN.md §3): VWO (hides <body> until loaded), Hotjar, Unbounce.
 *
 * @feature ANL-014 Third-party analytics and testing scripts
 */
import type { AnalyticsConfig } from "~/lib/config";

const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export interface HeadScript {
  children?: string;
  src?: string;
  async?: boolean;
  defer?: boolean;
  "data-hostname"?: string;
  "data-collect-dnt"?: string;
}

/** `siteLang` is the old `request.interfaceLang` ("english" | "hebrew"). */
export function analyticsHeadScripts(cfg: AnalyticsConfig, siteLang: string): HeadScript[] {
  const out: HeadScript[] = [];
  if (cfg.gtm) {
    out.push({
      children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${js(cfg.gtm)});`,
    });
  }
  if (cfg.gtag) {
    out.push({ src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.gtag)}`, async: true });
    out.push({
      children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${js(cfg.gtag)},${js({ user_id: null, traffic_type: null, site_lang: siteLang, site_version: cfg.appVersion || null })});`,
    });
  }
  if (cfg.simpleAnalyticsHost) {
    // the queue stub first, so sa_event calls made before the script arrives are kept
    out.push({ children: `window.sa_event=window.sa_event||function(){var a=[].slice.call(arguments);window.sa_event.q?window.sa_event.q.push(a):window.sa_event.q=[a];};` });
  }
  return out;
}

/**
 * base.html's "Default metadata for Simple Analytics", inline before the script reads it. `loggedIn`/`staff` come from the
 * server's view of the user (until sign-in lands they are false; setAnalyticsUser refreshes them on the client).
 */
export function saMetadataScript(cfg: AnalyticsConfig, user: { loggedIn: boolean; staff: boolean }): string | null {
  if (!cfg.simpleAnalyticsHost) return null;
  return `(function(){var u=function(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2)};try{if(sessionStorage.getItem('sa_custom_session_id')===null)sessionStorage.setItem('sa_custom_session_id',u());if(localStorage.getItem('sa_id')===null)localStorage.setItem('sa_id',u());var nv=('isNewVisitor' in sessionStorage&&JSON.parse(sessionStorage.getItem('isNewVisitor')))||(!('isNewVisitor' in sessionStorage)&&!('isReturningVisitor' in localStorage));var ret=!nv&&('isReturningVisitor' in localStorage)&&JSON.parse(localStorage.getItem('isReturningVisitor'));window.sa_metadata=Object.assign({logged_in:${user.loggedIn},interface_lang:document.documentElement.lang==='he'?'he':'en',device_type:window.matchMedia('(max-width: 600px)').matches?'mobile':'desktop',user_type:ret?'old':'new',custom_session_id:sessionStorage.getItem('sa_custom_session_id'),sefaria_id:localStorage.getItem('sa_id')}${user.staff ? ",{traffic_type:'sefaria_email'}" : ""});}catch(e){}})();`;
}

/** Simple Analytics' own script, at the end of <body> as on the old page (after sa_metadata is set: see session.ts). */
export function simpleAnalyticsScript(cfg: AnalyticsConfig): HeadScript | null {
  if (!cfg.simpleAnalyticsHost) return null;
  // DEBUG deployments use the dev script and host (base.html: sa-dev.sefaria.org + latest.dev.js)
  const dev = cfg.simpleAnalyticsHost.startsWith("sa-dev.");
  return { src: `https://scripts.simpleanalyticscdn.com/latest${dev ? ".dev" : ""}.js`, defer: true, "data-hostname": cfg.simpleAnalyticsHost, "data-collect-dnt": "true" };
}
