/*
 * Staff-only books QA helper, used by STAFF_ONLY_BOOKS_QA_GUIDE.md (PR #3838).
 * Lives on the PR branch only for this round of testing: remove docs/qa/staff-only-books/ before merging.
 *
 * Run it in the browser console (or your agent's "run JavaScript in the page" tool) on the STAFF cauldron,
 * https://www.staff-only-staff.cauldron.sefaria.org, while logged in as a staff user. It defines `qa`,
 * which calls the site's own APIs with your login. Every call prints what happened and returns the
 * server's response.
 *
 * Use your own prefix in every name ("Zzz QA <your name> ..."). Titles may not contain hyphens.
 */
(() => {
  const STAFF = "https://www.staff-only-staff.cauldron.sefaria.org";
  const PUBLIC = "https://www.staff-only-public.cauldron.sefaria.org";
  if (location.origin !== STAFF) {
    console.warn(`qa-helper: run this on ${STAFF}, not ${location.origin}.`);
  }

  const csrf = () => (document.cookie.split("; ").find(c => c.startsWith("csrftoken=")) || "").split("=")[1] || "";
  const url = path => path.replace(/ /g, "_");

  async function call(method, path, {json, form} = {}) {
    const headers = {"X-CSRFToken": csrf()};
    let body;
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams({json: JSON.stringify(form)}).toString();
    }
    const response = await fetch(path, {method, headers, body, credentials: "same-origin"});
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = {error: `HTTP ${response.status}: not JSON (are you logged in as staff?)`, body: text.slice(0, 300)}; }
    const failed = !response.ok || (data && !Array.isArray(data) && data.error) ||
                   (Array.isArray(data) && data.some(d => d && d.error));
    console[failed ? "error" : "log"](`${method} ${path}`, data);
    return data;
  }

  const qa = {
    STAFF, PUBLIC,

    // ---- create (on the staff cauldron) ----

    /** A category. Staff-only unless {staffOnly: false}. Parent defaults to Tanakh. */
    createCategory(name, heName, {parent = ["Tanakh"], staffOnly = true} = {}) {
      const category = {path: [...parent, name], sharedTitle: name, heSharedTitle: heName};
      if (staffOnly) category.admin_only = true;
      return call("POST", "/api/category", {json: category});
    },

    /**
     * A simple book (chapters and verses). Inside a staff-only category it is made staff-only automatically.
     * In a public category it is public unless {staffOnly: true}.
     */
    createBook(title, heTitle, categoryPath, {staffOnly = false} = {}) {
      const index = {
        title, categories: categoryPath,
        schema: {
          nodeType: "JaggedArrayNode", key: title, depth: 2,
          addressTypes: ["Integer", "Integer"], sectionNames: ["Chapter", "Verse"],
          titles: [{lang: "en", text: title, primary: true}, {lang: "he", text: heTitle, primary: true}],
        },
      };
      if (staffOnly) index.admin_only = true;
      return call("POST", `/api/v2/raw/index/${url(title)}`, {form: index});
    },

    /**
     * A whole version of a book. `chapters` is a list of chapters, each a list of verse strings.
     * A version of a staff-only book is made staff-only automatically. To add a staff-only version to a
     * PUBLIC book (e.g. Genesis), pass {staffOnly: true}. {forcePublic: true} explicitly asks for a public
     * version, which must be refused for a staff-only book.
     */
    addVersion(bookTitle, versionTitle, language, chapters, {staffOnly = false, forcePublic = false, primary = false} = {}) {
      const hebrew = language === "he";
      const version = {
        title: bookTitle, versionTitle, language, actualLanguage: language,
        languageFamilyName: hebrew ? "hebrew" : "english", direction: hebrew ? "rtl" : "ltr",
        isSource: hebrew, isPrimary: primary, versionSource: "https://www.sefaria.org", chapter: chapters,
      };
      if (staffOnly) version.admin_only = true;
      if (forcePublic) version.admin_only = false;
      return call("POST", "/api/versions", {form: version});
    },

    /** A link between two refs. It is staff-only automatically if either ref's book is staff-only. */
    addLink(ref1, ref2, type = "commentary") {
      return call("POST", "/api/links/", {form: {refs: [ref1, ref2], type}});
    },

    // ---- inspect ----

    /** What is staff-only about a book: its categories, base texts, versions and links. */
    status(bookTitle) {
      return call("GET", `/_api/staff-only/status?index=${encodeURIComponent(bookTitle)}`);
    },

    /** Pages and API calls to open on BOTH cauldrons to compare. */
    urls(bookTitle, {categoryPath, linkedRef = "Genesis 1:1", publicBook = "Genesis"} = {}) {
      const paths = {
        "book page": `/${url(bookTitle)}.1`,
        "book in table of contents (API)": "/api/index",
        "book index (API)": `/api/v2/raw/index/${url(bookTitle)}`,
        "book text (API)": `/api/v3/texts/${url(bookTitle)}.1`,
        [`links on ${linkedRef} (API)`]: `/api/links/${url(linkedRef)}`,
        [`versions of ${publicBook} (API)`]: `/api/texts/versions/${url(publicBook)}`,
        "recent activity": "/activity",
      };
      if (categoryPath) {
        paths["category page"] = `/texts/${categoryPath.map(url).join("/")}`;
        paths["category (API)"] = `/api/category/${categoryPath.map(encodeURIComponent).join("/")}`;
      }
      const rows = Object.entries(paths).map(([what, path]) => ({what, staff: STAFF + path, public: PUBLIC + path}));
      console.table(rows);
      return rows;
    },

    // ---- publish (on the staff cauldron; one way only: staff-only -> public) ----

    publishCategory(path, {dryRun = false} = {}) {
      return call("POST", "/_api/staff-only/category/publish", {json: {path, dry_run: dryRun}});
    },
    /** Publishes the book, and by default its staff-only versions and links. */
    publishBook(title, {versions = true, links = true, dryRun = false} = {}) {
      return call("POST", "/_api/staff-only/index/publish",
                  {json: {title, include_versions: versions, include_links: links, dry_run: dryRun}});
    },
    publishVersion(title, versionTitle, language, {dryRun = false} = {}) {
      return call("POST", "/_api/staff-only/version/publish", {json: {title, versionTitle, language, dry_run: dryRun}});
    },
    /** Publishes the staff-only links touching a book; links whose other book is still staff-only are skipped. */
    publishLinks(bookTitle, {dryRun = false} = {}) {
      return call("POST", "/_api/staff-only/links/publish", {json: {index: bookTitle, dry_run: dryRun}});
    },

    /**
     * After publishing: the public site keeps the library in memory, so it needs these refreshes.
     * Open them on the PUBLIC cauldron while logged in as staff, in this order.
     */
    refreshUrls(...titles) {
      const paths = ["/admin/reset/toc", ...titles.map(t => `/admin/reset/${url(t)}`), "/admin/reset/ac"];
      const list = paths.map(p => PUBLIC + p);
      console.log("Open on the PUBLIC cauldron, in order:\n" + list.join("\n"));
      return list;
    },
  };

  window.qa = qa;
  console.log("qa-helper loaded. Try: qa.status('Zzz Staff Only Test Book')");
})();
