/* This admin form deliberately uses browser APIs, without React or jQuery. */
(function () {
  "use strict";

  const form = document.getElementById("merge-accounts-form");
  if (!form) return;

  const fields = document.getElementById("merge-accounts-fields");
  const submit = document.getElementById("merge-accounts-submit");
  const status = document.getElementById("merge-accounts-status");

  // The form is always in exactly one of these states.
  const State = Object.freeze({
    READY: Symbol("ready"),     // The staff member can fill in the form and submit.
    WORKING: Symbol("working"), // A request is running. Ignore extra submits.
    LOCKED: Symbol("locked"),   // A merge may have started. Never allow a second attempt.
    MERGED: Symbol("merged"),   // The merge finished. Nothing more to do.
  });
  const BUTTON_LABELS = new Map([
    [State.READY, "Review merge"],
    [State.LOCKED, "Check accounts before retrying"],
    [State.MERGED, "Merged"],
  ]);
  let state = State.READY;
  submit.disabled = false;

  function showMessages(messages) {
    // textContent, not innerHTML: account names and server messages are shown
    // as plain text, so they can never run as HTML.
    const paragraphs = messages.map((message) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = message;
      return paragraph;
    });
    status.textContent = "";
    paragraphs.forEach((paragraph) => status.appendChild(paragraph));
  }

  function labelFor(fieldName) {
    const input = form.elements[fieldName];
    const label = input && input.labels && input.labels[0];
    return label ? label.textContent.trim() + " " : "";
  }

  // Turn Django's {field: [{message}]} errors into "Field label message" lines.
  function errorsFrom(payload) {
    const fieldErrors = Object.entries(payload.errors || {}).flatMap(([fieldName, errors]) =>
      errors.map((error) => labelFor(fieldName) + error.message));
    return fieldErrors.length ? fieldErrors : [payload.error || "The request could not be completed."];
  }

  async function post(data, action) {
    data.set("action", action);
    const response = await fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      headers: {"Accept": "application/json"},
      body: data, // Includes Django's CSRF token from the form.
    });
    return {response: response, payload: await response.json()};
  }

  function describe(account) {
    const name = account.name ? account.name + " — " : "";
    return name + account.email + " (ID " + account.id + ")";
  }

  function confirmMerge(source, destination) {
    return window.confirm("Delete source account:\n" + describe(source) +
      "\n\nMerge its content into:\n" + describe(destination) +
      "\n\nOnly destination logins will remain, and its staff/admin access will be removed." +
      "\n\nThis cannot be undone. Merge these accounts?");
  }

  // Runs the preview and then the merge. Returns the state the form should end in.
  async function reviewAndMerge(data) {
    const preview = await post(data, "preview");
    if (!preview.response.ok) {
      showMessages(errorsFrom(preview.payload));
      return State.READY;
    }
    const {source, destination} = preview.payload;
    if (!confirmMerge(source, destination)) {
      showMessages(["Merge canceled. No accounts were changed."]);
      return State.READY;
    }

    // Send the numeric IDs the staff member just reviewed, not the typed emails.
    // If an email address changed in between, the email could now find a different user.
    data.set("source", source.id);
    data.set("destination", destination.id);
    state = State.LOCKED; // From here on, a failure might mean data has already moved.
    showMessages(["Merging accounts… Keep this page open and do not submit again."]);
    submit.textContent = "Merging…";

    const result = await post(data, "merge");
    if (!result.response.ok) {
      showMessages(errorsFrom(result.payload));
      // Only unlock when the server says nothing changed (retry_safe). A timeout
      // or a partial merge must not let the staff member try again by accident.
      return result.payload.retry_safe === true ? State.READY : State.LOCKED;
    }
    showMessages([result.payload.success].concat(result.payload.warnings || []));
    return State.MERGED;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (state !== State.READY || !form.reportValidity()) return;

    // Read the values BEFORE disabling the fieldset: the browser leaves disabled
    // fields out of FormData. Nothing is saved in browser storage.
    const data = new FormData(form);
    state = State.WORKING;
    fields.disabled = true;
    showMessages(["Reviewing accounts…"]);
    submit.textContent = "Reviewing…";

    let finalState;
    try {
      finalState = await reviewAndMerge(data);
    } catch (error) {
      // The network failed. If the merge request was already sent, we can't tell
      // whether it ran, so stay locked.
      const mergeWasSent = state === State.LOCKED;
      showMessages([mergeWasSent
        ? "The merge result could not be confirmed. Some data may already have moved. Have a developer inspect both accounts before retrying."
        : "Accounts could not be reviewed. Check your connection and staff session, then reload this page."]);
      finalState = mergeWasSent ? State.LOCKED : State.READY;
    }

    state = finalState;
    form.elements.password.value = ""; // Make the staff member type it again next time.
    fields.disabled = state !== State.READY;
    submit.textContent = BUTTON_LABELS.get(state);
  });
}());
