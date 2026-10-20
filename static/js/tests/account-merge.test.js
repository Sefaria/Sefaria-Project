/* Exercise the actual DOM event handler and HTTP requests, without React/jQuery. */
describe("account merge form", function () {
  let form;
  let fields;
  let status;
  let originalFetch;

  function response(payload, ok = true) {
    return {ok: ok, json: () => Promise.resolve(payload)};
  }

  const preview = {
    source: {id: 12, email: "work@example.com", name: "Work User"},
    destination: {id: 34, email: "personal@example.com", name: "Personal User"},
  };

  function submit() {
    form.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}));
  }

  // Let the event handler finish its fetch/json await chain.
  async function settle() {
    for (let count = 0; count < 15; count++) await Promise.resolve();
  }

  beforeEach(function () {
    jest.resetModules();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    document.body.innerHTML = `
      <form id="merge-accounts-form" action="/admin/merge/accounts">
        <input name="csrfmiddlewaretoken" value="csrf-token">
        <fieldset id="merge-accounts-fields">
          <input name="source" value="work@example.com" required>
          <input name="destination" value="personal@example.com" required>
          <input name="profile_mode" value="fill">
          <input name="password" value="admin-password" type="password" required>
          <input name="accounts_quiet" type="checkbox" checked>
          <input name="confirmation" value="MERGE">
          <button id="merge-accounts-submit" disabled>Review merge</button>
        </fieldset>
      </form>
      <div id="merge-accounts-status" role="status"></div>`;
    form = document.getElementById("merge-accounts-form");
    fields = document.getElementById("merge-accounts-fields");
    status = document.getElementById("merge-accounts-status");
    jest.spyOn(window, "confirm").mockReturnValue(true);
    require("../account-merge");
  });

  afterEach(function () {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    document.body.textContent = "";
  });

  it("previews identities, pins reviewed IDs, and reports success and warnings", async function () {
    // Snapshot each request body: the handler reuses its FormData between requests.
    const requests = [];
    global.fetch.mockImplementation((url, options) => {
      requests.push({url, options, body: Object.fromEntries(options.body.entries())});
      return Promise.resolve(requests.length === 1 ? response(preview) : response({
        success: "Accounts merged.", warnings: ["CRM record needs manual review."],
      }));
    });
    submit();
    await settle();
    expect(requests).toHaveLength(2);
    expect(requests[0].body).toMatchObject({action: "preview", source: "work@example.com", password: "admin-password"});
    expect(requests[1].body).toMatchObject({action: "merge", source: "12", destination: "34", csrfmiddlewaretoken: "csrf-token"});
    expect(requests[1].options.credentials).toBe("same-origin");
    expect(window.confirm.mock.calls[0][0]).toContain("work@example.com (ID 12)");
    expect(window.confirm.mock.calls[0][0]).toContain("personal@example.com (ID 34)");
    expect(status.textContent).toContain("Accounts merged.");
    expect(status.textContent).toContain("CRM record needs manual review.");
    expect(form.elements.password.value).toBe("");
    expect(fields.disabled).toBe(true);
    submit();
    await settle();
    expect(global.fetch).toHaveBeenCalledTimes(2); // Success never enables a second merge.
  });

  it("cancels after review without submitting a merge", async function () {
    global.fetch.mockResolvedValue(response(preview));
    window.confirm.mockReturnValue(false);
    submit();
    await settle();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(status.textContent).toContain("No accounts were changed");
    expect(fields.disabled).toBe(false);
  });

  it("ignores duplicate submits while reviewing", async function () {
    global.fetch.mockImplementation(() => new Promise(() => {}));
    submit();
    submit();
    await settle();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(fields.disabled).toBe(true);
  });

  it("does not submit invalid browser fields", async function () {
    form.elements.source.value = "";
    submit();
    await settle();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows validation errors as text and lets the admin correct them", async function () {
    global.fetch.mockResolvedValue(response({errors: {source: [{message: "<img src=x onerror=alert(1)>"}]}}, false));
    submit();
    await settle();
    expect(status.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(status.querySelector("img")).toBeNull();
    expect(fields.disabled).toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("unlocks only server-confirmed validation failures after review", async function () {
    global.fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({
      error: "Incorrect admin password.", retry_safe: true,
    }, false));
    submit();
    await settle();
    expect(status.textContent).toContain("Incorrect admin password");
    expect(fields.disabled).toBe(false);
  });

  it("keeps the form locked after a partial merge error", async function () {
    global.fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({
      error: "Some data may already have moved. Inspect both accounts.", retry_safe: false,
    }, false));
    submit();
    await settle();
    expect(fields.disabled).toBe(true);
    expect(status.textContent).toContain("Inspect both accounts");
    submit();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the connection is lost after merge submission", async function () {
    global.fetch.mockResolvedValueOnce(response(preview)).mockRejectedValueOnce(new Error("connection lost"));
    submit();
    await settle();
    expect(status.textContent).toContain("result could not be confirmed");
    expect(status.textContent).toContain("inspect both accounts");
    expect(fields.disabled).toBe(true);
    submit();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("allows recovery from a failed preview without claiming a merge started", async function () {
    global.fetch.mockRejectedValue(new Error("session expired"));
    submit();
    await settle();
    expect(status.textContent).toContain("staff session");
    expect(fields.disabled).toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("labels the button for each outcome", async function () {
    const button = document.getElementById("merge-accounts-submit");
    window.confirm.mockReturnValue(false);
    global.fetch.mockResolvedValue(response(preview));
    submit();
    await settle();
    expect(button.textContent).toBe("Review merge");

    // Each attempt clears the password on purpose, so type it again.
    form.elements.password.value = "admin-password";
    window.confirm.mockReturnValue(true);
    global.fetch.mockReset();
    global.fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({
      error: "Some data may already have moved.", retry_safe: false,
    }, false));
    submit();
    await settle();
    expect(button.textContent).toBe("Check accounts before retrying");
  });

  it("labels the button after a successful merge", async function () {
    const button = document.getElementById("merge-accounts-submit");
    global.fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({success: "Accounts merged."}));
    submit();
    await settle();
    expect(button.textContent).toBe("Merged");
  });
});
