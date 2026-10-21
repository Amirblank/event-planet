from django.contrib import admin
from .models import Attribute, Event, EventAttributeValue, Feedback, Registration, Result, Stage, StageRole

class StageInline(admin.TabularInline):
    model = Stage
    extra = 0

class EventAttributeValueInline(admin.TabularInline):
    model = EventAttributeValue
    extra = 0

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("title", "event_type", "status", "organizer", "starts_at", "capacity")
    list_filter = ("status", "event_type")
    search_fields = ("title", "location")
    inlines = [StageInline, EventAttributeValueInline]

class StageRoleInline(admin.TabularInline):
    model = StageRole
    extra = 0

@admin.register(Stage)
class StageAdmin(admin.ModelAdmin):
    list_display = ("name", "event", "order", "starts_at", "ends_at")
    inlines = [StageRoleInline]

@admin.register(Attribute)
class AttributeAdmin(admin.ModelAdmin):
    list_display = ("name", "data_type", "created_by")
    list_filter = ("data_type",)
    search_fields = ("name",)

@admin.register(Registration)
class RegistrationAdmin(admin.ModelAdmin):
    list_display = ("event", "participant", "created_at")


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("event", "participant", "rating", "created_at")


@admin.register(Result)
class ResultAdmin(admin.ModelAdmin):
    list_display = ("event", "stage", "title", "position", "score")
