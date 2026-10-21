from django.urls import include, path

from . import organizer, participant, public

public_urls = [
    path("events/", public.PublicEventListView.as_view(), name="public-event-list"),
    path("events/<int:event_id>/", public.PublicEventDetailView.as_view(), name="public-event-detail"),
    path("events/<int:event_id>/results/", public.PublicEventResultsView.as_view(), name="public-event-results"),
]

participant_urls = [
    path("registrations/", participant.MyRegistrationsView.as_view(), name="participant-registrations"),
    path(
        "events/<int:event_id>/registration/",
        participant.EventRegistrationView.as_view(),
        name="participant-event-registration",
    ),
    path(
        "events/<int:event_id>/feedback/",
        participant.EventFeedbackView.as_view(),
        name="participant-event-feedback",
    ),
]

organizer_event_urls = [
    path("", organizer.OrganizerEventDetailView.as_view(), name="organizer-event-detail"),
    path("transition/", organizer.EventTransitionView.as_view(), name="organizer-event-transition"),
    path("stages/", organizer.StageListCreateView.as_view(), name="organizer-stage-list"),
    path("stages/<int:stage_id>/", organizer.StageDetailView.as_view(), name="organizer-stage-detail"),
    path(
        "stages/<int:stage_id>/roles/",
        organizer.StageRoleListCreateView.as_view(),
        name="organizer-stage-role-list",
    ),
    path(
        "stages/<int:stage_id>/roles/<int:role_id>/",
        organizer.StageRoleDetailView.as_view(),
        name="organizer-stage-role-detail",
    ),
    path(
        "attributes/",
        organizer.EventAttributeValueListCreateView.as_view(),
        name="organizer-event-attribute-list",
    ),
    path(
        "attributes/<int:value_id>/",
        organizer.EventAttributeValueDetailView.as_view(),
        name="organizer-event-attribute-detail",
    ),
    path("participants/", organizer.EventParticipantsView.as_view(), name="organizer-event-participants"),
    path("feedback/", organizer.EventFeedbackListView.as_view(), name="organizer-event-feedback"),
    path("results/", organizer.EventResultListCreateView.as_view(), name="organizer-result-list"),
    path(
        "results/<int:result_id>/",
        organizer.EventResultDetailView.as_view(),
        name="organizer-result-detail",
    ),
]

organizer_urls = [
    path("events/", organizer.OrganizerEventListCreateView.as_view(), name="organizer-event-list"),
    path("events/<int:event_id>/", include(organizer_event_urls)),
    path("attributes/", organizer.AttributeListCreateView.as_view(), name="organizer-attribute-list"),
    path(
        "attributes/<int:attribute_id>/",
        organizer.AttributeDetailView.as_view(),
        name="organizer-attribute-detail",
    ),
]

urlpatterns = [
    path("public/", include(public_urls)),
    path("participant/", include(participant_urls)),
    path("organizer/", include(organizer_urls)),
]
