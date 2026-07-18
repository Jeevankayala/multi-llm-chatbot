from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from unittest.mock import patch
from langchain_core.messages import AIMessage

from .models import ChatSession

class ChatTests(APITestCase):
    def setUp(self):
        # Create users
        self.user1 = User.objects.create_user(username='user1', password='Password123!')
        self.user2 = User.objects.create_user(username='user2', password='Password123!')
        
        # Create tokens
        self.token1 = Token.objects.create(user=self.user1)
        self.token2 = Token.objects.create(user=self.user2)

        # Create some sessions
        self.session1 = ChatSession.objects.create(user=self.user1, title='User 1 Chat')
        self.session2 = ChatSession.objects.create(user=self.user2, title='User 2 Chat')

        self.list_url = reverse('chat-list')
        self.detail_url = lambda pk: reverse('chat-detail', kwargs={'pk': pk})
        self.message_url = lambda pk: reverse('chat-message', kwargs={'pk': pk})

    def test_unauthenticated_blocked(self):
        """
        Verify that unauthenticated requests are rejected.
        """
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_sessions_only_own(self):
        """
        Verify that users can only list their own chat sessions.
        """
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        response = self.client.get(self.list_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only return 1 session belonging to user1
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'User 1 Chat')
        # Ensure 'messages' is excluded in the list view
        self.assertNotIn('messages', response.data[0])

    def test_create_session(self):
        """
        Verify that a user can successfully create a new session.
        """
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        response = self.client.post(self.list_url, {'title': 'Newly Created Chat'}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'Newly Created Chat')
        self.assertTrue(ChatSession.objects.filter(id=response.data['id'], user=self.user1).exists())

    def test_retrieve_session_detail(self):
        """
        Verify detail endpoint includes messages.
        """
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        response = self.client.get(self.detail_url(self.session1.id))
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'User 1 Chat')
        self.assertIn('messages', response.data)
        self.assertEqual(response.data['messages'], [])

    def test_retrieve_other_user_session_fails(self):
        """
        Verify that a user cannot access another user's chat session.
        """
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        # Try to retrieve user2's session
        response = self.client.get(self.detail_url(self.session2.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_session(self):
        """
        Verify a user can delete their own session.
        """
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        response = self.client.delete(self.detail_url(self.session1.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ChatSession.objects.filter(id=self.session1.id).exists())

    @patch('langchain_openai.ChatOpenAI.stream')
    def test_send_message_openai_success(self, mock_stream):
        """
        Verify sending a message to OpenAI provider updates chat session correctly.
        """
        mock_stream.return_value = [
            AIMessage(content="Hello "),
            AIMessage(content="from "),
            AIMessage(content="OpenAI Mock!")
        ]
        
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        data = {
            'message': 'Hi, I am testing OpenAI',
            'model_provider': 'openai'
        }
        
        # We use a session with default title 'New Chat' to verify title auto-updates
        new_session = ChatSession.objects.create(user=self.user1, title='New Chat')
        
        response = self.client.post(self.message_url(new_session.id), data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Decode streaming content
        content_str = b"".join(response.streaming_content).decode('utf-8')
        self.assertIn('"chunk": "Hello "', content_str)
        self.assertIn('"chunk": "OpenAI Mock!"', content_str)
        self.assertIn('"done": true', content_str)
        
        # Verify saved session updates in db
        new_session.refresh_from_db()
        self.assertEqual(new_session.title, "Hi, I am testing OpenAI")
        self.assertEqual(len(new_session.messages), 2) # 1 human message, 1 ai message
        self.assertEqual(new_session.messages[0]['data']['content'], 'Hi, I am testing OpenAI')
        self.assertEqual(new_session.messages[1]['data']['content'], 'Hello from OpenAI Mock!')

    @patch('langchain_google_genai.ChatGoogleGenerativeAI.stream')
    def test_send_message_google_success(self, mock_stream):
        """
        Verify sending a message to Google provider.
        """
        mock_stream.return_value = [AIMessage(content="Hello from Google Mock!")]
        
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        data = {
            'message': 'Testing Google model',
            'model_provider': 'google'
        }
        
        response = self.client.post(self.message_url(self.session1.id), data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content_str = b"".join(response.streaming_content).decode('utf-8')
        self.assertIn('Hello from Google Mock!', content_str)

    @patch('langchain_mistralai.ChatMistralAI.stream')
    def test_send_message_mistral_success(self, mock_stream):
        """
        Verify sending a message to Mistral provider.
        """
        mock_stream.return_value = [AIMessage(content="Hello from Mistral Mock!")]
        
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)
        data = {
            'message': 'Testing Mistral model',
            'model_provider': 'mistral'
        }
        
        response = self.client.post(self.message_url(self.session1.id), data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content_str = b"".join(response.streaming_content).decode('utf-8')
        self.assertIn('Hello from Mistral Mock!', content_str)
