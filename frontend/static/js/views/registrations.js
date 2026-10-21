import { api, rows } from "../api.js";
import { emptyState, errorState, skeletonRows, statusTag, typeLabel } from "../components.js";
import { delegate, formatRange, html, icon } from "../ui.js";

const NEXT_STEP = {
  published: "Your seat is confirmed.",
  closed: "Registration is closed. See you there.",
  finished: "Finished. Results and feedback are open.",
};

export async function registrationsView(page) {
  page.innerHTML = html`
    <header class="page-head">
      <h1>My registrations</h1>
      <p class="lead">Every event you hold a seat for.</p>
    </header>
    <div data-list>${skeletonRows(4)}</div>`;
  const list = page.querySelector("[data-list]");

  async function load() {
    list.innerHTML = skeletonRows(4);
    try {
      const registrations = rows(await api.get("/participant/registrations/?page_size=100"));
      if (!registrations.length) {
        list.innerHTML = emptyState({
          glyph: "ticket",
          title: "No registrations yet",
          text: "Pick a published event and take a seat.",
          action: html`<a class="btn btn--primary" href="#/">Browse events</a>`,
        });
        return;
      }
      list.innerHTML = html`
        <ul class="rows">
          ${registrations.map(
            ({ event }, index) => html`
              <li class="row glass" style="--i:${index}">
                <div class="row__main">
                  <div class="row__tags">${typeLabel(event.event_type)}${statusTag(event.status)}</div>
                  <a class="row__title" href="#/events/${event.id}">${event.title}</a>
                  <p class="muted">${formatRange(event.starts_at, event.ends_at)}</p>
                </div>
                <p class="row__note">${NEXT_STEP[event.status]}</p>
                <a class="btn" href="#/events/${event.id}">Open ${icon("arrow-right")}</a>
              </li>`,
          )}
        </ul>`;
    } catch (error) {
      list.innerHTML = errorState(error);
    }
  }

  delegate(page, "click", "[data-retry]", load);
  await load();
}
