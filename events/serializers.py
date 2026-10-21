from decimal import Decimal
from django.db.models import Avg, Count
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from accounts.models import User
from .models import (
    Attribute,
    Event,
    EventAttributeValue,
    Feedback,
    Registration,
    Result,
    Stage,
    StageRole,
)

VALUE_PARSERS = {
    Attribute.DataType.TEXT: lambda: serializers.CharField(allow_blank=False, max_length=5000),
    Attribute.DataType.INTEGER: lambda: serializers.IntegerField(
        min_value=-(2**63), max_value=2**63 - 1
    ),
    Attribute.DataType.DECIMAL: lambda: serializers.DecimalField(max_digits=20, decimal_places=6),
    Attribute.DataType.BOOLEAN: lambda: serializers.BooleanField(),
    Attribute.DataType.DATE: lambda: serializers.DateField(),
    Attribute.DataType.DATETIME: lambda: serializers.DateTimeField(),
}


def render_value(value):
    """JSON-friendly form of a typed EAV value."""
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return value


class OrganizerSummarySerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "name")


class ParticipantSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "name", "email")


# ---------------------------------------------------------------- attributes

class AttributeSerializer(serializers.ModelSerializer):
    usage_count = serializers.IntegerField(read_only=True, required=False)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Attribute
        fields = ("id", "name", "data_type", "description", "usage_count", "is_mine", "created_at")
        read_only_fields = ("id", "created_at")

    def get_is_mine(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and obj.created_by_id == request.user.id)

    def validate_name(self, value):
        value = " ".join(value.split())
        duplicates = Attribute.objects.filter(name__iexact=value)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("An attribute with this name already exists. Reuse it.")
        return value

    def validate_data_type(self, value):
        # Changing the type would orphan values already stored in typed columns.
        if self.instance and value != self.instance.data_type:
            raise serializers.ValidationError("The data type cannot be changed after creation.")
        return value


class EventAttributeValueSerializer(serializers.ModelSerializer):
    attribute_id = serializers.PrimaryKeyRelatedField(
        source="attribute", queryset=Attribute.objects.all(), write_only=True, required=False
    )
    attribute = AttributeSerializer(read_only=True)
    value = serializers.JSONField(help_text="Must match the attribute's data type.")

    class Meta:
        model = EventAttributeValue
        fields = ("id", "attribute_id", "attribute", "value")

    def validate(self, attrs):
        event = self.context["event"]
        if self.instance:
            if "attribute" in attrs and attrs["attribute"] != self.instance.attribute:
                raise serializers.ValidationError(
                    {"attribute_id": "Delete this value and add a new one to switch attributes."}
                )
            attribute = self.instance.attribute
        else:
            attribute = attrs.get("attribute")
            if attribute is None:
                raise serializers.ValidationError({"attribute_id": "This field is required."})
            if EventAttributeValue.objects.filter(event=event, attribute=attribute).exists():
                raise serializers.ValidationError(
                    {"attribute_id": "This event already has a value for this attribute."}
                )
        if "value" in attrs:
            parser = VALUE_PARSERS[attribute.data_type]()
            try:
                attrs["value"] = parser.run_validation(attrs["value"])
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"value": exc.detail})
        return attrs

    def create(self, validated_data):
        instance = EventAttributeValue(event=self.context["event"], attribute=validated_data["attribute"])
        instance.value = validated_data["value"]
        instance.full_clean()
        instance.save()
        return instance

    def update(self, instance, validated_data):
        if "value" in validated_data:
            instance.value = validated_data["value"]
            instance.full_clean()
            instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["value"] = render_value(instance.value)
        return data


class PublicAttributeValueSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="attribute.name")
    data_type = serializers.CharField(source="attribute.data_type")
    value = serializers.SerializerMethodField()

    class Meta:
        model = EventAttributeValue
        fields = ("name", "data_type", "value")

    @extend_schema_field(OpenApiTypes.ANY)
    def get_value(self, obj):
        return render_value(obj.value)

# -------------------------------------------------------------------- stages

class StageRoleSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = StageRole
        fields = ("id", "role", "role_label", "name", "user", "bio")

    def validate(self, attrs):
        stage = self.context.get("stage")
        if stage is not None:
            role = attrs.get("role", getattr(self.instance, "role", None))
            name = attrs.get("name", getattr(self.instance, "name", None))
            clash = StageRole.objects.filter(stage=stage, role=role, name=name)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {"name": "This person already holds this role in the stage."}
                )
        return attrs


class StageSerializer(serializers.ModelSerializer):
    roles = StageRoleSerializer(many=True, read_only=True)

    class Meta:
        model = Stage
        fields = ("id", "name", "description", "order", "location", "starts_at", "ends_at", "roles")

    def validate(self, attrs):
        event = self.context.get("event")
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "A stage must end after it starts."})
        if event and starts_at and ends_at:
            if starts_at < event.starts_at or ends_at > event.ends_at:
                raise serializers.ValidationError(
                    {"starts_at": "A stage must fit inside the event's time range."}
                )
        return attrs

# -------------------------------------------------------------------- events

class EventListSerializer(serializers.ModelSerializer):
    organizer = OrganizerSummarySerializer(read_only=True)
    registered_count = serializers.IntegerField(read_only=True)
    seats_left = serializers.SerializerMethodField()
    stage_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = (
            "id", "title", "description", "event_type", "location", "starts_at", "ends_at",
            "capacity", "registered_count", "seats_left", "stage_count", "status", "organizer",
        )

    def get_seats_left(self, obj) -> int | None:
        if obj.capacity is None:
            return None
        return max(obj.capacity - obj.registered_count, 0)

    def to_representation(self, instance):
        # Instances that did not come from Event.objects.with_counts() carry no annotations.
        if not hasattr(instance, "registered_count"):
            instance.registered_count = instance.registrations.count()
        if not hasattr(instance, "stage_count"):
            instance.stage_count = instance.stages.count()
        return super().to_representation(instance)


class FeedbackSummarySerializer(serializers.Serializer):
    count = serializers.IntegerField()
    average_rating = serializers.FloatField(allow_null=True)


class ViewerSerializer(serializers.Serializer):
    is_registered = serializers.BooleanField()
    has_feedback = serializers.BooleanField()


class EventDetailSerializer(EventListSerializer):
    stages = StageSerializer(many=True, read_only=True)
    attributes = PublicAttributeValueSerializer(source="attribute_values", many=True, read_only=True)
    feedback_summary = serializers.SerializerMethodField()
    viewer = serializers.SerializerMethodField()

    class Meta(EventListSerializer.Meta):
        fields = EventListSerializer.Meta.fields + ("stages", "attributes", "feedback_summary", "viewer")

    @extend_schema_field(FeedbackSummarySerializer)
    def get_feedback_summary(self, obj):
        summary = obj.feedback.aggregate(count=Count("id"), average=Avg("rating"))
        average = summary["average"]
        return {
            "count": summary["count"],
            "average_rating": round(average, 2) if average is not None else None,
        }

    @extend_schema_field(ViewerSerializer(allow_null=True))
    def get_viewer(self, obj):
        """State of the signed-in participant, so clients need no extra round trips."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_participant:
            return None
        return {
            "is_registered": obj.registrations.filter(participant=user).exists(),
            "has_feedback": obj.feedback.filter(participant=user).exists(),
        }


class OrganizerEventSerializer(EventListSerializer):
    next_status = serializers.CharField(read_only=True, allow_null=True)

    class Meta(EventListSerializer.Meta):
        fields = EventListSerializer.Meta.fields + ("next_status", "published_at", "created_at", "updated_at")
        # The status only changes through the transition endpoint.
        read_only_fields = ("status", "published_at", "created_at", "updated_at")

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "An event must end after it starts."})
        if self.instance:
            if "capacity" in attrs and attrs["capacity"] is not None:
                taken = self.instance.registrations.count()
                if attrs["capacity"] < taken:
                    raise serializers.ValidationError(
                        {"capacity": f"{taken} participants are already registered."}
                    )
            outside = self.instance.stages.filter(starts_at__lt=starts_at) | self.instance.stages.filter(
                ends_at__gt=ends_at
            )
            if outside.exists():
                raise serializers.ValidationError(
                    {"starts_at": "Existing stages would fall outside the new time range."}
                )
        return attrs

    def validate_capacity(self, value):
        if value is not None and value < 1:
            raise serializers.ValidationError("Capacity must be at least 1, or empty for unlimited.")
        return value


class TransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Event.Status.choices)


# ---------------------------------------------- registrations, feedback, results


class RegistrationSerializer(serializers.ModelSerializer):
    event = EventListSerializer(read_only=True)

    class Meta:
        model = Registration
        fields = ("id", "event", "created_at")


class EventParticipantSerializer(serializers.ModelSerializer):
    participant = ParticipantSerializer(read_only=True)

    class Meta:
        model = Registration
        fields = ("id", "participant", "created_at")


class FeedbackSerializer(serializers.ModelSerializer):
    participant = serializers.CharField(source="participant.display_name", read_only=True)

    class Meta:
        model = Feedback
        fields = ("id", "participant", "rating", "comment", "created_at")
        read_only_fields = ("id", "created_at")


class ResultSerializer(serializers.ModelSerializer):
    stage_name = serializers.CharField(source="stage.name", read_only=True, default=None)
    participant_name = serializers.CharField(source="participant.display_name", read_only=True, default=None)

    class Meta:
        model = Result
        fields = (
            "id", "stage", "stage_name", "participant", "participant_name",
            "title", "position", "score", "notes", "published_at",
        )
        read_only_fields = ("id", "published_at")

    def validate(self, attrs):
        event = self.context["event"]
        stage = attrs.get("stage")
        if stage is not None and stage.event_id != event.id:
            raise serializers.ValidationError({"stage": "This stage belongs to another event."})
        participant = attrs.get("participant")
        if participant is not None and not event.registrations.filter(participant=participant).exists():
            raise serializers.ValidationError(
                {"participant": "This user is not registered for the event."}
            )
        return attrs
