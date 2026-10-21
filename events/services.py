from django.db import IntegrityError, transaction
from django.utils import timezone

from .exceptions import RuleViolation
from .models import Event, Feedback, Registration


def _lock_event(event_id):
    """Take a row lock so concurrent requests cannot oversell seats or race a transition."""
    return Event.objects.select_for_update().get(pk=event_id)


@transaction.atomic
def transition_event(event, target_status):
    event = _lock_event(event.pk)
    allowed = event.next_status
    if target_status != allowed:
        if allowed is None:
            raise RuleViolation(
                f"Event is {event.get_status_display()}, the final state.", code="invalid_transition"
            )
        raise RuleViolation(
            f"Cannot move from {event.get_status_display()} to "
            f"{Event.Status(target_status).label}. The only allowed next state is "
            f"{Event.Status(allowed).label}.",
            code="invalid_transition",
        )
    event.status = target_status
    update_fields = ["status", "updated_at"]
    if target_status == Event.Status.PUBLISHED:
        event.published_at = timezone.now()
        update_fields.append("published_at")
    event.save(update_fields=update_fields)
    return event


@transaction.atomic
def register_participant(event, participant):
    event = _lock_event(event.pk)
    if event.status != Event.Status.PUBLISHED:
        raise RuleViolation("Registration is open for published events only.", code="registration_closed")
    if Registration.objects.filter(event=event, participant=participant).exists():
        raise RuleViolation("You are already registered for this event.", code="duplicate_registration")
    if event.capacity is not None and event.registrations.count() >= event.capacity:
        raise RuleViolation("This event is full.", code="event_full")
    try:
        with transaction.atomic():
            return Registration.objects.create(event=event, participant=participant)
    except IntegrityError:
        # The unique constraint is the last line of defence against a double submit.
        raise RuleViolation("You are already registered for this event.", code="duplicate_registration")


@transaction.atomic
def cancel_registration(event, participant):
    event = _lock_event(event.pk)
    if event.status != Event.Status.PUBLISHED:
        raise RuleViolation(
            "Registrations can be cancelled while the event is published only.", code="registration_closed"
        )
    deleted, _ = Registration.objects.filter(event=event, participant=participant).delete()
    if not deleted:
        raise RuleViolation("You are not registered for this event.", code="not_registered")


@transaction.atomic
def submit_feedback(event, participant, rating, comment=""):
    if event.status != Event.Status.FINISHED:
        raise RuleViolation("Feedback opens once the event is finished.", code="event_not_finished")
    if not Registration.objects.filter(event=event, participant=participant).exists():
        raise RuleViolation("Only registered participants can leave feedback.", code="not_registered")
    if Feedback.objects.filter(event=event, participant=participant).exists():
        raise RuleViolation("You have already left feedback for this event.", code="duplicate_feedback")
    try:
        with transaction.atomic():
            return Feedback.objects.create(
                event=event, participant=participant, rating=rating, comment=comment
            )
    except IntegrityError:
        raise RuleViolation("You have already left feedback for this event.", code="duplicate_feedback")


def ensure_results_open(event):
    if event.status != Event.Status.FINISHED:
        raise RuleViolation("Results can be published after the event is finished.", code="event_not_finished")


def ensure_event_editable(event):
    if event.status == Event.Status.FINISHED:
        raise RuleViolation("Finished events are read-only.", code="event_finished")


def ensure_event_deletable(event):
    if event.status != Event.Status.DRAFT:
        raise RuleViolation("Only draft events can be deleted.", code="event_not_draft")
