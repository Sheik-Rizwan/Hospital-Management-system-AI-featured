# core/exceptions.py — Custom exception classes for clean error handling
# Usage: from core.exceptions import AuthenticationError, NotFoundError


class AppError(Exception):
    """Base exception for the application."""
    status_code = 500

    def __init__(self, message='An unexpected error occurred', status_code=None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code

    def to_dict(self):
        return {'success': False, 'error': self.message}


class AuthenticationError(AppError):
    """Raised when authentication fails."""
    status_code = 401

    def __init__(self, message='Authentication failed'):
        super().__init__(message, 401)


class AuthorizationError(AppError):
    """Raised when user lacks required permissions."""
    status_code = 403

    def __init__(self, message='Permission denied'):
        super().__init__(message, 403)


class NotFoundError(AppError):
    """Raised when a requested resource does not exist."""
    status_code = 404

    def __init__(self, message='Resource not found'):
        super().__init__(message, 404)


class ValidationError(AppError):
    """Raised when request data fails validation."""
    status_code = 400

    def __init__(self, message='Invalid request data', errors=None):
        super().__init__(message, 400)
        self.errors = errors or []

    def to_dict(self):
        d = super().to_dict()
        if self.errors:
            d['errors'] = self.errors
        return d


class DatabaseError(AppError):
    """Raised when a database operation fails."""
    status_code = 500

    def __init__(self, message='Database operation failed'):
        super().__init__(message, 500)
