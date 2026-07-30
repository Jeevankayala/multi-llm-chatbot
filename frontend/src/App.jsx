import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Trash2, 
  Send, 
  Plus, 
  LogOut, 
  Lock, 
  Mail, 
  User as UserIcon, 
  Bot, 
  Loader2, 
  UserCheck,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  Globe,
  ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from './api';
import './App.css';

class SafeMarkdown extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, prevContent: props.children };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("SafeMarkdown caught rendering error:", error, errorInfo);
  }

  static getDerivedStateFromProps(props, state) {
    if (props.children !== state.prevContent) {
      return { hasError: false, prevContent: props.children };
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{this.props.children}</div>;
    }
    return <ReactMarkdown>{this.props.children}</ReactMarkdown>;
  }
}

function App() {
  // --- STATE DECLARATIONS ---
  // Auth State
  const [token, setToken] = useState(localStorage.getItem('auth_token') || '');
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('current_user') || 'null');
    } catch {
      return null;
    }
  });

  // Auth Inputs
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Chat State
  const [chatSessions, setChatSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSessionDetails, setActiveSessionDetails] = useState(null);
  const [selectedModel, setSelectedModel] = useState('openai');
  const [activeMenuSessionId, setActiveMenuSessionId] = useState(null);

  // Loading / UI States
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingChatDetails, setLoadingChatDetails] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMessageText, setNewMessageText] = useState('');

  // Web Search States
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [activeSearchResults, setActiveSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Scroll Toggle States & Refs
  const [scrollDirection, setScrollDirection] = useState('up'); // 'up' or 'down'
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // --- ACTIONS & EFFECTS ---

  // Scroll handlers
  const handleContainerScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    
    // Show scroll button only if content is scrollable
    const scrollable = scrollHeight > clientHeight + 10;
    setShowScrollBtn(scrollable);
    
    // If scrolled near the top (e.g. within 150px), direction is down. Else up.
    if (scrollTop < 150) {
      setScrollDirection('down');
    } else {
      setScrollDirection('up');
    }
  };

  const handleScrollButtonClick = () => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    if (scrollDirection === 'up') {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  // Scroll to bottom of message list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeSessionDetails?.messages || sendingMessage) {
      scrollToBottom();
    }
    // Check scroll state after DOM layout stabilizes
    const timer = setTimeout(() => {
      handleContainerScroll();
    }, 150);
    return () => clearTimeout(timer);
  }, [activeSessionDetails?.messages, sendingMessage]);

  // Fetch session list on login
  useEffect(() => {
    if (token) {
      fetchChatSessions();
    }
  }, [token]);

  // Fetch individual session details when selected
  useEffect(() => {
    if (activeSessionId && token) {
      if (activeSessionId === 'new_unsaved') {
        setActiveSessionDetails({ id: 'new_unsaved', title: 'New Chat', messages: [] });
      } else {
        // Only fetch if details are not already loaded for this session
        if (!activeSessionDetails || activeSessionDetails.id !== activeSessionId) {
          fetchChatDetails(activeSessionId);
        }
      }
    } else {
      setActiveSessionDetails(null);
    }
  }, [activeSessionId]);

  // Close 3-dots menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuSessionId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Load chat sessions from backend
  const fetchChatSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await api.listChats();
      setChatSessions(data);
    } catch (err) {
      console.error("Error loading chat sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Load details (messages list) for a session
  const fetchChatDetails = async (sessionId) => {
    setLoadingChatDetails(true);
    try {
      const data = await api.getChat(sessionId);
      setActiveSessionDetails(data);
    } catch (err) {
      console.error("Error loading chat details:", err);
    } finally {
      setLoadingChatDetails(false);
    }
  };

  // Auth Handler: Register/Login
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    // Frontend validations
    if (!username.trim()) {
      setAuthError({ non_field_errors: ["Username is required"] });
      setIsAuthLoading(false);
      return;
    }

    if (isRegisterMode) {
      if (!email.trim()) {
        setAuthError({ non_field_errors: ["Email is required"] });
        setIsAuthLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setAuthError({ non_field_errors: ["Passwords do not match"] });
        setIsAuthLoading(false);
        return;
      }
    }

    try {
      if (isRegisterMode) {
        // Register API also returns user details & token
        const res = await api.register(username, email, password);
        localStorage.setItem('auth_token', res.token);
        localStorage.setItem('current_user', JSON.stringify(res.user));
        setToken(res.token);
        setCurrentUser(res.user);
      } else {
        const res = await api.login(username, password);
        localStorage.setItem('auth_token', res.token);
        localStorage.setItem('current_user', JSON.stringify(res.user));
        setToken(res.token);
        setCurrentUser(res.user);
      }
      // Reset form
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error("Authentication failed:", err);
      if (err.data) {
        setAuthError(err.data);
      } else {
        setAuthError({ non_field_errors: ["Unable to connect to the server. Please check your backend."] });
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Logout Handler
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    setToken('');
    setCurrentUser(null);
    setChatSessions([]);
    setActiveSessionId(null);
    setActiveSessionDetails(null);
  };

  // Start new Chat session (Local only, created in DB on first message)
  const handleNewChat = () => {
    setActiveSessionId('new_unsaved');
  };

  // Rename session
  const handleRenameChat = async (sessionId, currentTitle) => {
    const newTitle = prompt("Enter new title for this chat:", currentTitle);
    if (newTitle === null) return; // user cancelled
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      alert("Title cannot be empty!");
      return;
    }
    
    try {
      const res = await api.renameChat(sessionId, trimmedTitle);
      
      // Update local sessions list
      setChatSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return { ...s, title: res.title };
        }
        return s;
      }));

      // Update active session details if currently selected
      if (activeSessionId === sessionId) {
        setActiveSessionDetails(prev => {
          if (!prev) return null;
          return { ...prev, title: res.title };
        });
      }
    } catch (err) {
      console.error("Failed to rename chat:", err);
      alert("Failed to rename chat session.");
    } finally {
      setActiveMenuSessionId(null);
    }
  };

  // Delete session
  const handleDeleteChat = async (e, sessionId) => {
    e.stopPropagation(); // Avoid selecting the chat on click
    if (confirm("Are you sure you want to delete this chat session?")) {
      try {
        await api.deleteChat(sessionId);
        setChatSessions(prev => prev.filter(c => c.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setActiveSessionDetails(null);
        }
      } catch (err) {
        console.error("Failed to delete chat session:", err);
      }
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || sendingMessage || !activeSessionId) return;

    const userPrompt = newMessageText;
    const isSearchActive = webSearchEnabled;
    setNewMessageText('');
    setSendingMessage(true);

    if (isSearchActive) {
      setIsSearching(true);
      setActiveSearchQuery('Searching the web...');
      setActiveSearchResults([]);
    } else {
      setIsSearching(false);
      setActiveSearchQuery('');
      setActiveSearchResults([]);
    }

    // Optimistic UI update: show human message instantly
    const dummyHumanMessage = {
      type: 'human',
      data: { content: userPrompt }
    };
    
    setActiveSessionDetails(prev => {
      const currentMessages = prev ? (prev.messages || []) : [];
      return {
        id: prev ? prev.id : 'new_unsaved',
        title: prev ? prev.title : 'New Chat',
        messages: [...currentMessages, dummyHumanMessage]
      };
    });

    try {
      let currentSessionId = activeSessionId;

      // Defer creation: if new unsaved session, create it in DB now
      if (currentSessionId === 'new_unsaved') {
        const newChat = await api.createChat("New Chat");
        currentSessionId = newChat.id;
        
        // Update details state ID in same batch to avoid selection fetch race condition
        setActiveSessionDetails(prev => {
          if (!prev) return null;
          return {
            ...prev,
            id: newChat.id
          };
        });

        // Add to sidebar list
        setChatSessions(prev => [newChat, ...prev]);
        
        // Set active session ID state
        setActiveSessionId(newChat.id);
      }

      // Build Headers manually for Fetch Stream
      const tokenVal = localStorage.getItem('auth_token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (tokenVal) {
        headers['Authorization'] = `Token ${tokenVal}`;
      }

      const response = await fetch(`/api/chats/${currentSessionId}/message/`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ 
          message: userPrompt, 
          model_provider: selectedModel,
          web_search: isSearchActive 
        })
      });

      if (!response.ok) {
        let errData = {};
        try {
          errData = await response.json();
        } catch {}
        throw { status: response.status, data: errData };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let partialChunk = "";
      let aiContent = "";

      // Initialize the AI message bubble in optimistic details state
      setActiveSessionDetails(prev => {
        const currentMessages = prev ? (prev.messages || []) : [];
        return {
          id: currentSessionId,
          title: prev ? prev.title : 'New Chat',
          messages: [
            ...currentMessages,
            { 
              type: 'ai', 
              data: { content: "" }, 
              isSearchActive: isSearchActive,
              searchQuery: isSearchActive ? 'Searching the web...' : '',
              sources: [] 
            }
          ]
        };
      });

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        partialChunk += decoder.decode(value, { stream: true });
        
        // SSE responses are separated by double newlines "\n\n"
        const parts = partialChunk.split("\n\n");
        // Keep the last part if it is incomplete
        partialChunk = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              
              if (data.error) {
                throw new Error(data.error);
              }

              if (data.type === 'search_start') {
                // Behavior 1: Tool search query received, update loading bar query text
                setIsSearching(true);
                const qText = data.query ? `Searching for "${data.query}"...` : 'Searching the web...';
                setActiveSearchQuery(qText);

                setActiveSessionDetails(prev => {
                  if (!prev) return null;
                  const msgs = [...(prev.messages || [])];
                  if (msgs.length > 0 && msgs[msgs.length - 1].type === 'ai') {
                    msgs[msgs.length - 1] = {
                      ...msgs[msgs.length - 1],
                      isSearchActive: true,
                      searchQuery: qText
                    };
                  }
                  return { ...prev, messages: msgs };
                });
              }
              else if (data.type === 'search_results') {
                // Behavior 2: Tool response came! Hide loading bar & show sources IMMEDIATELY!
                setIsSearching(false);
                setActiveSearchQuery('');
                setActiveSearchResults(data.results || []);

                setActiveSessionDetails(prev => {
                  if (!prev) return null;
                  const msgs = [...(prev.messages || [])];
                  if (msgs.length > 0 && msgs[msgs.length - 1].type === 'ai') {
                    msgs[msgs.length - 1] = {
                      ...msgs[msgs.length - 1],
                      isSearchActive: false,
                      searchQuery: '',
                      sources: data.results || []
                    };
                  }
                  return { ...prev, messages: msgs };
                });
              }
              else if (data.chunk) {
                // Behavior 3: Streaming final LLM response above sources!
                setIsSearching(false);
                setActiveSearchQuery('');
                aiContent += data.chunk;
                
                // Update the last message in the activeSessionDetails state
                setActiveSessionDetails(prev => {
                  if (!prev) return null;
                  const msgs = [...(prev.messages || [])];
                  if (msgs.length > 0 && msgs[msgs.length - 1].type === 'ai') {
                    const currentMsg = msgs[msgs.length - 1];
                    msgs[msgs.length - 1] = {
                      ...currentMsg,
                      isSearchActive: false,
                      data: { ...currentMsg.data, content: aiContent },
                      sources: currentMsg.sources && currentMsg.sources.length > 0 ? currentMsg.sources : activeSearchResults
                    };
                  }
                  return { ...prev, messages: msgs };
                });
              }
              else if (data.done) {
                setIsSearching(false);
                setActiveSearchQuery('');
                setActiveSearchResults([]);

                // Final full message history sync
                setActiveSessionDetails({
                  id: currentSessionId,
                  title: data.title,
                  messages: data.messages
                });

                // Update sidebar session title
                setChatSessions(prev => prev.map(s => {
                  if (s.id === currentSessionId) {
                    return { ...s, title: data.title };
                  }
                  return s;
                }));
                break;
              }
            } catch (err) {
              console.error("Error parsing SSE chunk:", err);
            }
          }
        }
      }

    } catch (err) {
      console.error("Failed to send message:", err);
      setIsSearching(false);
      setActiveSearchQuery('');
      setActiveSearchResults([]);

      const errMsg = err.message || err.data?.error || "Error generating response. Please check API keys.";
      
      // Inject error message in UI
      const dummyErrorMessage = {
        type: 'ai',
        data: { 
          content: `Error: ${errMsg}`,
          isError: true
        }
      };

      setActiveSessionDetails(prev => {
        if (!prev) return null;
        const msgs = [...(prev.messages || [])];
        if (msgs.length > 0 && msgs[msgs.length - 1].type === 'ai' && !msgs[msgs.length - 1].data?.isError) {
          msgs[msgs.length - 1] = dummyErrorMessage;
        } else {
          msgs.push(dummyErrorMessage);
        }
        return {
          id: prev.id,
          title: prev.title,
          messages: msgs
        };
      });
    } finally {
      setIsSearching(false);
      setActiveSearchQuery('');
      setSendingMessage(false);
    }
  };

  // --- RENDER HELPERS ---
  const formatErrorMessages = () => {
    if (!authError) return null;
    const errors = [];
    
    // Check if validation keys exist (Django returns dictionary)
    if (typeof authError === 'object') {
      Object.keys(authError).forEach(key => {
        const value = authError[key];
        if (Array.isArray(value)) {
          value.forEach(msg => errors.push(`${key !== 'non_field_errors' ? key + ': ' : ''}${msg}`));
        } else if (typeof value === 'string') {
          errors.push(value);
        }
      });
    }
    
    return (
      <div className="error-banner">
        <ul>
          {errors.map((err, i) => <li key={i}>{err}</li>)}
        </ul>
      </div>
    );
  };

  // --- VIEW 1: AUTHENTICATION ---
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-header">
              <div className="auth-logo">Jeevan's Chatbot</div>
              <div className="auth-subtitle">
                {isRegisterMode ? 'Create an account to start chatting' : 'Log in to continue your conversations'}
              </div>
            </div>

            {formatErrorMessages()}

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Username</label>
                <div className="input-wrapper">
                  <UserIcon className="input-icon" />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              {isRegisterMode && (
                <div className="form-group">
                  <label>Email Address</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input 
                      type="email" 
                      className="form-input" 
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {isRegisterMode && (
                <div className="form-group">
                  <label>Confirm Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" />
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn-primary" 
                disabled={isAuthLoading}
              >
                {isAuthLoading ? (
                  <>
                    <Loader2 className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> 
                    Processing...
                  </>
                ) : (
                  isRegisterMode ? 'Sign Up' : 'Sign In'
                )}
              </button>
            </form>

            <div className="auth-toggle">
              {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}{' '}
              <span 
                className="auth-toggle-link"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setAuthError(null);
                }}
              >
                {isRegisterMode ? 'Log In' : 'Register'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: DASHBOARD & CHAT ---
  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="user-avatar">
            {currentUser?.username ? currentUser.username.substring(0, 2).toUpperCase() : 'U'}
          </div>
          <div className="user-meta">
            <span className="username">{currentUser?.username || 'User'}</span>
            <span className="user-status">Online</span>
          </div>
        </div>

        <div className="sidebar-action">
          <button className="btn-new-chat" onClick={handleNewChat}>
            <Plus size={18} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="sessions-list-container">
          <div className="sessions-title">Chat History</div>
          {loadingSessions && chatSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dark)' }}>
              <Loader2 className="animate-spin" style={{ margin: '0 auto', animation: 'spin 1.5s linear infinite' }} />
            </div>
          ) : chatSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', fontSize: '13px', color: 'var(--text-dark)' }}>
              No chats yet. Start a new one!
            </div>
          ) : (
            chatSessions.map((session) => (
              <div 
                key={session.id} 
                className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                onClick={() => {
                  if (activeSessionId === session.id) {
                    fetchChatDetails(session.id);
                  } else {
                    setActiveSessionId(session.id);
                  }
                }}
              >
                <div className="session-info">
                  <MessageSquare className="session-icon" />
                  <span className="session-text">{session.title}</span>
                </div>
                <div className="session-menu-container">
                  <button 
                    className={`session-menu-btn ${activeMenuSessionId === session.id ? 'active' : ''}`} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuSessionId(activeMenuSessionId === session.id ? null : session.id);
                    }}
                    title="Conversation options"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {activeMenuSessionId === session.id && (
                    <div className="session-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleRenameChat(session.id, session.title)}
                      >
                        Rename
                      </button>
                      <button 
                        className="dropdown-item delete" 
                        onClick={(e) => {
                          handleDeleteChat(e, session.id);
                          setActiveMenuSessionId(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <button className="btn-logout" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-window">
        {!activeSessionId ? (
          // Welcome / Empty State
          <div className="empty-state">
            <div className="welcome-card">
              <div className="welcome-icon-wrapper">
                <Bot className="welcome-icon" />
              </div>
              <h2 className="welcome-title">Antigravity LLM Assistant</h2>
              <p className="welcome-desc">
                Start a new conversation thread using OpenAI, Google, or Mistral models. Switch models dynamically at any point during your chat.
              </p>
              <button className="btn-primary" onClick={handleNewChat} style={{ maxWidth: '200px', margin: '0 auto' }}>
                <Plus size={16} /> Start Chatting
              </button>
            </div>
          </div>
        ) : (
          // Active Chat Thread
          <>
            {/* Top Header */}
            <header className="chat-header">
              <span className="chat-header-title">
                {activeSessionDetails?.title || 'Active Conversation'}
              </span>
              <div className="model-selector-wrapper">
                <span className="model-selector-label">LLM Provider:</span>
                <select 
                  className="model-dropdown"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="openai">OpenAI (gpt-4o-mini)</option>
                  <option value="google">Google (gemini-2.5-flash)</option>
                  <option value="mistral">Mistral (mistral-small-latest)</option>
                </select>
              </div>
            </header>

            {/* Chat message display area */}
            <div className="messages-container-wrapper" style={{ position: 'relative', display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
              <div 
                className="messages-container"
                ref={messagesContainerRef}
                onScroll={handleContainerScroll}
              >
                {loadingChatDetails && !activeSessionDetails ? (
                  <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', width: '30px', height: '30px', color: 'var(--primary)' }} />
                  </div>
                ) : (
                  <>
                    {activeSessionDetails?.messages?.map((msg, index) => {
                      const isUser = msg.type === 'human';
                      const content = msg.data?.content || '';
                      const isError = msg.data?.isError || false;
                      
                      // Filter out intermediate tool messages and empty tool-calling requests
                      const isToolMessage = msg.type === 'tool';
                      const isToolCallRequest = msg.type === 'ai' && msg.data?.tool_calls?.length > 0 && !content;
                      if (isToolMessage || isToolCallRequest) {
                        return null;
                      }

                      // Extract / Gather Sources
                      let sources = msg.sources || [];
                      if (!sources.length && !isUser) {
                        // Look back in previous messages for a ToolMessage
                        for (let i = index - 1; i >= 0; i--) {
                          const prevMsg = activeSessionDetails.messages[i];
                          if (prevMsg.type === 'human') break;
                          if (prevMsg.type === 'tool' && prevMsg.data?.content) {
                            try {
                              const toolData = JSON.parse(prevMsg.data.content);
                              if (toolData.results) {
                                sources = toolData.results;
                              }
                            } catch (e) {}
                          }
                        }
                      }

                      const showLoadingBar = !isUser && (msg.isSearchActive || (sendingMessage && index === activeSessionDetails.messages.length - 1 && webSearchEnabled && !content && !sources.length));

                      return (
                        <div key={index} className={`message-wrapper ${isUser ? 'user' : 'ai'}`}>
                          <div className="message-avatar">
                            {isUser ? <UserIcon size={18} /> : <Bot size={18} />}
                          </div>
                          <div className={`message-bubble ${isError ? 'message-error' : ''}`}>
                            
                            {/* Behavior 1: Loading bar after user input, until tool response comes */}
                            {showLoadingBar && (
                              <div className="search-loading-container">
                                <div className="search-loading-header">
                                  <Globe className="search-loading-icon spin-pulse" size={15} />
                                  <span>{msg.searchQuery || activeSearchQuery || 'Searching the web...'}</span>
                                </div>
                                <div className="search-loading-bar-track">
                                  <div className="search-loading-bar-fill"></div>
                                </div>
                              </div>
                            )}

                            {/* Standard non-search typing indicator inside single AI bubble */}
                            {!content && !showLoadingBar && (!sources || !sources.length) && sendingMessage && index === activeSessionDetails.messages.length - 1 && (
                              <div className="typing-indicator">
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                              </div>
                            )}

                            {/* Behavior 3: Streamed LLM response text */}
                            {content && <SafeMarkdown>{content}</SafeMarkdown>}

                            {/* Behavior 2 & 3: Sources displayed immediately after tool response & positioned below LLM response */}
                            {sources && sources.length > 0 && (
                              <div className="message-sources-container">
                                <div className="sources-header">
                                  <Globe size={13} />
                                  <span>Sources ({sources.length}):</span>
                                </div>
                                <div className="sources-list">
                                  {sources.map((src, sIdx) => {
                                    let hostname = '';
                                    try {
                                      hostname = new URL(src.url).hostname.replace('www.', '');
                                    } catch {
                                      hostname = src.url;
                                    }
                                    return (
                                      <a 
                                        key={sIdx} 
                                        href={src.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="source-badge"
                                        title={src.content || src.title}
                                      >
                                        <span className="source-index">{sIdx + 1}</span>
                                        <span className="source-title">{src.title || hostname}</span>
                                        <span className="source-domain">{hostname}</span>
                                        <ExternalLink size={10} className="source-link-icon" />
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Reference to scroll to bottom */}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Floating scroll toggle button */}
              {showScrollBtn && (
                <button 
                  className="scroll-toggle-btn" 
                  onClick={handleScrollButtonClick}
                  title={scrollDirection === 'up' ? "Scroll to first message" : "Scroll to latest message"}
                >
                  {scrollDirection === 'up' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                </button>
              )}
            </div>

            {/* Message Input container */}
            <footer className="chat-input-container">
              <form className="chat-input-form" onSubmit={handleSendMessage}>
                <button
                  type="button"
                  className={`btn-web-search ${webSearchEnabled ? 'active' : ''}`}
                  onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                  title={webSearchEnabled ? "Web Search enabled (click to disable)" : "Enable Web Search"}
                >
                  <Globe size={18} />
                  {webSearchEnabled && <span className="web-search-label">Search</span>}
                </button>
                <textarea 
                  className="chat-input-field" 
                  rows="1"
                  placeholder={webSearchEnabled ? "Search web & ask anything..." : "Type a message..."}
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
                <button 
                  type="submit" 
                  className="btn-send"
                  disabled={!newMessageText.trim() || sendingMessage}
                >
                  <Send size={16} />
                </button>
              </form>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
