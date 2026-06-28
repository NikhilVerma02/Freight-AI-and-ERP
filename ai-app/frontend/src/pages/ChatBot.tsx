import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import { getLanguage } from "../lib/i18n";
import { Button, Card, CardBody, Badge } from "../components/ui";
import type { ChatMessage, ChatResponse, ChatSession } from "../lib/types";

const SESSION_KEY = "ai_chat_session_id";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function ChatBot() {
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = !!getSpeechRecognition();
  const synthSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (sessionId) {
      api
        .get<ChatSession>(`/api/chat/${sessionId}`)
        .then((s) => setMessages(s.messages))
        .catch(() => {
          // session may have expired/not exist server-side; start fresh silently
          localStorage.removeItem(SESSION_KEY);
          setSessionId(null);
        });
    }
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: new Date().toISOString() }]);
    setInput("");
    setSending(true);
    try {
      const res = await api.post<ChatResponse>("/api/chat", {
        session_id: sessionId,
        message: trimmed,
        language: getLanguage(),
      });
      if (res.session_id !== sessionId) {
        setSessionId(res.session_id);
        localStorage.setItem(SESSION_KEY, res.session_id);
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
          timestamp: new Date().toISOString(),
          tools_used: res.tools_used,
        },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function handleMic() {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = getLanguage() === "hi" ? "hi-IN" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function handleSpeak(text: string) {
    if (!synthSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLanguage() === "hi" ? "hi-IN" : "en-US";
    window.speechSynthesis.speak(utterance);
  }

  function newSession() {
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setMessages([]);
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{t("chat.title")}</h1>
          <p className="mt-1 text-sm text-slate-400">{t("chat.subtitle")}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={newSession}>
          {t("chat.newSession")}
        </Button>
      </div>

      {sessionId && (
        <div className="font-mono text-xs text-slate-500">
          {t("chat.sessionLabel")}: {sessionId}
        </div>
      )}

      <Card className="flex-1 overflow-hidden">
        <CardBody className="flex h-[55vh] flex-col p-0">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">
                {t("chat.placeholder")}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-md rounded-lg px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-accent-500/15 border border-accent-500/30 text-slate-100"
                      : "bg-slate-800/70 border border-slate-700 text-slate-100"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.role === "assistant" && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => handleSpeak(m.content)}
                        disabled={!synthSupported}
                        title={t("chat.listenAloud")}
                        className="text-xs text-accent-400 hover:text-accent-300 disabled:opacity-40"
                      >
                        🔊 {t("chat.listenAloud")}
                      </button>
                      {m.tools_used && m.tools_used.length > 0 && (
                        <Badge tone="info" className="text-[10px]">
                          {t("chat.toolsUsed")}: {m.tools_used.map((tu) => tu.name).join(", ")}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2.5 text-sm text-slate-400">
                  ...
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-slate-800 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">{error}</div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-slate-800 p-3"
          >
            <button
              type="button"
              onClick={handleMic}
              disabled={!speechSupported}
              title={speechSupported ? t("chat.mic") : t("chat.micUnavailable")}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors ${
                listening
                  ? "border-rose-500 bg-rose-500/20 text-rose-300 animate-pulse"
                  : "border-slate-700 text-slate-300 hover:border-accent-400 hover:text-accent-300"
              } disabled:opacity-30`}
            >
              🎤
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.placeholder")}
              className="flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400/50"
            />
            <Button type="submit" size="sm" disabled={sending || !input.trim()}>
              {t("chat.send")}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
