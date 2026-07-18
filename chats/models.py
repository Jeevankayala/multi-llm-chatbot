import uuid
from django.db import models
from django.contrib.auth.models import User

class ChatSession(models.Model):
    """
    Represents a single chat session / conversation thread for a user.
    Stores the list of serialized LangChain messages.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    title = models.CharField(max_length=255, default='New Chat')
    # Storing LangChain messages as a JSON array (serialized via messages_to_dict)
    messages = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.title} ({self.user.username})"
