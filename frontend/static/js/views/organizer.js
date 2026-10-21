import { api, rows } from "../api.js";
import { DATA_TYPES, emptyState, errorState, skeletonRows, statusTag, TYPE_OPTIONS, typeLabel } from "../components.js";
import { confirmDialog, delegate, formatRange, formModal, html, icon, toast } from "../ui.js";

export const EVENT_FIELDS = [
  { name: "title", label: "Title", required: true, maxlength: 200, full: true },
  { name: "event_type", label: "Type", type: "select", options: TYPE_OPTIONS, required: true },
  { name: "location", label: "Location", maxlength: 200, placeholder: "Venue or Online" },
  { name: "starts_at", label: "Starts", type: "datetime-local", required: true },
  { name: "ends_at", label: "Ends", type: "datetime-local", required: true },
  {
    name: "capacity",
    label: "Capacity",
    type: "number",
    min: 1,
    step: 1,
    help: "Seats for the whole event. Leave empty for unlimited.",
  },
  { name: "description", label: "Description", type: "textarea", full: true },
];

const DATA_TYPE_LABEL = Object.fromEntries(DATA_TYPES);

export async function organizerView(page) {
  let tab = "events";

  page.innerHTML = html`
    <header class="page-head page-head--split">
      <div>
        <h1>Organizer</h1>
        <p class="lead">Your events in every state, and the attribute library they share.</p>
      </div>
      <button type="button" class="btn btn--primary" data-new-event>${icon("plus")} New event</button>
    </header>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="events" aria-selected="true">Events</button>
      <button type="button" role="tab" data-tab="attributes" aria-selected="false">Attribute library</button>
    </div>
    <div class="tab-panel" data-panel></div>`;
  const panel = page.querySelector("[data-panel]");

  async function showEvents() {
    panel.innerHTML = skeletonRows(4);
    try {
      const events = rows(await api.get("/organizer/events/?page_size=100"));
      if (tab !== "events") return;
      if (!events.length) {
        panel.innerHTML = emptyState({
          glyph: "calendar-blank",
          title: "No events yet",
          text: "A new event starts as a draft. Only you can see it until you publish.",
          action: html`<button type="button" class="btn btn--primary" data-new-event>Create an event</button>`,
        });
        return;
      }
      panel.innerHTML = html`
        <ul class="rows">
          ${events.map(
            (event, index) => html`
              <li class="row glass" style="--i:${index}">
                <div class="row__main">
                  <div class="row__tags">${typeLabel(event.event_type)}${statusTag(event.status)}</div>
                  <a class="row__title" href="#/organizer/events/${event.id}">${event.title}</a>
                  <p class="muted">${formatRange(event.starts_at, event.ends_at)}</p>
                </div>
                <p class="row__note">
                  <strong>${event.registered_count}</strong>
                  ${event.capacity === null ? "registered" : `of ${event.capacity} seats`}
                </p>
                <a class="btn" href="#/organizer/events/${event.id}">Manage ${icon("arrow-right")}</a>
              </li>`,
          )}
        </ul>`;
    } catch (error) {
      panel.innerHTML = errorState(error);
    }
  }

  async function showAttributes() {
    panel.innerHTML = skeletonRows(4);
    try {
      const attributes = rows(await api.get("/organizer/attributes/?page_size=100"));
      if (tab !== "attributes") return;
      panel.innerHTML = html`
        <div class="panel-head">
          <p class="muted">Define an attribute once, then give it a typed value on any event. Definitions are shared between organizers.</p>
          <button type="button" class="btn" data-new-attribute>${icon("plus")} New attribute</button>
        </div>
        ${attributes.length
          ? html`<ul class="rows rows--compact">
              ${attributes.map(
                (attribute, index) => html`
                  <li class="row glass" style="--i:${index}">
                    <div class="row__main">
                      <span class="row__title">${attribute.name}</span>
                      ${attribute.description ? html`<p class="muted">${attribute.description}</p>` : ""}
                    </div>
                    <span class="tag tag--neutral">${DATA_TYPE_LABEL[attribute.data_type]}</span>
                    <p class="row__note">Used on ${attribute.usage_count} ${attribute.usage_count === 1 ? "event" : "events"}</p>
                    ${attribute.is_mine && attribute.usage_count === 0
                      ? html`<button type="button" class="icon-btn" data-delete-attribute="${attribute.id}"
                          aria-label="Delete ${attribute.name}">${icon("trash")}</button>`
                      : html`<span class="icon-btn icon-btn--ghost" aria-hidden="true"></span>`}
                  </li>`,
              )}
            </ul>`
          : emptyState({
              glyph: "sliders-horizontal",
              title: "No attributes defined",
              text: "Examples: Prize pool as a decimal, Team size as an integer, Rated as yes or no.",
            })}`;
    } catch (error) {
      panel.innerHTML = errorState(error);
    }
  }

  const show = () => (tab === "events" ? showEvents() : showAttributes());

  delegate(page, "click", "[data-tab]", (event, button) => {
    tab = button.dataset.tab;
    page.querySelectorAll("[data-tab]").forEach((node) => node.setAttribute("aria-selected", String(node === button)));
    show();
  });
  delegate(page, "click", "[data-retry]", show);

  delegate(page, "click", "[data-new-event]", () => {
    formModal({
      title: "New event",
      intro: "The event is saved as a draft. Publish it from its management page.",
      fields: EVENT_FIELDS,
      values: { event_type: "workshop" },
      submitLabel: "Create draft",
      onSubmit: async (data) => {
        const created = await api.post("/organizer/events/", data);
        toast("Draft created.");
        location.hash = `#/organizer/events/${created.id}`;
      },
    });
  });

  delegate(page, "click", "[data-new-attribute]", () => {
    formModal({
      title: "New attribute",
      intro: "The data type is fixed once the attribute exists.",
      fields: [
        { name: "name", label: "Name", required: true, maxlength: 100, full: true, placeholder: "Prize pool (EUR)" },
        { name: "data_type", label: "Data type", type: "select", options: DATA_TYPES, required: true, full: true },
        { name: "description", label: "Description", maxlength: 255, full: true },
      ],
      submitLabel: "Create attribute",
      onSubmit: async (data) => {
        await api.post("/organizer/attributes/", data);
        toast("Attribute created.");
        showAttributes();
      },
    });
  });

  delegate(page, "click", "[data-delete-attribute]", async (event, button) => {
    const confirmed = await confirmDialog({
      title: "Delete attribute",
      message: "The definition is removed for every organizer. This cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      await api.delete(`/organizer/attributes/${button.dataset.deleteAttribute}/`);
      toast("Attribute deleted.");
    } catch (error) {
      toast(error.message, "error");
    }
    showAttributes();
  });

  await showEvents();
}
