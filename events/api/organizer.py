from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsOrganizer
from .. import services
from ..exceptions import RuleViolation
from ..models import Attribute, Event, EventAttributeValue, Feedback, Registration, Result, Stage, StageRole
from ..serializers import (
    AttributeSerializer,
    EventAttributeValueSerializer,
    EventParticipantSerializer,
    FeedbackSerializer,
    OrganizerEventSerializer,
    ResultSerializer,
    StageRoleSerializer,
    StageSerializer,
    TransitionSerializer,
)


class OwnedEventMixin:
    """Resolves the event from the URL and hides events owned by other organizers."""
    permission_classes = [IsOrganizer]
    @cached_property
    def event(self):
        return get_object_or_404(Event, pk=self.kwargs["event_id"], organizer=self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if "event_id" in self.kwargs:
            context["event"] = self.event
        return context

# -------------------------------------------------------------------- events

@extend_schema(
    tags=["Organizer"],
    parameters=[OpenApiParameter("status", str, enum=Event.Status.values)],
)
class OrganizerEventListCreateView(generics.ListCreateAPIView):
    """List the organizer's own events in any state, or create a new draft."""

    permission_classes = [IsOrganizer]
    serializer_class = OrganizerEventSerializer

    def get_queryset(self):
        queryset = (
            Event.objects.filter(organizer=self.request.user).with_counts().select_related("organizer")
        )
        status = self.request.query_params.get("status")
        if status in Event.Status.values:
            queryset = queryset.filter(status=status)
        return queryset.order_by("-created_at", "-id")

    def perform_create(self, serializer):
        serializer.save(organizer=self.request.user)


@extend_schema(tags=["Organizer"])
class OrganizerEventDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Read, edit or delete one of the organizer's events."""

    permission_classes = [IsOrganizer]
    serializer_class = OrganizerEventSerializer
    lookup_url_kwarg = "event_id"

    def get_queryset(self):
        return Event.objects.filter(organizer=self.request.user).with_counts().select_related("organizer")

    def perform_update(self, serializer):
        services.ensure_event_editable(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        services.ensure_event_deletable(instance)
        instance.delete()


@extend_schema(tags=["Organizer"], request=TransitionSerializer, responses=OrganizerEventSerializer)
class EventTransitionView(OwnedEventMixin, APIView):
    """Move the event one step along Draft, Published, Closed, Finished."""

    def post(self, request, event_id):
        serializer = TransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = services.transition_event(self.event, serializer.validated_data["status"])
        return Response(OrganizerEventSerializer(event, context={"request": request}).data)


# -------------------------------------------------------------------- stages


@extend_schema(tags=["Organizer"])
class StageListCreateView(OwnedEventMixin, generics.ListCreateAPIView):
    """Stages, sessions or rounds of an event."""

    serializer_class = StageSerializer
    pagination_class = None

    def get_queryset(self):
        return Stage.objects.filter(event=self.event).prefetch_related("roles")

    def perform_create(self, serializer):
        services.ensure_event_editable(self.event)
        serializer.save(event=self.event)


@extend_schema(tags=["Organizer"])
class StageDetailView(OwnedEventMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = StageSerializer
    lookup_url_kwarg = "stage_id"

    def get_queryset(self):
        return Stage.objects.filter(event=self.event).prefetch_related("roles")

    def perform_update(self, serializer):
        services.ensure_event_editable(self.event)
        serializer.save()

    def perform_destroy(self, instance):
        services.ensure_event_editable(self.event)
        instance.delete()


class StageScopedMixin(OwnedEventMixin):
    @cached_property
    def stage(self):
        return get_object_or_404(Stage, pk=self.kwargs["stage_id"], event=self.event)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["stage"] = self.stage
        return context

    def get_queryset(self):
        return StageRole.objects.filter(stage=self.stage)


@extend_schema(tags=["Organizer"])
class StageRoleListCreateView(StageScopedMixin, generics.ListCreateAPIView):
    """People attached to one stage: speakers, judges, coaches and so on."""

    serializer_class = StageRoleSerializer
    pagination_class = None

    def perform_create(self, serializer):
        services.ensure_event_editable(self.event)
        serializer.save(stage=self.stage)


@extend_schema(tags=["Organizer"])
class StageRoleDetailView(StageScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = StageRoleSerializer
    lookup_url_kwarg = "role_id"

    def perform_update(self, serializer):
        services.ensure_event_editable(self.event)
        serializer.save()

    def perform_destroy(self, instance):
        services.ensure_event_editable(self.event)
        instance.delete()


@extend_schema(
    tags=["Organizer"],
    parameters=[OpenApiParameter("search", str, description="Matches the attribute name.")],
)
class AttributeListCreateView(generics.ListCreateAPIView):
    """Attribute definitions. They are shared: any organizer can reuse any attribute."""

    permission_classes = [IsOrganizer]
    serializer_class = AttributeSerializer

    def get_queryset(self):
        queryset = Attribute.objects.annotate(usage_count=Count("values"))
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))
        return queryset.order_by("name")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=["Organizer"])
class AttributeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Only the organizer who defined an attribute can rename or delete it."""

    permission_classes = [IsOrganizer]
    serializer_class = AttributeSerializer
    lookup_url_kwarg = "attribute_id"
    queryset = Attribute.objects.annotate(usage_count=Count("values"))

    def _ensure_owner(self, attribute):
        if attribute.created_by_id != self.request.user.id:
            raise PermissionDenied("Only the organizer who defined this attribute can change it.")

    def perform_update(self, serializer):
        self._ensure_owner(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_owner(instance)
        try:
            instance.delete()
        except ProtectedError:
            raise RuleViolation(
                "This attribute still has values on events. Remove them first.", code="attribute_in_use"
            )


@extend_schema(tags=["Organizer"])
class EventAttributeValueListCreateView(OwnedEventMixin, generics.ListCreateAPIView):
    """Typed values of dynamic attributes for one event."""

    serializer_class = EventAttributeValueSerializer
    pagination_class = None

    def get_queryset(self):
        return EventAttributeValue.objects.filter(event=self.event).select_related("attribute")

    def perform_create(self, serializer):
        services.ensure_event_editable(self.event)
        serializer.save()


@extend_schema(tags=["Organizer"])
class EventAttributeValueDetailView(OwnedEventMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EventAttributeValueSerializer
    lookup_url_kwarg = "value_id"

    def get_queryset(self):
        return EventAttributeValue.objects.filter(event=self.event).select_related("attribute")

    def perform_update(self, serializer):
        services.ensure_event_editable(self.event)
        serializer.save()

    def perform_destroy(self, instance):
        services.ensure_event_editable(self.event)
        instance.delete()


# ------------------------------------------- participants, feedback, results


@extend_schema(tags=["Organizer"])
class EventParticipantsView(OwnedEventMixin, generics.ListAPIView):
    """Participants registered for the event."""

    serializer_class = EventParticipantSerializer

    def get_queryset(self):
        return Registration.objects.filter(event=self.event).select_related("participant")


@extend_schema(tags=["Organizer"])
class EventFeedbackListView(OwnedEventMixin, generics.ListAPIView):
    """Feedback left by participants after the event finished."""

    serializer_class = FeedbackSerializer

    def get_queryset(self):
        return Feedback.objects.filter(event=self.event).select_related("participant")


@extend_schema(tags=["Organizer"])
class EventResultListCreateView(OwnedEventMixin, generics.ListCreateAPIView):
    """Publish results. Allowed only once the event is finished."""

    serializer_class = ResultSerializer
    pagination_class = None

    def get_queryset(self):
        return Result.objects.filter(event=self.event).select_related("stage", "participant")

    def perform_create(self, serializer):
        services.ensure_results_open(self.event)
        serializer.save(event=self.event, published_by=self.request.user)


@extend_schema(tags=["Organizer"])
class EventResultDetailView(OwnedEventMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ResultSerializer
    lookup_url_kwarg = "result_id"

    def get_queryset(self):
        return Result.objects.filter(event=self.event).select_related("stage", "participant")
