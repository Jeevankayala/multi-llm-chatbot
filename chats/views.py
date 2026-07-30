import logging
import json
from django.http import StreamingHttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
import os
from dotenv import load_dotenv

from langchain_core.messages import messages_to_dict, messages_from_dict, HumanMessage, AIMessage, BaseMessageChunk, ToolMessage
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mistralai import ChatMistralAI
from langchain_tavily import TavilySearch
from langchain.agents import create_agent

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
    t_calls = getattr(new_chunk, 'tool_calls', None) or getattr(full_message, 'tool_calls', None)
    
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
            additional_kwargs=new_kwargs,
            tool_calls=t_calls
        )
    else:
        return AIMessage(
            content=new_content,
            response_metadata=new_metadata,
            id=msg_id,
            usage_metadata=usage,
            additional_kwargs=new_kwargs,
            tool_calls=t_calls
        )

def normalize_message_content(content):
    """
    Ensures message content is returned as a plain string, normalizing any
    structural message lists (e.g., from Google Generative AI).
    """
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict):
                text_parts.append(part.get("text", ""))
            elif isinstance(part, str):
                text_parts.append(part)
        return "".join(text_parts)
    return str(content) if content is not None else ""


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
        web_search = serializer.validated_data.get('web_search', False)

        # 1. Deserialize message history
        messages_history = messages_from_dict(session.messages)

        # 2. Append new human message
        new_human_message = HumanMessage(content=user_message_text)
        messages_history.append(new_human_message)

        # 3. Load API keys from environment
        load_dotenv()

        # 4. If web_search is enabled, check TAVILY_API_KEY presence
        if web_search:
            if not os.getenv("TAVILY_API_KEY"):
                return Response(
                    {"error": "Tavily API key is missing. Please set TAVILY_API_KEY in your .env file."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # 5. Instantiate selected LLM
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

        # 6. Define streaming generator
        def event_generator():
            try:
                if web_search:
                    tavily_search_tool = TavilySearch(max_results=5, topic="general")
                    agent = create_agent(llm, [tavily_search_tool])
                    
                    current_ai_chunk = None
                    
                    # Run stream of the LangGraph agent in messages mode
                    stream = agent.stream({"messages": messages_history}, stream_mode="messages")
                    for chunk, metadata in stream:
                        node = metadata.get("langgraph_node")
                        
                        if node in ("agent", "model"):
                            current_ai_chunk = accumulate_chunks(current_ai_chunk, chunk)
                            
                            # If this chunk does not contain a tool_calls request, yield it as content token
                            if not (hasattr(chunk, 'tool_calls') and chunk.tool_calls):
                                text_content = normalize_message_content(chunk.content)
                                if text_content:
                                    data = {
                                        "chunk": text_content,
                                        "title": session.title,
                                    }
                                    yield f"data: {json.dumps(data)}\n\n"
                            else:
                                # Yield the tool search query to frontend
                                for tc in chunk.tool_calls:
                                    yield f"data: {json.dumps({'type': 'search_start', 'query': tc.get('args', {}).get('query', '')})}\n\n"
                                
                        elif node == "tools" and isinstance(chunk, ToolMessage):
                            # Append the preceding accumulated AI tool call message first
                            if current_ai_chunk is not None:
                                tool_call_message = AIMessage(
                                    content=normalize_message_content(current_ai_chunk.content),
                                    response_metadata=current_ai_chunk.response_metadata,
                                    id=current_ai_chunk.id,
                                    tool_calls=getattr(current_ai_chunk, "tool_calls", []),
                                    additional_kwargs=current_ai_chunk.additional_kwargs
                                )
                                messages_history.append(tool_call_message)
                                current_ai_chunk = None
                            
                            # Send search results payload to frontend
                            raw_content = chunk.content
                            try:
                                search_data = json.loads(raw_content)
                                results = search_data.get("results", [])
                                yield f"data: {json.dumps({'type': 'search_results', 'results': results})}\n\n"
                            except Exception:
                                pass
                            
                            messages_history.append(chunk)
                    
                    # Append final accumulated AI response
                    if current_ai_chunk is not None:
                        final_ai_message = AIMessage(
                            content=normalize_message_content(current_ai_chunk.content),
                            response_metadata=current_ai_chunk.response_metadata,
                            id=current_ai_chunk.id,
                            usage_metadata=getattr(current_ai_chunk, "usage_metadata", None),
                            additional_kwargs=current_ai_chunk.additional_kwargs
                        )
                        messages_history.append(final_ai_message)
                    else:
                        messages_history.append(AIMessage(content=""))
                else:
                    # Standard Non-Search Flow
                    full_ai_message = None
                    for chunk in llm.stream(messages_history):
                        text_content = normalize_message_content(chunk.content)
                        data = {
                            "chunk": text_content,
                            "title": session.title,
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                        full_ai_message = accumulate_chunks(full_ai_message, chunk)
                        
                    if full_ai_message is not None:
                        ai_message = AIMessage(
                            content=normalize_message_content(full_ai_message.content),
                            response_metadata=full_ai_message.response_metadata,
                            id=full_ai_message.id,
                            usage_metadata=getattr(full_ai_message, "usage_metadata", None),
                            additional_kwargs=full_ai_message.additional_kwargs
                        )
                        messages_history.append(ai_message)
                    else:
                        messages_history.append(AIMessage(content=""))
            except Exception as e:
                logger.exception("Error during LLM stream")
                yield f"data: {json.dumps({'error': f'LLM execution failed: {str(e)}'})}\n\n"
                return

            # 7. Dynamically update title if it's still 'New Chat' and this is the first interaction
            # Note: since we already added the HumanMessage, the session messages field in the DB is still empty.
            if session.title == 'New Chat' and len(session.messages) == 0:
                title_candidate = user_message_text.strip()
                if len(title_candidate) > 40:
                    title_candidate = title_candidate[:37] + "..."
                session.title = title_candidate

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
