from rest_framework.exceptions import ErrorDetail
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    """Add the machine-readable error code next to DRF's human-readable detail."""
    response = drf_exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict):
        detail = response.data.get("detail")
        if isinstance(detail, ErrorDetail):
            response.data["code"] = detail.code
    return response
