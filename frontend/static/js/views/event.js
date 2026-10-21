import { api } from "../api.js";
import { openAuth, session } from "../auth.js";
import { attributeValue, errorState, seatsText, skeletonRows, statusTag, typeLabel } from "../components.js";
import {
  clearErrors,
  confirmDialog,
  delegate,
  formatRange,
  formatRangeLines,
  html,
  icon,
  observeReveals,
  setBusy,
  showErrors,
  toast,
} from "../ui.js";

function registrationPanel(event, user) {
  const viewer = event.viewer;
  const full = event.seats_left === 0;
  let body;

  if (event.status === "published") {
    if (!user) {
      body = html`
        <p>Registration is open. Sign in with a participant account to take a seat.</p>
        <button type="button" class="btn btn--primary btn--block" data-sign-in>Sign in to register</button>`;
    } else if (user.role !== "participant") {
      body = html`<p>Organizer accounts manage events and cannot register for them.</p>`;
    } else if (viewer?.is_registered) {
      body = html`
        <p class="panel__ok">${icon("seal-check")} You have a seat.</p>
        <button type="button" class="btn btn--block" data-cancel>Cancel registration</button>`;
    } else if (full) {
      body = html`<p>Every seat is taken. A seat opens again if someone cancels.</p>`;
    } else {
      body = html`
        <p>Registration is open. Your seat is confirmed at once.</p>
        <span class="pulse"><button type="button" class="btn btn--primary btn--block" data-register>Register</button></span>`;
    }
  } else if (event.status === "closed") {
    body = viewer?.is_registered
      ? html`<p class="panel__ok">${icon("seal-check")} You have a seat.</p><p>Registration is closed. The seat list is final.</p>`
      : html`<p>Registration is closed. The seat list is final.</p>`;
  } else {
    body = html`<p>This event has finished. Results and feedback are below.</p>`;
  }

  return html`
    <aside class="panel glass" aria-label="Registration">
      <div class="panel__seats">
        <strong>${seatsText(event)}</strong>
        ${statusTag(event.status)}
      </div>
      ${body}
    </aside>`;
}

function stagesBlock(stages) {
  if (!stages.length) return "";
  return html`
    <section class="block" data-reveal>
      <h2>Schedule</h2>
      <ol class="timeline">
        ${stages.map(
          (stage) => html`
            <li class="timeline__item">
              <p class="timeline__time">
                ${formatRangeLines(stage.starts_at, stage.ends_at).map((line) => html`<span>${line}</span>`)}
              </p>
              <div class="timeline__body">
                <h3>${stage.name}</h3>
                ${stage.description ? html`<p>${stage.description}</p>` : ""}
                ${stage.location ? html`<p class="timeline__place">${icon("map-pin")}${stage.location}</p>` : ""}
                ${stage.roles.length
                  ? html`<ul class="chips">
                      ${stage.roles.map((role) => html`<li class="chip"><em>${role.role_label}</em>${role.name}</li>`)}
                    </ul>`
                  : ""}
              </div>
            </li>`,
        )}
      </ol>
    </section>`;
}

function attributesBlock(attributes) {
  if (!attributes.length) return "";
  return html`
    <section class="block" data-reveal>
      <h2>Details</h2>
      <dl class="facts">
        ${attributes.map(
          (item) => html`
            <div class="fact">
              <dt>${item.name}</dt>
              <dd>${attributeValue(item)}</dd>
            </div>`,
        )}
      </dl>
    </section>`;
}

function resultsBlock(event, results) {
  if (event.status !== "finished") return "";
  if (!results.length) {
    return html`
      <section class="block" data-reveal>
        <h2>Results</h2>
        <p class="muted">The organizer has not published results yet.</p>
      </section>`;
  }
  const groups = new Map();
  for (const result of results) {
    const key = result.stage_name || "Overall";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  return html`
    <section class="block" data-reveal>
      <h2>Results</h2>
      ${[...groups].map(
        ([name, items]) => html`
          <div class="results">
            <h3>${name}</h3>
            <ol class="results__list">
              ${items.map(
                (result) => html`
                  <li>
                    <span class="results__position">${result.position ?? ""}</span>
                    <span class="results__title">${result.title}${result.notes ? html`<small>${result.notes}</small>` : ""}</span>
                    <span class="results__score">${result.score !== null ? Number(result.score) : ""}</span>
                  </li>`,
              )}
            </ol>
          </div>`,
      )}
    </section>`;
}

function feedbackBlock(event, user) {
  if (event.status !== "finished") return "";
  const summary = event.feedback_summary;
  const viewer = event.viewer;
  let body;
  if (viewer?.has_feedback) {
    body = html`<p class="panel__ok">${icon("seal-check")} Your feedback is recorded.</p>`;
  } else if (viewer?.is_registered) {
    body = html`
      <form class="form feedback-form" data-feedback>
        <fieldset class="field">
          <legend>Your rating</legend>
          <div class="rating">
            ${[1, 2, 3, 4, 5].map(
              (score) => html`
                <label>
                  <input type="radio" name="rating" value="${score}" required>
                  <span>${score}</span>
                </label>`,
            )}
          </div>
          <p class="field__help">1 is poor, 5 is excellent.</p>
          <p class="field__error" data-error-for="rating" hidden></p>
        </fieldset>
        <div class="field">
          <label for="feedback-comment">Comment <span class="field__optional">optional</span></label>
          <textarea id="feedback-comment" name="comment" rows="3" maxlength="2000"></textarea>
          <p class="field__error" data-error-for="comment" hidden></p>
        </div>
        <p class="form__error" data-form-error role="alert" hidden></p>
        <button type="submit" class="btn btn--primary">Send feedback</button>
      </form>`;
  } else if (!user) {
    body = html`<p class="muted">Participants who attended can sign in to leave feedback.</p>`;
  } else {
    body = html`<p class="muted">Only registered participants can leave feedback.</p>`;
  }
  return html`
    <section class="block" data-reveal>
      <h2>Feedback</h2>
      <p class="feedback-summary">
        ${summary.count
          ? html`<strong>${summary.average_rating.toFixed(1)}</strong> out of 5 from ${summary.count}
              ${summary.count === 1 ? "participant" : "participants"}`
          : "No feedback yet."}
      </p>
      ${body}
    </section>`;
}

export async function eventView(page, { params }) {
  const id = params[0];
  let event;
  let results = [];

  async function load() {
    page.innerHTML = html`<div class="detail"><div class="detail__main">${skeletonRows(6)}</div></div>`;
    try {
      event = await api.get(`/public/events/${id}/`);
      if (event.status === "finished") results = await api.get(`/public/events/${id}/results/`);
      draw();
    } catch (error) {
      page.innerHTML = errorState(error);
    }
  }

  async function refresh() {
    event = await api.get(`/public/events/${id}/`);
    draw();
  }

  function draw() {
    document.title = `${event.title} | Event Planet`;
    page.innerHTML = html`
      <a class="back" href="#/">${icon("arrow-left")} All events</a>
      <header class="detail__head" data-reveal>
        <div class="detail__tags">${typeLabel(event.event_type)}</div>
        <h1>${event.title}</h1>
        <ul class="meta meta--large">
          <li>${icon("calendar-blank")}<span>${formatRange(event.starts_at, event.ends_at)}</span></li>
          ${event.location ? html`<li>${icon("map-pin")}<span>${event.location}</span></li>` : ""}
          <li>${icon("user-circle")}<span>Organized by ${event.organizer.name}</span></li>
        </ul>
      </header>
      <div class="detail">
        <div class="detail__main">
          ${event.description
            ? html`<section class="block" data-reveal><h2>About</h2><p class="prose">${event.description}</p></section>`
            : ""}
          ${attributesBlock(event.attributes)}
          ${stagesBlock(event.stages)}
          ${resultsBlock(event, results)}
          ${feedbackBlock(event, session.user)}
        </div>
        ${registrationPanel(event, session.user)}
      </div>`;
    observeReveals(page);
  }

  async function act(button, work, message) {
    setBusy(button, true);
    try {
      await work();
      toast(message);
    } catch (error) {
      toast(error.message, "error");
    }
    // Reload either way: a refused action usually means the state changed underneath.
    await refresh().catch(() => {});
  }

  delegate(page, "click", "[data-retry]", load);
  delegate(page, "click", "[data-sign-in]", () => openAuth());
  delegate(page, "click", "[data-register]", (clickEvent, button) =>
    act(button, () => api.post(`/participant/events/${id}/registration/`), "You are registered."),
  );
  delegate(page, "click", "[data-cancel]", async (clickEvent, button) => {
    const confirmed = await confirmDialog({
      title: "Cancel registration",
      message: "Your seat goes back to the pool. You can register again while seats remain.",
      confirmLabel: "Cancel my seat",
    });
    if (confirmed) act(button, () => api.delete(`/participant/events/${id}/registration/`), "Registration cancelled.");
  });
  delegate(page, "submit", "[data-feedback]", async (submitEvent, form) => {
    submitEvent.preventDefault();
    clearErrors(form);
    const button = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    setBusy(button, true);
    try {
      await api.post(`/participant/events/${id}/feedback/`, {
        rating: Number(data.get("rating")),
        comment: data.get("comment").trim(),
      });
      toast("Thanks. Your feedback is recorded.");
      await refresh();
    } catch (error) {
      setBusy(button, false);
      showErrors(form, error);
    }
  });

  await load();
}
