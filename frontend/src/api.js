const BASE_URL = '/api';

/**
 * Helper to get default headers, including Auth Token if stored in localStorage.
 */
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('auth_token');
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }
  return headers;
}

/**
 * Processes response and returns JSON or throws structured error
 */
async function handleResponse(response) {
  const contentType = response.headers.get('content-type');
  let data = null;
  
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    // If auth token is invalid/expired, clear storage so user logs back in
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('current_user');
      // Trigger a page reload to reset application state
      window.location.reload();
    }
    
    // Throw parsed error data
    throw {
      status: response.status,
      data: data
    };
  }

  return data;
}

export const api = {
  /**
   * Log in user
   */
  async login(username, password) {
    const res = await fetch(`${BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return handleResponse(res);
  },

  /**
   * Register new user
   */
  async register(username, email, password) {
    const res = await fetch(`${BASE_URL}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    return handleResponse(res);
  },

  /**
   * List all chat sessions for the logged-in user
   */
  async listChats() {
    const res = await fetch(`${BASE_URL}/chats/`, {
      method: 'GET',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  /**
   * Start a new chat session
   */
  async createChat(title = "New Chat") {
    const res = await fetch(`${BASE_URL}/chats/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title })
    });
    return handleResponse(res);
  },

  /**
   * Fetch chat details (including messages list)
   */
  async getChat(id) {
    const res = await fetch(`${BASE_URL}/chats/${id}/`, {
      method: 'GET',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  /**
   * Send a message to a session and get LLM response
   */
  async sendMessage(id, message, modelProvider = 'openai') {
    const res = await fetch(`${BASE_URL}/chats/${id}/message/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message, model_provider: modelProvider })
    });
    return handleResponse(res);
  },

  /**
   * Delete a chat session
   */
  async deleteChat(id) {
    const res = await fetch(`${BASE_URL}/chats/${id}/`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (res.status === 204) {
      return true; // No content response on successful deletion
    }
    return handleResponse(res);
  },

  /**
   * Rename a chat session title
   */
  async renameChat(id, title) {
    const res = await fetch(`${BASE_URL}/chats/${id}/`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ title })
    });
    return handleResponse(res);
  }
};
