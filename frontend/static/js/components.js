// Small presentational pieces reused across views.

import { formatDate, formatDateTime, formatRange, html, icon } from "./ui.js";

export const STATUSES = ["draft", "published", "closed", "finished"];

export const STATUS_LABEL = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  finished: "Finished",
};

export const STATUS_HINT = {
  draft: "Visible to the organizer only.",
  published: "Listed publicly. Registration is open.",
  closed: "Registration is closed. The seat list is final.",
  finished: "The event has ended. Results and feedback are open.",
};

export const TYPES = {
  tournament: ["Tournament", "trophy"],
  webinar: ["Webinar", "video-camera"],
  workshop: ["Workshop", "wrench"],
  sports: ["Sports event", "person-simple-run"],
  conference: ["Conference", "microphone-stage"],
  other: ["Other", "calendar-blank"],
};

export const TYPE_OPTIONS = Object.entries(TYPES).map(([value, [label]]) => [value, label]);

export const DATA_TYPES = [
  ["text", "Text"],
  ["integer", "Integer"],
  ["decimal", "Decimal"],
  ["boolean", "Yes / no"],
  ["date", "Date"],
  ["datetime", "Date and time"],
];

export const STAGE_ROLES = [
  ["speaker", "Speaker"],
  ["judge", "Judge"],
  ["coach", "Coach"],
  ["moderator", "Moderator"],
  ["referee", "Referee"],
  ["host", "Host"],
];

export const statusTag = (status) => html`<span class="tag tag--${status}">${STATUS_LABEL[status]}</span>`;

export function typeLabel(type) {
  const [label, glyph] = TYPES[type] || TYPES.other;
  return html`<span class="type">${icon(glyph)}${label}</span>`;
}

export function seatsText(event) {
  if (event.capacity === null) return `${event.registered_count} registered`;
  if (event.status === "published") {
    if (event.seats_left === 0) return "Full";
    return `${event.seats_left} of ${event.capacity} seats left`;
  }
  return `${event.registered_count} of ${event.capacity} seats taken`;
}

export function attributeValue(item) {
  if (item.data_type === "boolean") return item.value ? "Yes" : "No";
  if (item.data_type === "date") return formatDate(`${item.value}T00:00:00`);
  if (item.data_type === "datetime") return formatDateTime(item.value);
  return String(item.value);
}

export function eventCard(event, index = 0) {
  const featured = index === 0;
  return html`
    <a class="card glass event-card${featured ? " event-card--featured" : ""}" href="#/events/${event.id}"
       style="--i:${index}">
      <div class="event-card__top">${typeLabel(event.event_type)}${statusTag(event.status)}</div>
      <h3 class="event-card__title">${event.title}</h3>
      ${featured && event.description ? html`<p class="event-card__text">${event.description}</p>` : ""}
      <ul class="meta">
        <li>${icon("calendar-blank")}<span>${formatRange(event.starts_at, event.ends_at)}</span></li>
        ${event.location ? html`<li>${icon("map-pin")}<span>${event.location}</span></li>` : ""}
      </ul>
      <div class="event-card__foot">
        <span>${seatsText(event)}</span>
        <span class="event-card__go">${icon("arrow-right")}</span>
      </div>
    </a>`;
}

export function skeletonCards(count = 5) {
  return Array.from(
    { length: count },
    (_, index) => html`
      <div class="card glass event-card skeleton${index === 0 ? " event-card--featured" : ""}" aria-hidden="true">
        <span class="skeleton__line skeleton__line--short"></span>
        <span class="skeleton__line skeleton__line--title"></span>
        <span class="skeleton__line"></span>
        <span class="skeleton__line skeleton__line--mid"></span>
      </div>`,
  );
}

export function skeletonRows(count = 3) {
  return html`<div class="skeleton-rows" aria-hidden="true">
    ${Array.from({ length: count }, () => html`<span class="skeleton__line skeleton__line--row"></span>`)}
  </div>`;
}

export function emptyState({ glyph = "binoculars", title, text, action }) {
  return html`
    <div class="state">
      <span class="state__icon">${icon(glyph)}</span>
      <h3>${title}</h3>
      ${text ? html`<p>${text}</p>` : ""}
      ${action || ""}
    </div>`;
}

export function errorState(error, retryLabel = "Try again") {
  return html`
    <div class="state state--error" role="alert">
      <span class="state__icon">${icon("warning-circle")}</span>
      <h3>${error.status === 404 ? "Not found" : "Could not load this"}</h3>
      <p>${error.message}</p>
      ${error.status === 404
        ? html`<a class="btn" href="#/">Back to events</a>`
        : html`<button type="button" class="btn" data-retry>${retryLabel}</button>`}
    </div>`;
}
