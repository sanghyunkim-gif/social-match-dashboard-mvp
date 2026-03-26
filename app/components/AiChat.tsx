"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatContext, ChatMessage, ChartConfig, FilterAction, AiChatAvailableOptions } from "../types";
import ChatMessageRenderer from "./chat/ChatMessageRenderer";

const INITIAL_SUGGESTIONS = [
  "전체 진행률 추이 보여줘",
  "지역별 비교가 궁금해",
  "최근 추이를 보고 싶어",
];

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  dynamicSuggestions: string[];
};

type AiChatProps = {
  onApplyFilters: (filters: FilterAction["filters"]) => void;
  dashboardContext: ChatContext | null;
  availableOptions: AiChatAvailableOptions;
  isOpen: boolean;
  onToggle: () => void;
};

const newSessionId = () => `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const FIRST_SESSION_ID = "s-initial";

export default function AiChat({ onApplyFilters, dashboardContext, availableOptions, isOpen, onToggle }: AiChatProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: FIRST_SESSION_ID, title: "새 대화", messages: [], dynamicSuggestions: [] },
  ]);
  const [activeSessionId, setActiveSessionId] = useState(FIRST_SESSION_ID);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const messages = activeSession.messages;
  const dynamicSuggestions = activeSession.dynamicSuggestions;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, activeSessionId]);


  const handleNewSession = () => {
    const id = newSessionId();
    setSessions((prev) => [
      ...prev,
      { id, title: `대화 ${prev.length + 1}`, messages: [], dynamicSuggestions: [] },
    ]);
    setActiveSessionId(id);
    setInput("");
    setIsLoading(false);

  };

  const handleCloseSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) return;
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(next[next.length - 1].id);
      }
      return next;
    });
  };

  const handleSwitchSession = (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setInput("");
    setIsLoading(false);

  };

  const requestAnalysis = useCallback(
    async (text: string) => {
      const sid = activeSessionId;
      const userMsg: ChatMessage = { id: `${Date.now()}-system`, role: "user", content: text };
      const apiMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sid ? { ...s, messages: [...s.messages, userMsg], dynamicSuggestions: [] } : s
        )
      );
      setIsLoading(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, context: dashboardContext, availableOptions }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "응답 실패");
        }
        const data = (await res.json()) as {
          reply: string;
          action?: FilterAction;
          recommendations?: string[];
          charts?: ChartConfig[];
        };

        const assistantMsg: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply,
          charts: data.charts?.length ? data.charts : undefined,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sid
              ? {
                  ...s,
                  messages: [...s.messages, assistantMsg],
                  dynamicSuggestions: data.recommendations?.length ? data.recommendations : [],
                }
              : s
          )
        );

        if (data.action?.type === "apply_filters") {
          onApplyFilters(data.action.filters);
        }
      } catch (error) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sid
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      id: `${Date.now()}-error`,
                      role: "assistant" as const,
                      content: `오류가 발생했습니다: ${(error as Error).message}`,
                    },
                  ],
                }
              : s
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, messages, dashboardContext, availableOptions, onApplyFilters]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      const sid = activeSessionId;
      const userMsg: ChatMessage = { id: `${Date.now()}-user`, role: "user", content: text.trim() };
      const apiMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const isFirst = messages.length === 0;
      const autoTitle = isFirst
        ? text.trim().slice(0, 20) + (text.trim().length > 20 ? "..." : "")
        : undefined;

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sid
            ? { ...s, messages: [...s.messages, userMsg], dynamicSuggestions: [], ...(autoTitle ? { title: autoTitle } : {}) }
            : s
        )
      );
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, context: dashboardContext, availableOptions }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "응답 실패");
        }
        const data = (await res.json()) as {
          reply: string;
          action?: FilterAction;
          recommendations?: string[];
          charts?: ChartConfig[];
        };

        const assistantMsg: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply,
          charts: data.charts?.length ? data.charts : undefined,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sid
              ? {
                  ...s,
                  messages: [...s.messages, assistantMsg],
                  dynamicSuggestions: data.recommendations?.length ? data.recommendations : [],
                }
              : s
          )
        );

        if (data.action?.type === "apply_filters") {
          onApplyFilters(data.action.filters);
        }
      } catch (error) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sid
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      id: `${Date.now()}-error`,
                      role: "assistant" as const,
                      content: `오류가 발생했습니다: ${(error as Error).message}`,
                    },
                  ],
                }
              : s
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, messages, isLoading, dashboardContext, availableOptions, onApplyFilters]
  );

  const handleRecommendationSelect = useCallback(
    (question: string) => sendMessage(question),
    [sendMessage]
  );

  const showInitialSuggestions = messages.length === 0 && !isLoading && dynamicSuggestions.length === 0;

  if (!isOpen) {
    return (
      <button type="button" className="ai-panel-toggle-btn" onClick={onToggle} aria-label="AI 채팅 열기">
        AI
      </button>
    );
  }

  return (
    <aside className="ai-side-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-header-left">
          <span className="ai-chat-header-title">AI</span>
        </div>
        <div className="ai-panel-header-actions">
          <button type="button" className="ai-panel-action-btn" onClick={handleNewSession} title="새 대화">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button type="button" className="ai-panel-action-btn" onClick={onToggle} aria-label="패널 닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
        </div>
      </div>

      {sessions.length > 1 && (
        <div className="ai-session-tabs">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ai-session-tab${s.id === activeSessionId ? " is-active" : ""}`}
              onClick={() => handleSwitchSession(s.id)}
            >
              <span className="ai-session-tab-title">{s.title}</span>
              <span
                className="ai-session-tab-close"
                onClick={(e) => handleCloseSession(e, s.id)}
                role="button"
                tabIndex={0}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="ai-panel-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            Kevin AI에게 데이터 조회와 분석을 요청해 보세요.
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`ai-chat-bubble ${msg.role}`}>
            <div className="ai-bubble-content">
              <ChatMessageRenderer
                blocks={[
                  { type: "text" as const, content: msg.content },
                  ...(msg.charts?.map((c) => ({ type: "chart" as const, config: c })) ?? []),
                ]}
                onRecommendationSelect={handleRecommendationSelect}
              />
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="ai-chat-bubble assistant">
            <div className="ai-bubble-content">
              <div className="ai-agent-loading">
                <div className="ai-typing"><span /><span /><span /></div>
                <div className="ai-loading-label">답변 생성 중...</div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {(showInitialSuggestions || (dynamicSuggestions.length > 0 && !isLoading)) && (
        <div className="ai-panel-suggestions">
          {(showInitialSuggestions ? INITIAL_SUGGESTIONS : dynamicSuggestions).map((s) => (
            <button key={s} type="button" className="ai-suggestion-chip" onClick={() => sendMessage(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="ai-panel-input-area">
        <textarea
          ref={inputRef}
          className="ai-panel-input"
          value={input}
          placeholder=""
          rows={1}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={isLoading}
        />
        <button
          type="button"
          className="ai-panel-send"
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
