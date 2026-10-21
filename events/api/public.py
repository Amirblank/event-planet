from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.permissions import AllowAny

from ..models import Event, Result
from ..serializers import EventDetailSerializer, EventListSerializer, ResultSerializer


@extend_schema(
    tags=["Public"],
    parameters=[
        OpenApiParameter("status", str, enum=list(Event.PUBLIC_STATUSES), description="Lifecycle state."),
        OpenApiParameter("event_type", str, enum=Event.Type.values),
        OpenApiParameter("search", str, description="Matches title, description and location."),
    ],
)
class PublicEventListView(generics.ListAPIView):
    """List events that have left the draft state."""

    permission_classes = [AllowAny]
    serializer_class = EventListSerializer

    def get_queryset(self):
        queryset = Event.objects.public().with_counts().select_related("organizer")
        params = self.request.query_params
        status = params.get("status")
        if status in Event.PUBLIC_STATUSES:
            queryset = queryset.filter(status=status)
        event_type = params.get("event_type")
        if event_type in Event.Type.values:
            queryset = queryset.filter(event_type=event_type)
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(description__icontains=search) | Q(location__icontains=search)
            )
        # Aggregation drops the model's default ordering, so state it again.
        return queryset.order_by("starts_at", "id")


@extend_schema(tags=["Public"])
class PublicEventDetailView(generics.RetrieveAPIView):
    """Event details with its stages, stage roles and dynamic attributes."""

    permission_classes = [AllowAny]
    serializer_class = EventDetailSerializer
    lookup_url_kwarg = "event_id"

    def get_queryset(self):
        return (
            Event.objects.public()
            .with_counts()
            .select_related("organizer")
            .prefetch_related("stages__roles", "attribute_values__attribute")
        )


@extend_schema(tags=["Public"])
class PublicEventResultsView(generics.ListAPIView):
    """Published results of an event. Empty until the organizer publishes them."""

    permission_classes = [AllowAny]
    serializer_class = ResultSerializer
    pagination_class = None

    def get_queryset(self):
        event = get_object_or_404(Event.objects.public(), pk=self.kwargs["event_id"])
        return Result.objects.filter(event=event).select_related("stage", "participant")
