/* This admin form deliberately uses browser APIs, without React or jQuery. */
(function () {
  "use strict";

  const form = document.getElementById("merge-accounts-form");
  if (!form) return;

  const fields = document.getElementById("merge-accounts-fields");
  const submit = document.getElementById("merge-accounts-submit");
  const status = document.getElementById("merge-accounts-status");
  let busy = false;
  let locked = false;
  submit.disabled = false;

  function showMessages(messages) {
    status.textContent = "";
    messages.forEach(function (message) {
      const paragraph = document.createElement("p");
      // Account names and server messages are text, never trusted HTML.
      paragraph.textContent = message;
      status.appendChild(paragraph);
    });
  }

  function errorsFrom(payload) {
    const errors = [];
    Object.keys(payload.errors || {}).forEach(function (field) {
      const input = form.elements[field];
      const label = input && input.labels && input.labels[0];
      payload.errors[field].forEach(function (error) {
        errors.push((label ? label.textContent.trim() + " " : "") + error.message);
      });
    });
    return errors.length ? errors : [payload.error || "The request could not be completed."];
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

  function identity(account) {
    return (account.name ? account.name + " — " : "") + account.email + " (ID " + account.id + ")";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy || locked || !form.reportValidity()) return;
    busy = true;
    // Capture values before disabling the fieldset: disabled fields are excluded
    // from FormData. No password or account data is saved in browser storage.
    const data = new FormData(form);
    fields.disabled = true;
    let completed = false;
    showMessages(["Reviewing accounts…"]);
    submit.textContent = "Reviewing…";

    try {
      const preview = await post(data, "preview");
      if (!preview.response.ok) {
        showMessages(errorsFrom(preview.payload));
        return;
      }
      const source = preview.payload.source;
      const destination = preview.payload.destination;
      if (!window.confirm("Delete source account:\n" + identity(source) +
          "\n\nMerge its content into:\n" + identity(destination) +
          "\n\nOnly destination logins will remain, and its staff/admin access will be removed." +
          "\n\nThis cannot be undone. Merge these accounts?")) {
        showMessages(["Merge canceled. No accounts were changed."]);
        return;
      }

      // Pin the reviewed identities to numeric IDs. Re-resolving an email after
      // review could select a different user if an address changes in between.
      data.set("source", source.id);
      data.set("destination", destination.id);
      locked = true;
      showMessages(["Merging accounts… Keep this page open and do not submit again."]);
      submit.textContent = "Merging…";
      const result = await post(data, "merge");
      if (!result.response.ok) {
        // Only a server-confirmed validation failure is safe to correct and retry.
        // A timeout or partial merge must not silently enable a second attempt.
        locked = result.payload.retry_safe !== true;
        showMessages(errorsFrom(result.payload));
        return;
      }
      completed = true;
      showMessages([result.payload.success].concat(result.payload.warnings || []));
    } catch (error) {
      showMessages([locked
        ? "The merge result could not be confirmed. Some data may already have moved. Have a developer inspect both accounts before retrying."
        : "Accounts could not be reviewed. Check your connection and staff session, then reload this page."]);
    } finally {
      form.elements.password.value = "";
      fields.disabled = locked;
      submit.textContent = completed ? "Merged" : (locked ? "Check accounts before retrying" : "Review merge");
      busy = false;
    }
  });
}());
