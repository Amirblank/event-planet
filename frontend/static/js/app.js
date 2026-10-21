// Entry point: hash router, navigation bar and theme switch.

import { onSessionChange, openAuth, restoreSession, session, signOut } from "./auth.js";
import { emptyState } from "./components.js";
import { html, icon } from "./ui.js";
import { eventView } from "./views/event.js";
import { homeView } from "./views/home.js";
import { manageView } from "./views/manage.js";
import { organizerView } from "./views/organizer.js";
import { registrationsView } from "./views/registrations.js";

const ROUTES = [
  { pattern: /^\/$/, view: homeView },
  { pattern: /^\/events\/(\d+)$/, view: eventView },
  { pattern: /^\/registrations$/, view: registrationsView, role: "participant", title: "My registrations" },
  { pattern: /^\/organizer$/, view: organizerView, role: "organizer", title: "Organizer" },
  { pattern: /^\/organizer\/events\/(\d+)$/, view: manageView, role: "organizer" },
];

const main = document.getElementById("main");
const navLinks = document.querySelector("[data-nav-links]");
const navActions = document.querySelector("[data-nav-actions]");

const currentPath = () => (location.hash.startsWith("#/") ? location.hash.slice(1) : "/");

// --------------------------------------------------------------------- theme

function activeTheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen) return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const next = activeTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("ep.theme", next);
  } catch (error) {
    // The choice then lasts for this page view only.
  }
  drawNav();
}

// ----------------------------------------------------------------------- nav

function drawNav() {
  const path = currentPath();
  const user = session.user;
  const links = [["#/", "Events", path === "/" || path.startsWith("/events/")]];
  if (user?.role === "participant") links.push(["#/registrations", "My registrations", path === "/registrations"]);
  if (user?.role === "organizer") links.push(["#/organizer", "Organizer", path.startsWith("/organizer")]);

  navLinks.innerHTML = html`${links.map(
    ([href, label, active]) => html`<a href="${href}" ${active ? html`aria-current="page"` : ""}>${label}</a>`,
  )}`;

  const dark = activeTheme() === "dark";
  navActions.innerHTML = html`
    <button type="button" class="icon-btn" data-theme-toggle aria-label="Switch to ${dark ? "light" : "dark"} theme">
      ${icon(dark ? "sun" : "moon")}
    </button>
    ${user
      ? html`
          <span class="nav__user" title="${user.role}">${icon("user-circle")}<span>${user.username}</span></span>
          <button type="button" class="icon-btn" data-sign-out aria-label="Sign out">${icon("sign-out")}</button>`
      : html`<button type="button" class="btn btn--primary btn--small" data-open-auth>Sign in</button>`}`;
}

document.querySelector(".nav").addEventListener("click", (event) => {
  if (event.target.closest("[data-theme-toggle]")) toggleTheme();
  else if (event.target.closest("[data-open-auth]")) openAuth();
  else if (event.target.closest("[data-sign-out]")) signOut();
});

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});

// -------------------------------------------------------------------- router

function gate(page, role) {
  const organizer = role === "organizer";
  if (!session.user) {
    page.innerHTML = emptyState({
      glyph: "lock-simple",
      title: organizer ? "Sign in as an organizer" : "Sign in to see your registrations",
      text: organizer
        ? "Organizer accounts create events, run their lifecycle and publish results."
        : "Participant accounts hold seats and leave feedback.",
      action: html`<button type="button" class="btn btn--primary" data-gate>Sign in</button>`,
    });
    page.querySelector("[data-gate]").addEventListener("click", () => openAuth({ role }));
    return;
  }
  page.innerHTML = emptyState({
    glyph: "lock-simple",
    title: organizer ? "Organizer accounts only" : "Participant accounts only",
    text: `You are signed in as ${session.user.username}, a ${session.user.role} account.`,
    action: html`<a class="btn" href="#/">Back to events</a>`,
  });
}

async function renderRoute({ keepScroll = false } = {}) {
  const path = currentPath();
  const page = document.createElement("div");
  page.className = "page";
  main.replaceChildren(page);
  drawNav();
  if (!keepScroll) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (!match) continue;
    document.title = route.title ? `${route.title} | Event Planet` : "Event Planet";
    if (route.role && session.user?.role !== route.role) return gate(page, route.role);
    return route.view(page, { params: match.slice(1), reload: () => renderRoute({ keepScroll: true }) });
  }

  document.title = "Not found | Event Planet";
  page.innerHTML = emptyState({
    title: "Page not found",
    text: "This address does not match any page.",
    action: html`<a class="btn btn--primary" href="#/">Back to events</a>`,
  });
}

window.addEventListener("hashchange", () => {
  // In-page anchors such as #events are not routes and must not re-render.
  if (location.hash.startsWith("#/") || location.hash === "") renderRoute();
});

// Views read the session while rendering, so a sign-in or sign-out redraws the current page.
onSessionChange(() => renderRoute({ keepScroll: true }));

await restoreSession();
renderRoute();
