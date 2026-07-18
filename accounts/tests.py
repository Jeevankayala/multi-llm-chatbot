from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

class AuthTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('auth_register')
        self.login_url = reverse('auth_login')
        
        # Create a test user for login testing
        self.user_data = {
            'username': 'testuser',
            'email': 'testuser@example.com',
            'password': 'StrongPassword123!'
        }
        self.user = User.objects.create_user(
            username=self.user_data['username'],
            email=self.user_data['email'],
            password=self.user_data['password']
        )

    def test_registration_success(self):
        """
        Verify that a user can register successfully with valid details.
        """
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'AnotherStrongPass321!'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['username'], 'newuser')
        self.assertEqual(response.data['user']['email'], 'newuser@example.com')
        self.assertTrue(User.objects.filter(username='newuser').exists())

    def test_registration_duplicate_username(self):
        """
        Verify registration fails when the username already exists.
        """
        data = {
            'username': 'testuser', # duplicate
            'email': 'different@example.com',
            'password': 'StrongPassword123!'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_registration_duplicate_email(self):
        """
        Verify registration fails when the email already exists.
        """
        data = {
            'username': 'differentuser',
            'email': 'testuser@example.com', # duplicate
            'password': 'StrongPassword123!'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_registration_invalid_password(self):
        """
        Verify registration fails with an invalid/weak password.
        """
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': '123' # too short/weak
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_login_success_username(self):
        """
        Verify login succeeds using correct username and password.
        """
        data = {
            'username': 'testuser',
            'password': 'StrongPassword123!'
        }
        response = self.client.post(self.login_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['username'], 'testuser')

    def test_login_success_email(self):
        """
        Verify login succeeds using correct email and password.
        """
        data = {
            'username': 'testuser@example.com', # email instead of username
            'password': 'StrongPassword123!'
        }
        response = self.client.post(self.login_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], 'testuser')

    def test_login_failure_invalid_credentials(self):
        """
        Verify login fails with incorrect password.
        """
        data = {
            'username': 'testuser',
            'password': 'WrongPassword!'
        }
        response = self.client.post(self.login_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('token', response.data)
        self.assertIn('non_field_errors', response.data)
