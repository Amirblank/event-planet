from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .models import User

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role")
        read_only_fields = ("id", "username", "role")

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("username", "email", "password", "first_name", "last_name", "role")
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
            "role": {"required": False},
        }

    def validate(self, attrs):
        candidate = User(**{key: value for key, value in attrs.items() if key != "password"})
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError(
                {"detail": "Username or password is incorrect."}, code="authorization"
            )
        attrs["user"] = user
        return attrs

class AuthResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()
