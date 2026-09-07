import { useState, useEffect, useRef, useCallback } from 'react';
import ErrorBoundary  from '../components/ErrorBoundary.jsx';
import {
  streamChat,
  getConversations,
  getConversation,
  deleteConversation,
} from '../services/api.js';
import MessageContent from '../components/MessageContent.jsx';

// ── Suggested prompts ─────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  { icon: '🏠', text: 'Which of my properties has the best cash-on-cash return?' },
  { icon: '📊', text: "What's my total real estate equity across all properties?" },
  { icon: '💰', text: 'Which property is generating the most cash flow?' },
  { icon: '📉', text: 'Am I getting a good return on my down payments?' },
  { icon: '🏦', text: 'How much cash do I have across all accounts?' },
  { icon: '📈', text: 'Which of my investments are doing best?' },
];

// ── Message bubble ────────────────────────────────────────────────────────
function Message({ message, isStreaming }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
        isUser
          ? 'bg-indigo-600 text-white'
          : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
      }`}>
        {isUser ? 'You' : 'AI'}
      </div>

      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'max-w-[75%] bg-indigo-600 text-white rounded-tr-sm'
          : 'max-w-[85%] sm:max-w-[80%] bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm min-w-0'
      }`}>
        {isUser
          ? <p>{message.content}</p>
          : <MessageContent content={message.content} />
        }
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-1 animate-pulse rounded-sm align-middle" />
        )}
      </div>
    </div>
  );
}

// ── Sidebar conversation item ─────────────────────────────────────────────
function ConvItem({ conv, isActive, onClick, onDelete }) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-start justify-between gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-700' : 'text-gray-800'}`}>
          {conv.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{conv.preview}</p>
        <p className="text-xs text-gray-300 mt-0.5">
          {new Date(conv.updatedAt).toLocaleDateString()}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-xs shrink-0 mt-0.5"
      >
        ✕
      </button>
    </div>
  );
}

// ── Main Advisor Page ─────────────────────────────────────────────────────
export default function Advisor() {


  const [conversations, setConversations] = useState([]);
  const [activeConvId,  setActiveConvId]  = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [isStreaming,   setIsStreaming]   = useState(false);
  const [loadingConv,   setLoadingConv]   = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [error,         setError]         = useState('');

  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const streamingId = useRef(null);

  // Load conversation list — filter out old email-based IDs
  const loadConversations = useCallback(async () => {
    try {
      const res = await getConversations();
      // Filter out any old conversations with email as ID (legacy data)
      const valid = (res.conversations || []).filter(c =>
        c.id && /^[a-f0-9]{24}$/i.test(c.id.toString())
      );
      setConversations(valid);
    } catch (_) {}
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load a specific conversation
  const loadConversation = async (id) => {
    // Safety check — skip if ID is not a valid MongoDB ObjectId
    if (!id || !/^[a-f0-9]{24}$/i.test(id.toString())) {
      console.warn('[Advisor] Skipping invalid conversation ID:', id);
      return;
    }
    setLoadingConv(true);
    setError('');
    try {
      const res = await getConversation(id);
      setMessages(res.conversation.messages || []);
      setActiveConvId(id);
    } catch (_) {
      setError('Failed to load conversation.');
    } finally {
      setLoadingConv(false);
    }
  };

  const newConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setError('');
    inputRef.current?.focus();
  };

  const handleDelete = async (id) => {
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConvId === id) newConversation();
    } catch (_) {}
  };

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || isStreaming) return;

    setInput('');
    setError('');
    setIsStreaming(true);

    const userMsg        = { role: 'user',      content: userText, _id: Date.now() + '-u' };
    const assistantMsgId = Date.now() + '-a';
    streamingId.current  = assistantMsgId;

    setMessages(prev => [
      ...prev,
      userMsg,
      { role: 'assistant', content: '', _id: assistantMsgId },
    ]);

    await streamChat({
      message:        userText,
      conversationId: activeConvId,

      onDelta: (chunk) => {
        setMessages(prev => prev.map(m =>
          m._id === assistantMsgId ? { ...m, content: m.content + chunk } : m
        ));
      },

      onDone: ({ conversationId, title }) => {
        setActiveConvId(conversationId);
        setIsStreaming(false);
        streamingId.current = null;
        loadConversations();
        setConversations(prev => prev.map(c =>
          c.id === conversationId ? { ...c, title } : c
        ));
      },

      onError: (msg) => {
        setError(msg || 'Something went wrong. Please try again.');
        setIsStreaming(false);
        streamingId.current = null;
        setMessages(prev => prev.filter(m => m._id !== assistantMsgId));
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isEmpty = messages.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────
  // h-full fills the content area set by App.jsx (viewport minus navbar)
  return (
    <ErrorBoundary section="AI Advisor" fullPage={false}>
    <div className="flex h-full overflow-hidden bg-gray-50 relative">

      {/* Mobile backdrop — only when sidebar open on small screens */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      {/* Desktop: inline push (w-72 / w-0). Mobile: fixed overlay sliding in from left. */}
      <aside className={`
        bg-white border-r border-gray-100 flex flex-col shrink-0
        transition-all duration-200 overflow-hidden
        max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72 max-md:shadow-xl
        ${sidebarOpen ? 'w-72 max-md:translate-x-0' : 'w-0 max-md:-translate-x-full max-md:w-72'}
      `}>

        <div className="p-4 border-b border-gray-100 shrink-0">
          <button
            onClick={() => { newConversation(); if (window.innerWidth < 768) setSidebarOpen(false); }}
            className="btn-primary w-full text-sm py-2.5"
          >
            + New conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
          {conversations.length === 0 ? (
            <p className="text-xs text-gray-400 text-center mt-8 px-4 leading-relaxed">
              No conversations yet.<br />Ask your advisor anything!
            </p>
          ) : (
            conversations.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeConvId}
                onClick={() => { loadConversation(conv.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100 shrink-0">
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            AI advice is informational only,<br />not licensed financial advice.
          </p>
        </div>
      </aside>

      {/* ── Chat area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Chat header */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            title="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">CapRate Advisor</p>
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                Knows your finances
              </p>
            </div>
          </div>
        </div>

        {/* Messages — flex-1 with min-h-0 so it can shrink and scroll */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 min-h-0">

          {loadingConv ? (
            <div className="flex justify-center pt-20">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>

          ) : isEmpty ? (
            /* Empty state */
            <div className="max-w-2xl mx-auto pt-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                  <span className="text-white text-2xl font-bold">AI</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">CapRate Advisor</h2>
                <p className="text-gray-500 mt-2 text-sm max-w-sm mx-auto">
                  Your financial data analyst. I know your accounts, investments, and properties — ask me anything about your numbers.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt.text)}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-left hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    <span className="text-xl shrink-0">{prompt.icon}</span>
                    <span className="text-gray-700 group-hover:text-indigo-700 transition-colors">
                      {prompt.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

          ) : (
            messages.map((msg, i) => (
              <Message
                key={msg._id || i}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
              />
            ))
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 max-w-sm text-center">
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="bg-white border-t border-gray-100 px-4 sm:px-6 py-4 shrink-0">
          <div className="max-w-4xl mx-auto flex gap-3 items-end">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your finances…"
                rows={1}
                disabled={isStreaming}
                className="w-full resize-none border border-gray-300 rounded-xl px-4 py-3 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           disabled:opacity-50 disabled:bg-gray-50 leading-relaxed"
                style={{ minHeight: '48px', maxHeight: '160px' }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                }}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className="btn-primary px-5 py-3 shrink-0 disabled:opacity-40"
            >
              {isStreaming ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
