from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models

class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # Superusers manage events from the admin and the API, so they get the
        # organizer role unless one is passed explicitly.
        extra_fields.setdefault("role", User.Role.ORGANIZER)
        return super().create_superuser(username, email, password, **extra_fields)

class User(AbstractUser):
    class Role(models.TextChoices):
        PARTICIPANT = "participant", "Participant"
        ORGANIZER = "organizer", "Organizer"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PARTICIPANT)

    objects = UserManager()

    @property
    def is_organizer(self):
        return self.role == self.Role.ORGANIZER

    @property
    def is_participant(self):
        return self.role == self.Role.PARTICIPANT

    @property
    def display_name(self):
        return self.get_full_name() or self.username
