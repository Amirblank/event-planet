// Session state and the sign-in / sign-up dialog.

import { api, handleUnauthorized, hasToken, setToken } from "./api.js";
import { clearErrors, html, icon, openModal, setBusy, showErrors, toast } from "./ui.js";

export const session = { user: null };

const listeners = new Set();
export const onSessionChange = (callback) => listeners.add(callback);
const emit = () => listeners.forEach((callback) => callback(session.user));

handleUnauthorized(() => {
  if (!session.user) return;
  session.user = null;
  emit();
  toast("Your session ended. Sign in again.", "error");
});

export async function restoreSession() {
  if (!hasToken()) return;
  try {
    session.user = await api.get("/auth/me/");
  } catch (error) {
    session.user = null;
  }
}

export async function signOut() {
  await api.post("/auth/logout/").catch(() => {});
  setToken(null);
  session.user = null;
  emit();
  toast("Signed out.");
}

const ROLES = [
  ["participant", "ticket", "Participant", "Register for events and leave feedback."],
  ["organizer", "megaphone", "Organizer", "Create events and publish results."],
];

function formBody(mode, role) {
  const signingUp = mode === "register";
  return html`
    <div class="segmented segmented--full" role="tablist" aria-label="Account">
      <button type="button" role="tab" data-mode="login" aria-selected="${String(!signingUp)}">Sign in</button>
      <button type="button" role="tab" data-mode="register" aria-selected="${String(signingUp)}">Create account</button>
    </div>
    <form class="form" data-mode="${mode}">
      <div class="form__grid">
        ${signingUp
          ? html`
              <fieldset class="field field--full role-picker">
                <legend>Account type</legend>
                ${ROLES.map(
                  ([value, glyph, label, text]) => html`
                    <label class="role-option">
                      <input type="radio" name="role" value="${value}" ${value === role ? "checked" : ""}>
                      <span class="role-option__body">
                        ${icon(glyph)}
                        <strong>${label}</strong>
                        <small>${text}</small>
                      </span>
                    </label>`,
                )}
                <p class="field__error" data-error-for="role" hidden></p>
              </fieldset>`
          : ""}
        <div class="field field--full">
          <label for="auth-username">Username</label>
          <input id="auth-username" name="username" autocomplete="username" required maxlength="150">
          <p class="field__error" data-error-for="username" hidden></p>
        </div>
        ${signingUp
          ? html`
              <div class="field field--full">
                <label for="auth-email">Email</label>
                <input id="auth-email" name="email" type="email" autocomplete="email" required>
                <p class="field__error" data-error-for="email" hidden></p>
              </div>`
          : ""}
        <div class="field field--full">
          <label for="auth-password">Password</label>
          <input id="auth-password" name="password" type="password" required
            autocomplete="${signingUp ? "new-password" : "current-password"}">
          ${signingUp ? html`<p class="field__help">At least 8 characters, not only numbers.</p>` : ""}
          <p class="field__error" data-error-for="password" hidden></p>
        </div>
      </div>
      <p class="form__error" data-form-error role="alert" hidden></p>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary btn--block">${signingUp ? "Create account" : "Sign in"}</button>
      </div>
    </form>`;
}

export function openAuth({ mode = "login", role = "participant" } = {}) {
  const modal = openModal({ title: "Your account", body: "" });
  const body = modal.dialog.querySelector(".modal__body");

  const draw = (nextMode) => {
    body.innerHTML = formBody(nextMode, role);
    body.querySelector('[name="username"]').focus();
  };
  draw(mode);

  body.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-mode][role=tab]");
    if (tab) draw(tab.dataset.mode);
  });

  body.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    clearErrors(form);
    const button = form.querySelector('[type="submit"]');
    const payload = Object.fromEntries(new FormData(form));
    setBusy(button, true);
    try {
      const result = await api.post(`/auth/${form.dataset.mode}/`, payload);
      setToken(result.token);
      session.user = result.user;
      modal.close();
      emit();
      toast(`Signed in as ${result.user.username}.`);
    } catch (error) {
      showErrors(form, error);
    } finally {
      setBusy(button, false);
    }
  });
  return modal;
}
