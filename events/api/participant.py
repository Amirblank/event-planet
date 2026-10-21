from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsParticipant

from .. import services
from ..models import Event, Feedback, Registration
from ..serializers import FeedbackSerializer, RegistrationSerializer


def public_event(event_id):
    return get_object_or_404(Event.objects.public(), pk=event_id)


@extend_schema(tags=["Participant"])
class MyRegistrationsView(generics.ListAPIView):
    """Registrations of the signed-in participant."""

    permission_classes = [IsParticipant]
    serializer_class = RegistrationSerializer

    def get_queryset(self):
        events = Event.objects.with_counts().select_related("organizer")
        return Registration.objects.filter(participant=self.request.user).prefetch_related(
            Prefetch("event", queryset=events)
        )


@extend_schema(tags=["Participant"])
class EventRegistrationView(APIView):
    permission_classes = [IsParticipant]

    @extend_schema(request=None, responses={201: RegistrationSerializer})
    def post(self, request, event_id):
        """Register for a published event. Checks capacity and duplicates."""
        registration = services.register_participant(public_event(event_id), request.user)
        return Response(RegistrationSerializer(registration).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, event_id):
        """Cancel a registration while the event is still published."""
        services.cancel_registration(public_event(event_id), request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Participant"])
class EventFeedbackView(APIView):
    permission_classes = [IsParticipant]

    @extend_schema(responses={200: FeedbackSerializer})
    def get(self, request, event_id):
        """The signed-in participant's feedback for this event."""
        feedback = get_object_or_404(Feedback, event=public_event(event_id), participant=request.user)
        return Response(FeedbackSerializer(feedback).data)

    @extend_schema(request=FeedbackSerializer, responses={201: FeedbackSerializer})
    def post(self, request, event_id):
        """Leave feedback. Requires a registration and a finished event."""
        serializer = FeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback = services.submit_feedback(
            public_event(event_id), request.user, **serializer.validated_data
        )
        return Response(FeedbackSerializer(feedback).data, status=status.HTTP_201_CREATED)
