from rest_framework.permissions import BasePermission

class IsParticipant(BasePermission):
    message = "This action is available to participant accounts only."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_participant)

class IsOrganizer(BasePermission):
    message = "This action is available to organizer accounts only."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_organizer)