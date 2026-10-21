// Rendering and interaction helpers shared by every view.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

class Raw {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

function render(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

// Tagged template that escapes every interpolation. Nested html`` results and
// arrays of them pass through untouched, so user data can never inject markup.
export function html(strings, ...values) {
  return new Raw(strings.reduce((out, part, index) => out + render(values[index - 1]) + part));
}

export const icon = (name) => new Raw(`<i class="ph-bold ph-${name}" aria-hidden="true"></i>`);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- formatting

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso) => dateFormat.format(new Date(iso));
export const formatTime = (iso) => timeFormat.format(new Date(iso));
export const formatDateTime = (iso) => `${formatDate(iso)}, ${formatTime(iso)}`;

export function formatRange(startIso, endIso) {
  const sameDay = new Date(startIso).toDateString() === new Date(endIso).toDateString();
  if (sameDay) return `${formatDate(startIso)}, ${formatTime(startIso)} to ${formatTime(endIso)}`;
  return `${formatDateTime(startIso)} to ${formatDateTime(endIso)}`;
}

// Two short lines for narrow columns: the day, then the hours (or start, then end).
export function formatRangeLines(startIso, endIso) {
  const sameDay = new Date(startIso).toDateString() === new Date(endIso).toDateString();
  if (sameDay) return [formatDate(startIso), `${formatTime(startIso)} to ${formatTime(endIso)}`];
  return [formatDateTime(startIso), `to ${formatDateTime(endIso)}`];
}

// <input type="datetime-local"> works in local time without an offset.
export function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

// -------------------------------------------------------------------- toasts

export function toast(message, kind = "info") {
  const host = document.querySelector(".toasts");
  const item = document.createElement("div");
  item.className = `toast glass toast--${kind}`;
  item.innerHTML = html`${icon(kind === "error" ? "warning-circle" : "check-circle")}<span>${message}</span>`;
  host.append(item);
  const remove = () => item.remove();
  setTimeout(() => {
    if (reducedMotion()) return remove();
    item.classList.add("is-leaving");
    item.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 500);
  }, 3800);
}

// -------------------------------------------------------------------- modals

export function openModal({ title, body, wide = false }) {
  const dialog = document.createElement("dialog");
  dialog.className = `modal glass${wide ? " modal--wide" : ""}`;
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = html`
    <header class="modal__head">
      <h2>${title}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
    </header>
    <div class="modal__body">${body}</div>`;
  document.body.append(dialog);
  dialog.showModal();

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const finish = () => {
      dialog.close();
      dialog.remove();
    };
    if (reducedMotion()) return finish();
    dialog.classList.add("is-closing");
    dialog.addEventListener("animationend", finish, { once: true });
    setTimeout(() => dialog.isConnected && finish(), 400);
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  // A press that starts inside the dialog and ends on the backdrop is a text
  // selection, not a dismissal, so only presses that start on the backdrop count.
  dialog.addEventListener("mousedown", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) close();
  });
  return { dialog, close };
}

export function confirmDialog({ title, message, confirmLabel = "Confirm" }) {
  return new Promise((resolve) => {
    const modal = openModal({
      title,
      body: html`
        <p class="modal__text">${message}</p>
        <div class="modal__actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="button" class="btn btn--primary" data-confirm>${confirmLabel}</button>
        </div>`,
    });
    let answer = false;
    modal.dialog.querySelector("[data-confirm]").addEventListener("click", () => {
      answer = true;
      modal.close();
    });
    modal.dialog.addEventListener("close", () => resolve(answer));
  });
}

// --------------------------------------------------------------------- forms

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.setAttribute("aria-busy", String(busy));
}

function fieldHtml(field, values) {
  const value = values[field.name] ?? field.value ?? "";
  const id = `field-${field.name}`;
  const required = field.required ? new Raw(" required") : "";
  let control;
  if (field.type === "select") {
    control = html`<select id="${id}" name="${field.name}"${required}>
      ${field.options.map(
        ([optionValue, label]) =>
          html`<option value="${optionValue}"${String(optionValue) === String(value) ? new Raw(" selected") : ""}>${label}</option>`,
      )}
    </select>`;
  } else if (field.type === "textarea") {
    control = html`<textarea id="${id}" name="${field.name}" rows="${field.rows || 4}"${required}>${value}</textarea>`;
  } else {
    const shown = field.type === "datetime-local" ? toLocalInput(value) : value;
    const extras = ["min", "max", "step", "maxlength", "minlength", "autocomplete", "placeholder"]
      .filter((name) => field[name] !== undefined)
      .map((name) => html` ${name}="${field[name]}"`);
    control = html`<input id="${id}" name="${field.name}" type="${field.type || "text"}" value="${shown}"${required}${extras}>`;
  }
  return html`
    <div class="field${field.full ? " field--full" : ""}">
      <label for="${id}">${field.label}${field.required ? "" : html` <span class="field__optional">optional</span>`}</label>
      ${control}
      ${field.help ? html`<p class="field__help">${field.help}</p>` : ""}
      <p class="field__error" data-error-for="${field.name}" hidden></p>
    </div>`;
}

function readForm(form, fields) {
  const data = {};
  for (const field of fields) {
    const input = form.elements[field.name];
    const rawValue = input.value.trim();
    if (field.type === "number") data[field.name] = rawValue === "" ? null : Number(rawValue);
    else if (field.type === "datetime-local") data[field.name] = rawValue ? new Date(rawValue).toISOString() : null;
    else if (field.nullable) data[field.name] = rawValue === "" ? null : rawValue;
    else data[field.name] = rawValue;
  }
  return data;
}

export function clearErrors(form) {
  form.querySelectorAll("[data-error-for], [data-form-error]").forEach((node) => {
    node.hidden = true;
    node.textContent = "";
  });
  form.querySelectorAll("[aria-invalid]").forEach((node) => node.removeAttribute("aria-invalid"));
}

// Maps a DRF error body onto the form: field errors go under their input,
// everything else into the form-level message.
export function showErrors(form, error) {
  const data = error && error.data;
  const general = [];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [name, messages] of Object.entries(data)) {
      const text = [].concat(messages).join(" ");
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      if (slot) {
        slot.textContent = text;
        slot.hidden = false;
        form.elements[name]?.setAttribute("aria-invalid", "true");
      } else if (name !== "code") {
        general.push(text);
      }
    }
  } else {
    general.push(error?.message || "Something went wrong. Try again.");
  }
  const banner = form.querySelector("[data-form-error]");
  if (banner && general.length) {
    banner.textContent = general.join(" ");
    banner.hidden = false;
  }
  form.querySelector('[aria-invalid="true"]')?.focus();
}

export function formModal({ title, intro, fields, values = {}, submitLabel = "Save", onSubmit }) {
  const modal = openModal({
    title,
    body: html`
      <form class="form">
        ${intro ? html`<p class="modal__text">${intro}</p>` : ""}
        <div class="form__grid">${fields.map((field) => fieldHtml(field, values))}</div>
        <p class="form__error" data-form-error role="alert" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn--primary">${submitLabel}</button>
        </div>
      </form>`,
  });
  const form = modal.dialog.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(form);
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      await onSubmit(readForm(form, fields));
      modal.close();
    } catch (error) {
      showErrors(form, error);
    } finally {
      setBusy(button, false);
    }
  });
  return modal;
}

// -------------------------------------------------------------------- motion

// Fades blocks in as they enter the viewport. Each [data-reveal] group staggers
// its children through the --i custom property.
export function observeReveals(root) {
  const targets = root.querySelectorAll("[data-reveal]:not(.is-in)");
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    targets.forEach((node) => node.classList.add("is-in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  targets.forEach((node) => observer.observe(node));
}

export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}
