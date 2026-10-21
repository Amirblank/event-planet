# 🪐 Event Planet — Event Planning & Management Platform

**Event Planet** is a modular, **API-First** event management platform built with **Django REST Framework (DRF)** and **PostgreSQL**, fully containerized with **Docker**. It supports multi-stage event scheduling, type-safe dynamic attributes (EAV pattern), role-based access control, capacity-checked registrations, participant feedback, and event results publishing.

---

## 📌 Key Architectural Decisions

### 1. Multi-Stage Events: Registration & Capacity Scope
* **Event-Level Registration & Capacity:** Registration and capacity enforcement operate at the **overall Event level** rather than individual stages.
* **Stages as Execution Sub-Units:** Stages (`EventStage`) represent ordered sessions, rounds, or segments within an event (with independent schedules and stage-specific roles such as speakers, judges, or mentors). Registering for an event grants the participant access to its entire lifecycle, while concurrency and capacity limits are atomically enforced (`select_for_update`) on the parent `Event` instance.

### 2. Dynamic Attributes
* **`Attribute`:** Defines reusable attribute definitions across events with explicit data types (`string`, `integer`, `boolean`, `date`).
* **`EventAttributeValue`:** Stores strongly-typed values per event without altering database schemas or adding sparse columns, validated at the serializer and service layers.

---

## 🚀 Core Features

* **Token-Based Authentication & RBAC:** Custom token authentication and granular permission classes separating `Organizer` and `Participant` capabilities.
* **Controlled Event State Machine:** Enforces logical lifecycle transitions:
  `Draft` ➔ `Published` ➔ `Closed` ➔ `Finished`
* **Structured API Groups:**
  * **Public APIs:** Browse `Published` events, inspect event details, stages, dynamic attributes, and view published results of `Finished` events.
  * **Participant APIs:** Register for published events (with capacity and duplicate checks), view personal registrations, and submit feedback once an event is `Finished`.
  * **Organizer APIs:** Create and update owned events, transition event statuses, manage stages and stage roles, assign dynamic attributes, inspect participant lists, and publish final results.
* **Frontend:** A clean, decoupled Vanilla JavaScript Single-Page Application that strictly consumes the backend REST APIs.

---

## 🛠️ Environment Variables

Create a `.env` file in the root directory of the project with the following variables:

```env
DEBUG=1
SECRET_KEY=django-insecure-eventplanet-super-secret-key-change-in-prod
ALLOWED_HOSTS=localhost,127.0.0.1,web

# PostgreSQL Configuration
POSTGRES_DB=event_planet_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
```

---

## 🐳 Running the Project with Docker Compose

```bash
# Build and start the containers in detached mode
docker compose up --build -d
```
---

## 🖥️ How the UI Works

* **Pure API Consumer:** The UI is served from `frontend/templates/index.html` and built with modular Vanilla JavaScript (`frontend/static/js/`).
* **Zero Business Logic in Frontend:** All state validations, role checks, capacity constraints, and lifecycle rules reside strictly in the Django backend.
* **Token Handling:** Upon login or registration, the UI stores the auth token in `localStorage` and attaches the `Authorization: Token <token>` header to subsequent API requests via the centralized `api.js` client.

---

## 🧪 Main API Endpoints Overview

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/accounts/register/` | Public | Register a new user (`Organizer` or `Participant`) |
| `POST` | `/api/accounts/login/` | Public | Authenticate and obtain an access token |
| `GET` | `/api/events/` | Public | List all `Published` events |
| `GET` | `/api/events/<id>/` | Public | Retrieve event details, stages, and attributes |
| `GET` | `/api/events/<id>/results/` | Public | View published results (for `Finished` events) |
| `POST` | `/api/events/<id>/register/` | Participant | Register for a `Published` event |
| `GET` | `/api/events/my-registrations/` | Participant | List current user's event registrations |
| `POST` | `/api/events/<id>/feedback/` | Participant | Submit feedback for a `Finished` event |
| `POST` | `/api/events/manage/` | Organizer | Create a new event |
| `PATCH` | `/api/events/manage/<id>/status/` | Organizer | Transition event status (`Draft` ➔ `Published` ➔ `Closed` ➔ `Finished`) |
| `POST` | `/api/events/manage/<id>/stages/` | Organizer | Add and manage stages for an owned event |
| `POST` | `/api/events/manage/<id>/results/` | Organizer | Publish final results once the event is `Finished` |
