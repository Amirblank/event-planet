from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import (
    AuthResponseSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)

def auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"token": token.key, "user": UserSerializer(user).data}

@extend_schema(tags=["Auth"], request=RegisterSerializer, responses={201: AuthResponseSerializer})
class RegisterView(APIView):


    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(auth_payload(user), status=status.HTTP_201_CREATED)


@extend_schema(tags=["Auth"], request=LoginSerializer, responses={200: AuthResponseSerializer})
class LoginView(APIView):

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response(auth_payload(serializer.validated_data["user"]))

@extend_schema(tags=["Auth"], request=None, responses={204: None})
class LogoutView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@extend_schema(tags=["Auth"])
class MeView(generics.RetrieveUpdateAPIView):

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user
