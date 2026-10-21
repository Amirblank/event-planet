import { api, rows } from "../api.js";
import {
  attributeValue,
  DATA_TYPES,
  emptyState,
  errorState,
  skeletonRows,
  STAGE_ROLES,
  STATUS_HINT,
  STATUS_LABEL,
  STATUSES,
  statusTag,
  typeLabel,
} from "../components.js";
import {
  confirmDialog,
  delegate,
  formatDateTime,
  formatRange,
  formModal,
  html,
  icon,
  setBusy,
  toast,
} from "../ui.js";
import { EVENT_FIELDS } from "./organizer.js";

const TABS = [
  ["details", "Details"],
  ["stages", "Stages"],
  ["attributes", "Attributes"],
  ["participants", "Participants"],
  ["results", "Results"],
  ["feedback", "Feedback"],
];

const DATA_TYPE_LABEL = Object.fromEntries(DATA_TYPES);

const NEXT_ACTION = {
  published: ["Publish", "The event becomes public and registration opens. It cannot return to draft."],
  closed: ["Close registration", "No one can register or cancel after this. It cannot be reopened."],
  finished: ["Mark as finished", "Results and feedback open. The event becomes read-only."],
};

// Input control that matches an attribute's data type.
function valueField(attribute, current) {
  const base = { name: "value", label: `Value for ${attribute.name}`, required: true, full: true };
  switch (attribute.data_type) {
    case "integer":
      return { ...base, type: "number", step: 1, value: current };
    case "decimal":
      return { ...base, type: "text", placeholder: "For example 1999.90", value: current };
    case "boolean":
      return { ...base, type: "select", options: [["true", "Yes"], ["false", "No"]], value: String(current ?? true) };
    case "date":
      return { ...base, type: "date", value: current };
    case "datetime":
      return { ...base, type: "datetime-local", value: current };
    default:
      return { ...base, type: "textarea", rows: 3, value: current };
  }
}

const typedValue = (attribute, value) => (attribute.data_type === "boolean" ? value === "true" : value);

export async function manageView(page, { params, reload }) {
  const id = params[0];
  const base = `/organizer/events/${id}`;
  let event;
  let tab = "details";

  page.innerHTML = skeletonRows(6);
  try {
    event = await api.get(`${base}/`);
  } catch (error) {
    page.innerHTML = errorState(error);
    delegate(page, "click", "[data-retry]", reload);
    return;
  }

  page.innerHTML = html`
    <a class="back" href="#/organizer">${icon("arrow-left")} All my events</a>
    <header class="page-head" data-head></header>
    <section class="stepper glass" aria-label="Lifecycle" data-stepper></section>
    <div class="tabs" role="tablist">
      ${TABS.map(
        ([value, label]) =>
          html`<button type="button" role="tab" data-tab="${value}" aria-selected="${String(value === tab)}">${label}</button>`,
      )}
    </div>
    <div class="tab-panel" data-panel></div>`;
  const head = page.querySelector("[data-head]");
  const stepper = page.querySelector("[data-stepper]");
  const panel = page.querySelector("[data-panel]");
  const readOnly = () => event.status === "finished";

  function drawHead() {
    document.title = `${event.title} | Event Planet`;
    head.innerHTML = html`
      <div class="row__tags">${typeLabel(event.event_type)}</div>
      <h1>${event.title}</h1>
      <p class="lead">${formatRange(event.starts_at, event.ends_at)}${event.location ? `, ${event.location}` : ""}</p>`;
  }

  // The stepper is built once and then updated in place, so the progress line
  // animates from the old state to the new one instead of jumping.
  function drawStepper(initial = false) {
    const position = STATUSES.indexOf(event.status);
    if (initial) {
      stepper.innerHTML = html`
        <div class="stepper__rail">
          <span class="stepper__line" aria-hidden="true"><span></span></span>
          <ol class="stepper__track">
            ${STATUSES.map((status) => html`<li data-step="${status}"><span class="stepper__dot"></span>${STATUS_LABEL[status]}</li>`)}
          </ol>
        </div>
        <div class="stepper__foot">
          <p data-step-hint></p>
          <div data-step-action></div>
        </div>`;
    }
    stepper.style.setProperty("--progress", position / (STATUSES.length - 1));
    stepper.querySelectorAll("[data-step]").forEach((node, index) => {
      node.classList.toggle("is-done", index < position);
      node.classList.toggle("is-current", index === position);
      if (index === position) node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    });
    stepper.querySelector("[data-step-hint]").textContent = STATUS_HINT[event.status];
    stepper.querySelector("[data-step-action]").innerHTML = event.next_status
      ? html`<button type="button" class="btn btn--primary" data-transition="${event.next_status}">
          ${NEXT_ACTION[event.next_status][0]} ${icon("arrow-right")}
        </button>`
      : html`<span class="panel__ok">${icon("flag-checkered")} Lifecycle complete</span>`;
  }

  // ---------------------------------------------------------------- panels

  // Each panel returns its markup. Rows the action handlers need later are kept in the cache.
  const cache = {};
  const panels = {
    async details() {
      const viewLink = event.status === "draft" ? "" : html`<a class="btn" href="#/events/${id}">View public page</a>`;
      return html`
        <div class="panel-head">
          <p class="muted">${readOnly() ? "Finished events are read-only." : "Editable until the event is finished."}</p>
          <div class="panel-head__actions">
            ${viewLink}
            ${readOnly() ? "" : html`<button type="button" class="btn" data-edit-event>${icon("pencil-simple")} Edit</button>`}
            ${event.status === "draft"
              ? html`<button type="button" class="btn" data-delete-event>${icon("trash")} Delete draft</button>`
              : ""}
          </div>
        </div>
        <dl class="facts">
          <div class="fact"><dt>State</dt><dd>${statusTag(event.status)}</dd></div>
          <div class="fact"><dt>Registered</dt><dd>${event.registered_count}</dd></div>
          <div class="fact"><dt>Capacity</dt><dd>${event.capacity ?? "Unlimited"}</dd></div>
          <div class="fact"><dt>Stages</dt><dd>${event.stage_count}</dd></div>
          <div class="fact fact--wide"><dt>Description</dt><dd class="prose">${event.description || "No description yet."}</dd></div>
        </dl>`;
    },

    async stages() {
      const stages = await api.get(`${base}/stages/`);
      cache.stages = stages;
      return html`
        <div class="panel-head">
          <p class="muted">Sessions, rounds or parts. Each stage has its own time range and its own people. Registration covers the whole event.</p>
          ${readOnly() ? "" : html`<button type="button" class="btn" data-new-stage>${icon("plus")} Add stage</button>`}
        </div>
        ${stages.length
          ? html`<ul class="rows">
              ${stages.map(
                (stage, index) => html`
                  <li class="row row--stack glass" style="--i:${index}">
                    <div class="row__line">
                      <div class="row__main">
                        <span class="row__title">${stage.order}. ${stage.name}</span>
                        <p class="muted">${formatRange(stage.starts_at, stage.ends_at)}${stage.location ? `, ${stage.location}` : ""}</p>
                        ${stage.description ? html`<p>${stage.description}</p>` : ""}
                      </div>
                      ${readOnly()
                        ? ""
                        : html`<div class="row__actions">
                            <button type="button" class="icon-btn" data-edit-stage="${stage.id}" aria-label="Edit ${stage.name}">${icon("pencil-simple")}</button>
                            <button type="button" class="icon-btn" data-delete-stage="${stage.id}" aria-label="Delete ${stage.name}">${icon("trash")}</button>
                          </div>`}
                    </div>
                    <ul class="chips">
                      ${stage.roles.map(
                        (role) => html`
                          <li class="chip">
                            <em>${role.role_label}</em>${role.name}
                            ${readOnly()
                              ? ""
                              : html`<button type="button" class="chip__remove" data-delete-role="${stage.id}:${role.id}"
                                  aria-label="Remove ${role.name}">${icon("x")}</button>`}
                          </li>`,
                      )}
                      ${readOnly()
                        ? ""
                        : html`<li><button type="button" class="chip chip--add" data-new-role="${stage.id}">${icon("plus")} Add person</button></li>`}
                    </ul>
                  </li>`,
              )}
            </ul>`
          : emptyState({
              glyph: "stack",
              title: "No stages yet",
              text: "Single-session events need none. Add stages for rounds, sessions or parts.",
            })}`;
    },

    async attributes() {
      const [values, library] = await Promise.all([
        api.get(`${base}/attributes/`),
        api.get("/organizer/attributes/?page_size=100").then(rows),
      ]);
      const used = new Set(values.map((item) => item.attribute.id));
      const available = library.filter((attribute) => !used.has(attribute.id));
      cache.library = library;
      cache.values = values;
      return html`
        <div class="panel-head">
          <p class="muted">Typed values for this event. Each value is checked against the attribute's data type on the server.</p>
          ${readOnly()
            ? ""
            : available.length
              ? html`<button type="button" class="btn" data-new-value>${icon("plus")} Add value</button>`
              : html`<a class="btn" href="#/organizer">Define attributes</a>`}
        </div>
        ${values.length
          ? html`<ul class="rows rows--compact">
              ${values.map(
                (item, index) => html`
                  <li class="row glass" style="--i:${index}">
                    <div class="row__main">
                      <span class="row__title">${item.attribute.name}</span>
                      <p class="muted">${DATA_TYPE_LABEL[item.attribute.data_type]}</p>
                    </div>
                    <p class="row__value">${attributeValue({ data_type: item.attribute.data_type, value: item.value })}</p>
                    ${readOnly()
                      ? ""
                      : html`<div class="row__actions">
                          <button type="button" class="icon-btn" data-edit-value="${item.id}" aria-label="Edit ${item.attribute.name}">${icon("pencil-simple")}</button>
                          <button type="button" class="icon-btn" data-delete-value="${item.id}" aria-label="Remove ${item.attribute.name}">${icon("trash")}</button>
                        </div>`}
                  </li>`,
              )}
            </ul>`
          : emptyState({
              glyph: "sliders-horizontal",
              title: "No attribute values",
              text: library.length
                ? "Pick an attribute from the shared library and give it a value."
                : "Define attributes in the library first, then set their values here.",
            })}`;
    },

    async participants() {
      const registrations = rows(await api.get(`${base}/participants/?page_size=100`));
      return registrations.length
        ? html`<ul class="rows rows--compact">
            ${registrations.map(
              ({ participant, created_at }, index) => html`
                <li class="row glass" style="--i:${index}">
                  <div class="row__main">
                    <span class="row__title">${participant.name}</span>
                    <p class="muted">${participant.email}</p>
                  </div>
                  <p class="row__note">Registered ${formatDateTime(created_at)}</p>
                </li>`,
            )}
          </ul>`
        : emptyState({
            glyph: "users-three",
            title: "No participants yet",
            text: event.status === "draft" ? "Publish the event to open registration." : "Nobody has registered.",
          });
    },

    async results() {
      if (!readOnly()) {
        return emptyState({
          glyph: "lock-simple",
          title: "Results open after the event is finished",
          text: `The event is ${STATUS_LABEL[event.status].toLowerCase()}. Move it to Finished to publish results.`,
        });
      }
      const [results, stages, registrations] = await Promise.all([
        api.get(`${base}/results/`),
        api.get(`${base}/stages/`),
        api.get(`${base}/participants/?page_size=100`).then(rows),
      ]);
      cache.stages = stages;
      cache.registrations = registrations;
      return html`
        <div class="panel-head">
          <p class="muted">Each line is public as soon as it is saved.</p>
          <button type="button" class="btn btn--primary" data-new-result>${icon("plus")} Publish result</button>
        </div>
        ${results.length
          ? html`<ul class="rows rows--compact">
              ${results.map(
                (result, index) => html`
                  <li class="row glass" style="--i:${index}">
                    <span class="results__position">${result.position ?? ""}</span>
                    <div class="row__main">
                      <span class="row__title">${result.title}</span>
                      <p class="muted">${result.stage_name || "Overall"}${result.notes ? `, ${result.notes}` : ""}</p>
                    </div>
                    <p class="row__value">${result.score !== null ? Number(result.score) : ""}</p>
                    <button type="button" class="icon-btn" data-delete-result="${result.id}" aria-label="Delete result for ${result.title}">${icon("trash")}</button>
                  </li>`,
              )}
            </ul>`
          : emptyState({ glyph: "ranking", title: "No results published", text: "Add the first line. It appears on the public page at once." })}`;
    },

    async feedback() {
      const items = rows(await api.get(`${base}/feedback/?page_size=100`));
      return items.length
        ? html`<ul class="rows rows--compact">
            ${items.map(
              (item, index) => html`
                <li class="row glass" style="--i:${index}">
                  <span class="results__position">${item.rating}</span>
                  <div class="row__main">
                    <span class="row__title">${item.participant}</span>
                    <p>${item.comment || "No comment."}</p>
                  </div>
                  <p class="row__note">${formatDateTime(item.created_at)}</p>
                </li>`,
            )}
          </ul>`
        : emptyState({
            glyph: "chat-circle-text",
            title: "No feedback yet",
            text: readOnly()
              ? "Registered participants can leave a rating from the public page."
              : "Feedback opens once the event is finished.",
          });
    },
  };

  async function showTab() {
    const current = tab;
    panel.innerHTML = skeletonRows(3);
    try {
      const markup = await panels[current]();
      // Ignore the answer if another tab was opened while this one loaded.
      if (current === tab) panel.innerHTML = markup;
    } catch (error) {
      if (current === tab) panel.innerHTML = errorState(error);
    }
  }

  async function reloadEvent() {
    event = await api.get(`${base}/`);
    drawHead();
    drawStepper();
  }

  // Runs a mutation, reports the outcome and redraws the open tab.
  async function mutate(work, message) {
    try {
      await work();
      toast(message);
    } catch (error) {
      toast(error.message, "error");
    }
    await reloadEvent().catch(() => {});
    showTab();
  }

  const saved = async (message) => {
    toast(message);
    await reloadEvent();
    showTab();
  };

  // ---------------------------------------------------------------- actions

  delegate(page, "click", "[data-tab]", (clickEvent, button) => {
    tab = button.dataset.tab;
    page.querySelectorAll("[data-tab]").forEach((node) => node.setAttribute("aria-selected", String(node === button)));
    showTab();
  });
  delegate(page, "click", "[data-retry]", showTab);

  delegate(page, "click", "[data-transition]", async (clickEvent, button) => {
    const target = button.dataset.transition;
    const [label, message] = NEXT_ACTION[target];
    if (!(await confirmDialog({ title: label, message, confirmLabel: label }))) return;
    setBusy(button, true);
    try {
      event = await api.post(`${base}/transition/`, { status: target });
      toast(`Event is now ${STATUS_LABEL[event.status].toLowerCase()}.`);
    } catch (error) {
      toast(error.message, "error");
      await reloadEvent().catch(() => {});
    }
    drawHead();
    drawStepper();
    showTab();
  });

  delegate(page, "click", "[data-edit-event]", () => {
    formModal({
      title: "Edit event",
      fields: EVENT_FIELDS,
      values: event,
      onSubmit: async (data) => {
        await api.patch(`${base}/`, data);
        await saved("Event saved.");
      },
    });
  });

  delegate(page, "click", "[data-delete-event]", async () => {
    const confirmed = await confirmDialog({
      title: "Delete draft",
      message: "The draft and its stages are removed. This cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      await api.delete(`${base}/`);
      toast("Draft deleted.");
      location.hash = "#/organizer";
    } catch (error) {
      toast(error.message, "error");
    }
  });

  // Stages and their people.
  const stageFields = (stage) => [
    { name: "name", label: "Name", required: true, maxlength: 200, full: true, placeholder: "Round 1" },
    { name: "order", label: "Order", type: "number", min: 1, step: 1, required: true },
    { name: "location", label: "Location", maxlength: 200 },
    { name: "starts_at", label: "Starts", type: "datetime-local", required: true, value: stage ? undefined : event.starts_at },
    { name: "ends_at", label: "Ends", type: "datetime-local", required: true, value: stage ? undefined : event.ends_at },
    { name: "description", label: "Description", type: "textarea", rows: 3, full: true },
  ];

  delegate(page, "click", "[data-new-stage]", () => {
    formModal({
      title: "Add stage",
      intro: `Must fit inside the event: ${formatRange(event.starts_at, event.ends_at)}.`,
      fields: stageFields(),
      values: { order: (cache.stages?.length || 0) + 1 },
      submitLabel: "Add stage",
      onSubmit: async (data) => {
        await api.post(`${base}/stages/`, data);
        await saved("Stage added.");
      },
    });
  });

  delegate(page, "click", "[data-edit-stage]", (clickEvent, button) => {
    const stage = cache.stages.find((item) => String(item.id) === button.dataset.editStage);
    formModal({
      title: "Edit stage",
      fields: stageFields(stage),
      values: stage,
      onSubmit: async (data) => {
        await api.patch(`${base}/stages/${stage.id}/`, data);
        await saved("Stage saved.");
      },
    });
  });

  delegate(page, "click", "[data-delete-stage]", async (clickEvent, button) => {
    const confirmed = await confirmDialog({
      title: "Delete stage",
      message: "The stage and the people attached to it are removed.",
      confirmLabel: "Delete",
    });
    if (confirmed) mutate(() => api.delete(`${base}/stages/${button.dataset.deleteStage}/`), "Stage deleted.");
  });

  delegate(page, "click", "[data-new-role]", (clickEvent, button) => {
    formModal({
      title: "Add person to stage",
      fields: [
        { name: "role", label: "Role", type: "select", options: STAGE_ROLES, required: true, full: true },
        { name: "name", label: "Name", required: true, maxlength: 150, full: true },
        { name: "bio", label: "Short bio", type: "textarea", rows: 3, full: true },
      ],
      submitLabel: "Add person",
      onSubmit: async (data) => {
        await api.post(`${base}/stages/${button.dataset.newRole}/roles/`, data);
        await saved("Person added.");
      },
    });
  });

  delegate(page, "click", "[data-delete-role]", (clickEvent, button) => {
    const [stageId, roleId] = button.dataset.deleteRole.split(":");
    mutate(() => api.delete(`${base}/stages/${stageId}/roles/${roleId}/`), "Person removed.");
  });

  // EAV values.
  delegate(page, "click", "[data-new-value]", () => {
    const used = new Set(cache.values.map((item) => item.attribute.id));
    const available = cache.library.filter((attribute) => !used.has(attribute.id));
    formModal({
      title: "Add attribute value",
      intro: "Choose the attribute first. The next step asks for a value of its type.",
      fields: [
        {
          name: "attribute_id",
          label: "Attribute",
          type: "select",
          required: true,
          full: true,
          options: available.map((attribute) => [
            attribute.id,
            `${attribute.name} (${DATA_TYPE_LABEL[attribute.data_type]})`,
          ]),
        },
      ],
      submitLabel: "Continue",
      onSubmit: async ({ attribute_id: attributeId }) => {
        const attribute = available.find((item) => String(item.id) === attributeId);
        formModal({
          title: attribute.name,
          intro: attribute.description,
          fields: [valueField(attribute)],
          submitLabel: "Save value",
          onSubmit: async ({ value }) => {
            await api.post(`${base}/attributes/`, { attribute_id: attribute.id, value: typedValue(attribute, value) });
            await saved("Value saved.");
          },
        });
      },
    });
  });

  delegate(page, "click", "[data-edit-value]", (clickEvent, button) => {
    const item = cache.values.find((row) => String(row.id) === button.dataset.editValue);
    formModal({
      title: item.attribute.name,
      intro: item.attribute.description,
      fields: [valueField(item.attribute, item.value)],
      submitLabel: "Save value",
      onSubmit: async ({ value }) => {
        await api.patch(`${base}/attributes/${item.id}/`, { value: typedValue(item.attribute, value) });
        await saved("Value saved.");
      },
    });
  });

  delegate(page, "click", "[data-delete-value]", (clickEvent, button) => {
    mutate(() => api.delete(`${base}/attributes/${button.dataset.deleteValue}/`), "Value removed.");
  });

  // Results.
  delegate(page, "click", "[data-new-result]", () => {
    formModal({
      title: "Publish result",
      fields: [
        { name: "title", label: "Competitor, team or outcome", required: true, maxlength: 200, full: true },
        {
          name: "stage",
          label: "Stage",
          type: "select",
          nullable: true,
          options: [["", "Whole event"], ...cache.stages.map((stage) => [stage.id, stage.name])],
        },
        {
          name: "participant",
          label: "Linked participant",
          type: "select",
          nullable: true,
          options: [
            ["", "None"],
            ...cache.registrations.map(({ participant }) => [participant.id, participant.name]),
          ],
        },
        { name: "position", label: "Position", type: "number", min: 1, step: 1 },
        { name: "score", label: "Score", type: "number", step: "any" },
        { name: "notes", label: "Notes", full: true, maxlength: 500 },
      ],
      submitLabel: "Publish",
      onSubmit: async (data) => {
        await api.post(`${base}/results/`, data);
        await saved("Result published.");
      },
    });
  });

  delegate(page, "click", "[data-delete-result]", (clickEvent, button) => {
    mutate(() => api.delete(`${base}/results/${button.dataset.deleteResult}/`), "Result deleted.");
  });

  drawHead();
  drawStepper(true);
  await showTab();
}
