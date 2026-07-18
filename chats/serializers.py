from rest_framework import serializers
from .models import ChatSession

class ChatSessionListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing chat sessions (excluding full message lists).
    """
    class Meta:
        model = ChatSession
        fields = ('id', 'title', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')


class ChatSessionDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for detailed view of a single chat session, including all messages.
    """
    class Meta:
        model = ChatSession
        fields = ('id', 'title', 'messages', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')


class ChatMessageSerializer(serializers.Serializer):
    """
    Serializer to validate incoming chat messages sent by the user.
    """
    MODEL_PROVIDER_CHOICES = (
        ('openai', 'OpenAI (gpt-4o-mini)'),
        ('google', 'Google (gemini-2.5-flash)'),
        ('mistral', 'Mistral (mistral-small-latest)'),
    )

    message = serializers.CharField(
        required=True, 
        allow_blank=False, 
        help_text="The prompt to send to the AI model."
    )
    model_provider = serializers.ChoiceField(
        choices=MODEL_PROVIDER_CHOICES,
        default='openai',
        help_text="The LLM provider to process this message."
    )
