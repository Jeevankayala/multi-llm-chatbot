# Enterprise Multi-LLM Chatbot

An advanced, full-stack ChatGPT-like assistant featuring a premium glassmorphic dark UI, real-time Server-Sent Events (SSE) streaming, and dynamic on-the-fly LLM provider switching (OpenAI, Google Gemini, and Mistral) without breaking the conversation state.

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-5.0-092E20?style=flat&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![Django REST Framework](https://img.shields.io/badge/DRF-3.15-red?style=flat)](https://www.django-rest-framework.org/)
[![LangChain](https://img.shields.io/badge/LangChain-0.1-1C3C3A?style=flat&logoColor=white)](https://www.langchain.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat&logo=vite&logoColor=white)](https://vite.dev/)

---

## 🚀 Key Features

*   **Dynamic LLM Switching**: Swap between model providers (OpenAI `gpt-4o-mini`, Google Gemini `gemini-2.5-flash`, and Mistral `mistral-small-latest`) on-the-fly during a single active conversation thread.
*   **Real-time Streaming (SSE)**: Chat responses are pushed from the backend to the frontend token-by-token using `StreamingHttpResponse` and HTML5 Server-Sent Events.
*   **Dual-Login Registration**: Fully-featured user signup and login APIs supporting authentication using either usernames or email addresses.
*   **Deferred Session Creation**: Prevents sidebar clutter by postponing database creation of new chat threads until the first query is actually sent.
*   **Safe Markdown Rendering**: Displays rich AI responses, tables, and code snippets natively using `react-markdown` and specialized glassmorphic stylesheet tags. Includes a custom React class-based Error Boundary to prevent crashes on partial/broken streaming chunks.
*   **Conversational Operations**: Supports renaming chat thread titles, deleting threads via a 3-dots actions menu, and viewing conversation lists.
*   **Viewport Scroll Toggle**: A floating action button that dynamically toggles between scrolling smoothly to the very top (first message) and the bottom (latest message) based on the scroll position.

---

## 🛠️ Tech Stack

### Backend
*   **Python**: Core programming language.
*   **Django**: High-level web framework.
*   **Django REST Framework**: Built-in endpoints and Token Authentication.
*   **LangChain**: Standardized adapters (`ChatOpenAI`, `ChatGoogleGenerativeAI`, `ChatMistralAI`) for loading histories, streaming, and aggregating tokens.

### Frontend
*   **React 19 & Vite**: Ultra-fast hot-reloading user interface compilation.
*   **Lucide React**: Premium icon pack.
*   **React Markdown**: Renders response markup into clean HTML DOM nodes.

---

## 📁 Project Structure

```
chatbot_project/          # Django Project Root
│   ├── settings.py       # Configuration and DRF integrations
│   └── urls.py           # Global routing configurations
├── accounts/             # Registration, Login views and serializations
├── chats/                # ChatSession models, viewsets, and LLM integrations
├── frontend/             # React application (Vite template)
│   ├── src/
│   │   ├── api.js        # Axios-driven API client (auth, CRUD)
│   │   ├── App.jsx       # State management, SSE streams, UI views
│   │   └── App.css       # Custom dark glassmorphic styling system
│   └── vite.config.js    # API reverse-proxy setup
├── .env                  # API keys and environment variables (ignored by git)
└── .gitignore            # Excludes build, DB, keys, and dependency caches
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   Python 3.12+
*   Node.js v25.9.0+ and NPM v11.12.1+

---

### 2. Backend Setup

Clone this repository and open the terminal in the root folder:

1.  **Create and activate a virtual environment**:
    ```powershell
    # Windows PowerShell
    uv venv
    .venv\Scripts\activate
    ```
2.  **Install dependencies**:
    ```powershell
    uv pip install -r requirements.txt
    ```
3.  **Configure environment variables**:
    Create a `.env` file in the root folder (same directory as `manage.py`):
    ```env
    OPENAI_API_KEY=your-openai-api-key-here
    GOOGLE_API_KEY=your-google-api-key-here
    MISTRAL_API_KEY=your-mistral-api-key-here
    ```
4.  **Run migrations**:
    ```powershell
    python manage.py migrate
    ```
5.  **Create an admin superuser (Optional, to view Django Admin Panel)**:
    ```powershell
    python manage.py createsuperuser
    ```
6.  **Start the backend server**:
    ```powershell
    python manage.py runserver 127.0.0.1:8000
    ```

---

### 3. Frontend Setup

Open a new terminal window in the `frontend/` directory:

1.  **Install Node dependencies**:
    ```bash
    npm install
    ```
2.  **Start the Vite development server**:
    ```bash
    npm run dev
    ```
    The server will startup (typically on [http://localhost:5173](http://localhost:5173) or [http://localhost:5174](http://localhost:5174)). Vite is pre-configured with a reverse-proxy mapping `/api/` requests to the running Django backend, bypassing CORS constraints automatically.

---

## 🧪 Running Tests

To run the automated test suite covering DRF authentication models, chat endpoints, and LLM stream mocks:

```powershell
python manage.py test
```

---

## 💡 How It Works (Design Patterns)

### Real-Time Streaming & Metadata Retention
Rather than yielding raw text, the Django generator accumulatively combines token chunks using LangChain's native addition (`chunk1 + chunk2`). This resolves metadata fields (like token usage or models) in real-time. Upon completion, the backend maps this accumulated message chunk to a standard `AIMessage` containing all populated properties (`content`, `response_metadata`, `usage_metadata`, `id`) and saves it to the SQLite database.

### Incomplete Token Crash Prevention (Error Boundary)
Streaming incomplete markdown syntax (like a half-written bold block or unclosed list tag) can throw errors in traditional React rendering engines. The custom class-based `SafeMarkdown` component catches rendering exceptions from `react-markdown` locally and falls back to rendering raw text. Once a new chunk arrives, it resets the error state and attempts parsing again.
