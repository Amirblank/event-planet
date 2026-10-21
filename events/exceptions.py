from rest_framework import status
from rest_framework.exceptions import APIException


class RuleViolation(APIException):
    """The request is well-formed but breaks a business rule in the current state."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action is not allowed in the current state."
    default_code = "rule_violation"
