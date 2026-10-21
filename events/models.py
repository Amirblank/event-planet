from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Count, F, Q


class EventQuerySet(models.QuerySet):
    def public(self):
        return self.filter(status__in=Event.PUBLIC_STATUSES)

    def with_counts(self):
        return self.annotate(
            registered_count=Count("registrations", distinct=True),
            stage_count=Count("stages", distinct=True),
        )


class Event(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CLOSED = "closed", "Closed"
        FINISHED = "finished", "Finished"

    class Type(models.TextChoices):
        TOURNAMENT = "tournament", "Tournament"
        WEBINAR = "webinar", "Webinar"
        WORKSHOP = "workshop", "Workshop"
        SPORTS = "sports", "Sports event"
        CONFERENCE = "conference", "Conference"
        OTHER = "other", "Other"

    # The lifecycle is a straight line. Each state has exactly one successor.
    TRANSITIONS = {
        Status.DRAFT: Status.PUBLISHED,
        Status.PUBLISHED: Status.CLOSED,
        Status.CLOSED: Status.FINISHED,
    }
    # Everything except drafts is visible through the public API.
    PUBLIC_STATUSES = (Status.PUBLISHED, Status.CLOSED, Status.FINISHED)

    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="organized_events"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    event_type = models.CharField(max_length=20, choices=Type.choices, default=Type.OTHER)
    location = models.CharField(max_length=200, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField(
        null=True, blank=True, help_text="Maximum registrations for the whole event. Empty means unlimited."
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = EventQuerySet.as_manager()

    class Meta:
        ordering = ("starts_at", "id")
        indexes = [models.Index(fields=("status", "starts_at"))]
        constraints = [
            models.CheckConstraint(condition=Q(ends_at__gt=F("starts_at")), name="event_ends_after_start"),
            models.CheckConstraint(
                condition=Q(capacity__isnull=True) | Q(capacity__gte=1), name="event_capacity_positive"
            ),
        ]

    def __str__(self):
        return self.title

    @property
    def next_status(self):
        return self.TRANSITIONS.get(self.status)

    @property
    def is_public(self):
        return self.status in self.PUBLIC_STATUSES


class Stage(models.Model):
    """One session, round or part of an event, with its own schedule and staff."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="stages")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=1)
    location = models.CharField(max_length=200, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("order", "starts_at", "id")
        constraints = [
            models.CheckConstraint(condition=Q(ends_at__gt=F("starts_at")), name="stage_ends_after_start"),
        ]

    def __str__(self):
        return f"{self.event}: {self.name}"


class StageRole(models.Model):
    """A person attached to a single stage in a named capacity."""

    class Role(models.TextChoices):
        SPEAKER = "speaker", "Speaker"
        JUDGE = "judge", "Judge"
        COACH = "coach", "Coach"
        MODERATOR = "moderator", "Moderator"
        REFEREE = "referee", "Referee"
        HOST = "host", "Host"

    stage = models.ForeignKey(Stage, on_delete=models.CASCADE, related_name="roles")
    role = models.CharField(max_length=20, choices=Role.choices)
    name = models.CharField(max_length=150)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stage_roles",
        help_text="Optional link to a platform account.",
    )
    bio = models.TextField(blank=True)

    class Meta:
        ordering = ("role", "name", "id")
        constraints = [
            models.UniqueConstraint(fields=("stage", "role", "name"), name="unique_role_per_stage"),
        ]

    def __str__(self):
        return f"{self.get_role_display()}: {self.name}"


class Attribute(models.Model):
    """EAV attribute definition. Independent of events and reusable across them."""

    class DataType(models.TextChoices):
        TEXT = "text", "Text"
        INTEGER = "integer", "Integer"
        DECIMAL = "decimal", "Decimal"
        BOOLEAN = "boolean", "Boolean"
        DATE = "date", "Date"
        DATETIME = "datetime", "Date and time"

    name = models.CharField(max_length=100, unique=True)
    data_type = models.CharField(max_length=20, choices=DataType.choices)
    description = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attributes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} ({self.data_type})"


class EventAttributeValue(models.Model):
    """
    EAV value row: one typed value of one attribute for one event.

    Each data type has its own nullable column, so PostgreSQL stores and
    validates the value natively. Exactly one column is filled per row.
    """

    VALUE_FIELDS = {
        Attribute.DataType.TEXT: "value_text",
        Attribute.DataType.INTEGER: "value_integer",
        Attribute.DataType.DECIMAL: "value_decimal",
        Attribute.DataType.BOOLEAN: "value_boolean",
        Attribute.DataType.DATE: "value_date",
        Attribute.DataType.DATETIME: "value_datetime",
    }

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="attribute_values")
    attribute = models.ForeignKey(Attribute, on_delete=models.PROTECT, related_name="values")
    value_text = models.TextField(null=True, blank=True)
    value_integer = models.BigIntegerField(null=True, blank=True)
    value_decimal = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    value_date = models.DateField(null=True, blank=True)
    value_datetime = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("attribute__name",)
        constraints = [
            models.UniqueConstraint(fields=("event", "attribute"), name="unique_attribute_per_event"),
            models.CheckConstraint(
                name="eav_exactly_one_value",
                condition=(
                    Q(value_text__isnull=False, value_integer__isnull=True, value_decimal__isnull=True,
                      value_boolean__isnull=True, value_date__isnull=True, value_datetime__isnull=True)
                    | Q(value_text__isnull=True, value_integer__isnull=False, value_decimal__isnull=True,
                        value_boolean__isnull=True, value_date__isnull=True, value_datetime__isnull=True)
                    | Q(value_text__isnull=True, value_integer__isnull=True, value_decimal__isnull=False,
                        value_boolean__isnull=True, value_date__isnull=True, value_datetime__isnull=True)
                    | Q(value_text__isnull=True, value_integer__isnull=True, value_decimal__isnull=True,
                        value_boolean__isnull=False, value_date__isnull=True, value_datetime__isnull=True)
                    | Q(value_text__isnull=True, value_integer__isnull=True, value_decimal__isnull=True,
                        value_boolean__isnull=True, value_date__isnull=False, value_datetime__isnull=True)
                    | Q(value_text__isnull=True, value_integer__isnull=True, value_decimal__isnull=True,
                        value_boolean__isnull=True, value_date__isnull=True, value_datetime__isnull=False)
                ),
            ),
        ]

    def __str__(self):
        return f"{self.event} / {self.attribute.name} = {self.value!r}"

    @property
    def value_field(self):
        return self.VALUE_FIELDS[self.attribute.data_type]

    @property
    def value(self):
        return getattr(self, self.value_field)

    @value.setter
    def value(self, typed_value):
        """Store an already-typed value in the column that matches the attribute."""
        for field in self.VALUE_FIELDS.values():
            setattr(self, field, None)
        setattr(self, self.value_field, typed_value)

    def clean(self):
        filled = [field for field in self.VALUE_FIELDS.values() if getattr(self, field) is not None]
        if filled != [self.value_field]:
            raise ValidationError(
                f"Attribute '{self.attribute.name}' stores a {self.attribute.data_type} value "
                f"in '{self.value_field}' only."
            )


class Registration(models.Model):
    """A participant's seat. Registration and capacity apply to the whole event."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registrations")
    participant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="registrations"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        constraints = [
            models.UniqueConstraint(fields=("event", "participant"), name="unique_registration"),
        ]

    def __str__(self):
        return f"{self.participant} -> {self.event}"


class Feedback(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="feedback")
    participant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="feedback"
    )
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        verbose_name_plural = "feedback"
        constraints = [
            models.UniqueConstraint(fields=("event", "participant"), name="unique_feedback"),
            models.CheckConstraint(condition=Q(rating__gte=1, rating__lte=5), name="feedback_rating_range"),
        ]

    def __str__(self):
        return f"{self.participant} rated {self.event} {self.rating}/5"


class Result(models.Model):
    """One published result line, for the whole event or for a single stage."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="results")
    stage = models.ForeignKey(Stage, on_delete=models.CASCADE, null=True, blank=True, related_name="results")
    participant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="results",
        help_text="Optional link to a registered participant.",
    )
    title = models.CharField(max_length=200, help_text="Competitor, team or outcome shown publicly.")
    position = models.PositiveIntegerField(null=True, blank=True)
    score = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    notes = models.TextField(blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="published_results"
    )
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = (F("stage").asc(nulls_first=True), F("position").asc(nulls_last=True), "id")

    def __str__(self):
        return f"{self.event}: {self.title}"
