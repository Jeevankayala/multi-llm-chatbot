import logging
import json
from django.http import StreamingHttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from dotenv import load_dotenv

from langchain_core.messages import messages_to_dict, messages_from_dict, HumanMessage, AIMessage, BaseMessageChunk
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mistralai import ChatMistralAI

from .models import ChatSession
from .serializers import (
    ChatSessionListSerializer, 
    ChatSessionDetailSerializer, 
    ChatMessageSerializer
)

logger = logging.getLogger(__name__)

def accumulate_chunks(full_message, new_chunk):
    """
    Safely accumulates two message objects. Delegates to native '+' addition for BaseMessageChunks,
    or falls back to manual field merging to support standard AIMessages (e.g. from test mocks).
    """
    if full_message is None:
        return new_chunk
    
    if isinstance(full_message, BaseMessageChunk) and isinstance(new_chunk, BaseMessageChunk):
        return full_message + new_chunk
    
    new_content = full_message.content + new_chunk.content
    
    new_metadata = {}
    if hasattr(full_message, 'response_metadata') and full_message.response_metadata:
        new_metadata.update(full_message.response_metadata)
    if hasattr(new_chunk, 'response_metadata') and new_chunk.response_metadata:
        new_metadata.update(new_chunk.response_metadata)
        
    msg_id = getattr(new_chunk, 'id', None) or getattr(full_message, 'id', None)
    usage = getattr(new_chunk, 'usage_metadata', None) or getattr(full_message, 'usage_metadata', None)
    
    new_kwargs = {}
    if hasattr(full_message, 'additional_kwargs') and full_message.additional_kwargs:
        new_kwargs.update(full_message.additional_kwargs)
    if hasattr(new_chunk, 'additional_kwargs') and new_chunk.additional_kwargs:
        new_kwargs.update(new_chunk.additional_kwargs)

    if isinstance(new_chunk, BaseMessageChunk):
        return type(new_chunk)(
            content=new_content,
            response_metadata=new_metadata,
            id=msg_id,
            usage_metadata=usage,
            additional_kwargs=new_kwargs
        )
    else:
        return AIMessage(
            content=new_content,
            response_metadata=new_metadata,
            id=msg_id,
            usage_metadata=usage,
            additional_kwargs=new_kwargs
        )


class ChatSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet to manage user chat sessions and process messages using LangChain.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Users can only view/manage their own sessions
        return ChatSession.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'list':
            return ChatSessionListSerializer
        return ChatSessionDetailSerializer

    def perform_create(self, serializer):
        # Automatically associate the session with the logged-in user
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='message')
    def message(self, request, pk=None):
        """
        Send a new message to the chat session and return a real-time SSE stream of the LLM response.
        """
        session = self.get_object()
        serializer = ChatMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_message_text = serializer.validated_data['message']
        model_provider = serializer.validated_data['model_provider']

        # 1. Deserialize message history
        messages_history = messages_from_dict(session.messages)

        # 2. Append new human message
        new_human_message = HumanMessage(content=user_message_text)
        messages_history.append(new_human_message)

        # 3. Load API keys from environment
        load_dotenv()

        # 4. Instantiate selected LLM
        try:
            if model_provider == 'openai':
                llm = ChatOpenAI(model="gpt-4o-mini")
            elif model_provider == 'google':
                llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
            elif model_provider == 'mistral':
                llm = ChatMistralAI(model="mistral-small-latest")
            else:
                return Response(
                    {"error": f"Unsupported model provider: {model_provider}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.exception("Error initializing LLM provider %s", model_provider)
            return Response(
                {"error": f"LLM initialization failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # 5. Define streaming generator
        def event_generator():
            full_ai_message = None
            
            try:
                # Iterate over the LangChain stream
                for chunk in llm.stream(messages_history):
                    # Yield JSON SSE format
                    data = {
                        "chunk": chunk.content,
                        "title": session.title,
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    full_ai_message = accumulate_chunks(full_ai_message, chunk)
            except Exception as e:
                logger.exception("Error during LLM stream")
                yield f"data: {json.dumps({'error': f'LLM execution failed: {str(e)}'})}\n\n"
                return

            # 6. Dynamically update title if it's still 'New Chat' and this is the first interaction
            # Note: since we already added the HumanMessage, the session messages field in the DB is still empty.
            if session.title == 'New Chat' and len(session.messages) == 0:
                title_candidate = user_message_text.strip()
                if len(title_candidate) > 40:
                    title_candidate = title_candidate[:37] + "..."
                session.title = title_candidate

            # 7. Append AI response to message history and serialize back to DB
            if full_ai_message is not None:
                # Convert AIMessageChunk to standard AIMessage to preserve identical DB schema
                ai_message = AIMessage(
                    content=full_ai_message.content,
                    response_metadata=full_ai_message.response_metadata,
                    id=full_ai_message.id,
                    usage_metadata=getattr(full_ai_message, "usage_metadata", None),
                    additional_kwargs=full_ai_message.additional_kwargs
                )
                messages_history.append(ai_message)
            else:
                messages_history.append(AIMessage(content=""))
                
            session.messages = messages_to_dict(messages_history)
            session.save()

            # 8. Yield a final done message with the completed states
            final_data = {
                "done": True,
                "title": session.title,
                "messages": session.messages
            }
            yield f"data: {json.dumps(final_data)}\n\n"

        response = StreamingHttpResponse(event_generator(), content_type='text/event-stream')
        response['X-Accel-Buffering'] = 'no'
        response['Cache-Control'] = 'no-cache'
        return response
