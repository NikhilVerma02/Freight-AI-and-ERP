import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";

// Speech-to-text languages offered for the mic — same set used in the AI portal's case
// intake mic, independent of any UI language toggle since this app has none.
const MIC_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "mr-IN", label: "मराठी" },
  { code: "gu-IN", label: "ગુજરાતી" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ" },
];

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechRecognitionSupported = !!SpeechRecognitionCtor;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

interface SessionSummary {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  message_count: number;
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export default function Chatbot() {
  const { user } = useAuth();
  const { show } = useToast();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [micLang, setMicLang] = useState("en-US");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBeforeListeningRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function loadSessions(selectFirst: boolean) {
    api
      .get<SessionSummary[]>("/api/chatbot/sessions")
      .then((res) => {
        setSessions(res);
        if (selectFirst && res.length > 0) selectSession(res[0].id);
      })
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load chat sessions"))
      .finally(() => setLoadingSessions(false));
  }

  useEffect(() => {
    loadSessions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  if (!user) return null;

  function selectSession(sessionId: string) {
    recognitionRef.current?.stop();
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    api
      .get<{ messages: StoredMessage[] }>(`/api/chatbot/sessions/${sessionId}`)
      .then((res) => setMessages(res.messages.map((m) => ({ role: m.role, content: m.content }))))
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load chat"))
      .finally(() => setLoadingMessages(false));
  }

  function startNewChat() {
    recognitionRef.current?.stop();
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }

  function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    api
      .delete(`/api/chatbot/sessions/${sessionId}`)
      .then(() => {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (sessionId === activeSessionId) startNewChat();
      })
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to delete chat"));
  }

  function toggleListening() {
    if (!speechRecognitionSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    transcriptBeforeListeningRef.current = input;
    const recognition = new SpeechRecognitionCtor!();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = micLang;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = transcriptBeforeListeningRef.current;
      setInput((base ? `${base} ` : "") + transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || sending) return;
    recognitionRef.current?.stop();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setSending(true);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const session = await api.post<SessionSummary>("/api/chatbot/sessions");
        sessionId = session.id;
        setActiveSessionId(sessionId);
      }
      const res = await api.post<{ answer: string }>("/api/chatbot/ask", { question, session_id: sessionId });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      loadSessions(false); // refresh titles/ordering without disturbing the active chat
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof ApiError ? err.message : "Something went wrong.", error: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      {/* Sessions sidebar */}
      <div className="flex w-64 flex-shrink-0 flex-col gap-3">
        <button
          onClick={startNewChat}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
        >
          <PlusIcon />
          New Chat
        </button>
        <Card className="flex-1 overflow-hidden p-2">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recents</p>
          <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: "calc(100% - 2rem)" }}>
            {loadingSessions ? (
              <p className="px-2 py-2 text-xs text-slate-400">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-400">No chats yet — send a message to start one.</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={`group flex items-center justify-between gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    s.id === activeSessionId
                      ? "bg-accent/10 text-accent dark:text-accent-light"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
                  }`}
                >
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="flex flex-shrink-0 items-center gap-1">
                    <span className="text-[10px] text-slate-400 group-hover:hidden">{relativeTime(s.updated_at)}</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="hidden rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-500 group-hover:block dark:hover:bg-navy-700"
                      aria-label="Delete chat"
                      title="Delete chat"
                    >
                      <TrashIcon />
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Active chat */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Portal Assistant</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ask about your orders, claims, inventory, or SLA terms — in English, Hindi, or any language you like.
          </p>
        </div>

        <Card className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {loadingMessages ? (
              <p className="mt-6 text-center text-sm text-slate-400">Loading…</p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="text-3xl">💬</span>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Ask me anything about your orders, claims, inventory, or SLA terms.
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-accent text-white"
                        : m.error
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                          : "bg-slate-100 text-slate-800 dark:bg-navy-800 dark:text-slate-200"
                    }`}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl bg-slate-100 px-3.5 py-2.5 dark:bg-navy-800">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4 dark:border-navy-700">
            {speechRecognitionSupported && (
              <div className="mb-2 flex items-center justify-between">
                <select
                  value={micLang}
                  onChange={(e) => setMicLang(e.target.value)}
                  title="Voice input language"
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-400"
                >
                  {MIC_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={toggleListening}
                  title={listening ? "Stop listening" : "Speak your question"}
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                    listening
                      ? "bg-rose-500 text-white animate-pulse"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-navy-800 dark:text-slate-400 dark:hover:bg-navy-700"
                  }`}
                >
                  <MicIcon />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question…"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-accent focus:outline-none dark:border-navy-700 dark:bg-navy-800 dark:text-slate-100"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
