import { api, query } from "../api.js";
import { openAuth, session } from "../auth.js";
import {
  emptyState,
  errorState,
  eventCard,
  skeletonCards,
  STATUS_HINT,
  STATUS_LABEL,
  STATUSES,
  TYPE_OPTIONS,
} from "../components.js";
import { delegate, html, icon, observeReveals, toast } from "../ui.js";

const FILTERS = [
  ["published", "Published"],
  ["closed", "Closed"],
  ["finished", "Finished"],
  ["", "All"],
];

export function homeView(page) {
  const state = { status: "published", event_type: "", search: "", page: 1 };

  page.innerHTML = html`
    <section class="hero">
      <div class="hero__copy" data-reveal>
        <h1>Plan the event. Fill the room.</h1>
        <p class="lead">Tournaments, webinars, workshops and sports days. Register in one click, follow every stage, read the results.</p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="#events" data-scroll>Browse events ${icon("arrow-right")}</a>
          <button type="button" class="btn" data-host>Host an event</button>
        </div>
      </div>
    </section>

    <section class="section" id="events" tabindex="-1">
      <header class="section__head" data-reveal>
        <h2>Events</h2>
        <div class="filters">
          <div class="segmented" role="group" aria-label="Lifecycle state">
            ${FILTERS.map(
              ([value, label]) =>
                html`<button type="button" data-status="${value}" aria-pressed="${String(value === state.status)}">${label}</button>`,
            )}
          </div>
          <div class="filters__fields">
            <label class="visually-hidden" for="filter-type">Event type</label>
            <select id="filter-type" data-type>
              <option value="">All types</option>
              ${TYPE_OPTIONS.map(([value, label]) => html`<option value="${value}">${label}</option>`)}
            </select>
            <label class="visually-hidden" for="filter-search">Search events</label>
            <div class="search">
              ${icon("magnifying-glass")}
              <input id="filter-search" type="search" placeholder="Search title or place" data-search>
            </div>
          </div>
        </div>
      </header>
      <div class="event-grid" data-grid aria-live="polite"></div>
      <div class="more" data-more hidden>
        <button type="button" class="btn" data-load-more>Show more events</button>
      </div>
    </section>

    <section class="section lifecycle">
      <div class="lifecycle__head" data-reveal>
        <h2>One path from idea to results</h2>
        <p class="lead">Every event moves forward through four states. The state decides what participants can do.</p>
      </div>
      <ol class="track" data-reveal>
        ${STATUSES.map(
          (status, index) => html`
            <li class="track__step" style="--i:${index}">
              <span class="track__node tag tag--${status}">${STATUS_LABEL[status]}</span>
              <p>${STATUS_HINT[status]}</p>
            </li>`,
        )}
      </ol>
    </section>`;

  const grid = page.querySelector("[data-grid]");
  const more = page.querySelector("[data-more]");
  let request = 0;

  async function load({ append = false } = {}) {
    const current = ++request;
    if (!append) {
      state.page = 1;
      grid.innerHTML = html`${skeletonCards(5)}`;
      more.hidden = true;
    }
    try {
      const data = await api.get(`/public/events/${query({ ...state, page_size: 11 })}`);
      if (current !== request) return; // a newer filter change already took over
      const offset = append ? grid.children.length : 0;
      const cards = html`${data.results.map((event, index) => eventCard(event, offset + index))}`;
      if (append) grid.insertAdjacentHTML("beforeend", cards);
      else if (data.results.length) grid.innerHTML = cards;
      else {
        const filtered = state.search || state.event_type || state.status !== "published";
        grid.innerHTML = emptyState({
          title: filtered ? "No events match these filters" : "No published events yet",
          text: filtered
            ? "Try another state, type or search term."
            : "Organizers publish events here. Sign in as an organizer to add the first one.",
          action: filtered ? html`<button type="button" class="btn" data-reset>Clear filters</button>` : "",
        });
      }
      more.hidden = !data.next;
    } catch (error) {
      if (current !== request) return;
      grid.innerHTML = errorState(error);
    }
  }

  function syncControls() {
    page.querySelectorAll("[data-status]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.status === state.status));
    });
    page.querySelector("[data-type]").value = state.event_type;
    page.querySelector("[data-search]").value = state.search;
  }

  delegate(page, "click", "[data-status]", (event, button) => {
    state.status = button.dataset.status;
    syncControls();
    load();
  });
  page.querySelector("[data-type]").addEventListener("change", (event) => {
    state.event_type = event.target.value;
    load();
  });
  let typing;
  page.querySelector("[data-search]").addEventListener("input", (event) => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      state.search = event.target.value.trim();
      load();
    }, 280);
  });
  delegate(page, "click", "[data-reset]", () => {
    Object.assign(state, { status: "published", event_type: "", search: "" });
    syncControls();
    load();
  });
  delegate(page, "click", "[data-retry]", () => load());
  delegate(page, "click", "[data-load-more]", () => {
    state.page += 1;
    load({ append: true });
  });
  delegate(page, "click", "[data-scroll]", (event) => {
    event.preventDefault();
    const target = page.querySelector("#events");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  });
  delegate(page, "click", "[data-host]", () => {
    if (session.user?.role === "organizer") location.hash = "#/organizer";
    else if (session.user) toast("Hosting needs an organizer account. Sign out and create one.", "error");
    else openAuth({ mode: "register", role: "organizer" });
  });

  observeReveals(page);
  load();
}
