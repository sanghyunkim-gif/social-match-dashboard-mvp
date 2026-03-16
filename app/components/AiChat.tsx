"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatContext, ChatMessage, FilterAction, AiChatAvailableOptions } from "../types";
import ChatMessageRenderer from "./chat/ChatMessageRenderer";

const INITIAL_SUGGESTIONS = [
  "전체 진행률 추이 보여줘",
  "지역별 비교가 궁금해",
  "최근 추이를 보고 싶어",
];

type AiChatProps = {
  onApplyFilters: (filters: FilterAction["filters"]) => void;
  dashboardContext: ChatContext | null;
  availableOptions: AiChatAvailableOptions;
};

export default function AiChat({ onApplyFilters, dashboardContext, availableOptions }: AiChatProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [filterAppliedNotice, setFilterAppliedNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingAnalysisRef = useRef(false);
  const prevContextRef = useRef<ChatContext | null>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ESC to collapse
  useEffect(() => {
    if (!isExpanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isExpanded]);

  // Auto-expand when messages arrive
  useEffect(() => {
    if (messages.length > 0) setIsExpanded(true);
  }, [messages.length]);

  // When dashboardContext updates after filter apply, auto-send analysis request
  useEffect(() => {
    if (!pendingAnalysisRef.current || !dashboardContext) return;
    if (dashboardContext === prevContextRef.current) return;
    prevContextRef.current = dashboardContext;
    pendingAnalysisRef.current = false;
    setFilterAppliedNotice(null);

    const analyzeMessage = "대시보드에 표시된 데이터를 분석해줘.";
    requestAnalysis(analyzeMessage);
  }, [dashboardContext]);

  const requestAnalysis = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: `${Date.now()}-system`,
        role: "user",
        content: text,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setDynamicSuggestions([]);

      try {
        const allMessages = [...messages, userMsg];
        const apiMessages = allMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            context: dashboardContext,
            availableOptions,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "응답 실패");
        }

        const data = (await res.json()) as {
          reply: string;
          action?: FilterAction;
          recommendations?: string[];
        };

        if (data.recommendations?.length) {
          setDynamicSuggestions(data.recommendations);
        }

        const assistantMsg: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (data.action?.type === "apply_filters") {
          pendingAnalysisRef.current = true;
          setFilterAppliedNotice("필터를 적용하고 데이터를 조회하는 중...");
          onApplyFilters(data.action.filters);
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-error`,
            role: "assistant",
            content: `오류가 발생했습니다: ${(error as Error).message}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, dashboardContext, availableOptions, onApplyFilters]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: `${Date.now()}-user`,
        role: "user",
        content: text.trim(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setIsLoading(true);
      setDynamicSuggestions([]);
      setIsExpanded(true);

      try {
        const apiMessages = nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            context: dashboardContext,
            availableOptions,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "응답 실패");
        }

        const data = (await res.json()) as {
          reply: string;
          action?: FilterAction;
          recommendations?: string[];
        };

        if (data.recommendations?.length) {
          setDynamicSuggestions(data.recommendations);
        }

        const assistantMsg: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (data.action?.type === "apply_filters") {
          pendingAnalysisRef.current = true;
          setFilterAppliedNotice("필터를 적용하고 데이터를 조회하는 중...");
          onApplyFilters(data.action.filters);
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-error`,
            role: "assistant",
            content: `오류가 발생했습니다: ${(error as Error).message}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, dashboardContext, availableOptions, onApplyFilters]
  );

  const handleRecommendationSelect = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage]
  );

  const showInitialSuggestions = messages.length === 0 && !isLoading && dynamicSuggestions.length === 0;

  return (
    <div className={`ai-bottom-bar${isExpanded ? " is-expanded" : ""}`}>
      {/* Expandable messages area */}
      {isExpanded && (
        <div className="ai-bottom-panel">
          <div className="ai-bottom-header">
            <div className="ai-bottom-header-left">
              <img
                src="/ai-avatar.png"
                alt=""
                className="ai-chat-header-avatar"
                width={28}
                height={28}
              />
              <span className="ai-chat-header-title">KEVIN AI</span>
              <span className="ai-chat-header-badge">Assistant</span>
            </div>
            <button
              type="button"
              className="ai-chat-close"
              onClick={() => setIsExpanded(false)}
              aria-label="채팅 닫기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="ai-bottom-messages">
            {messages.length === 0 && (
              <div className="ai-chat-empty">
                원하는 데이터를 자연어로 요청해보세요.<br />
                AI가 대시보드 필터를 자동으로 설정합니다.
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`ai-chat-bubble ${msg.role}`}
              >
                {msg.role === "assistant" && (
                  <img
                    src="/ai-avatar.png"
                    alt=""
                    className="ai-bubble-avatar"
                    width={24}
                    height={24}
                  />
                )}
                <div className="ai-bubble-content">
                  <ChatMessageRenderer
                    blocks={[{ type: "text", content: msg.content }]}
                    onRecommendationSelect={handleRecommendationSelect}
                  />
                </div>
              </div>
            ))}

            {filterAppliedNotice && (
              <div className="ai-chat-bubble assistant">
                <img
                  src="/ai-avatar.png"
                  alt=""
                  className="ai-bubble-avatar"
                  width={24}
                  height={24}
                />
                <div className="ai-bubble-content">
                  <div className="ai-filter-notice">
                    <div className="ai-typing">
                      <span /><span /><span />
                    </div>
                    <div className="ai-loading-label">{filterAppliedNotice}</div>
                  </div>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="ai-chat-bubble assistant">
                <img
                  src="/ai-avatar.png"
                  alt=""
                  className="ai-bubble-avatar"
                  width={24}
                  height={24}
                />
                <div className="ai-bubble-content">
                  <div className="ai-agent-loading">
                    <div className="ai-typing">
                      <span /><span /><span />
                    </div>
                    <div className="ai-loading-label">답변 생성 중...</div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Dynamic suggestion chips */}
          {dynamicSuggestions.length > 0 && !isLoading && (
            <div className="ai-suggestions">
              {dynamicSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ai-suggestion-chip"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Initial suggestion chips (shown when collapsed and no messages) */}
      {!isExpanded && showInitialSuggestions && (
        <div className="ai-bottom-suggestions">
          {INITIAL_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="ai-suggestion-chip"
              onClick={() => sendMessage(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Fixed input bar */}
      <div className="ai-bottom-input-bar">
        <img
          src="/ai-avatar.png"
          alt="AI"
          className="ai-bottom-avatar"
          width={32}
          height={32}
        />
        <input
          ref={inputRef}
          type="text"
          className="ai-bottom-input"
          value={input}
          placeholder="KEVIN AI에게 데이터를 질문하세요..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              sendMessage(input);
            }
          }}
          onFocus={() => {
            if (messages.length > 0) setIsExpanded(true);
          }}
          disabled={isLoading}
        />
        <button
          type="button"
          className="ai-bottom-send"
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
        {isExpanded && messages.length > 0 && (
          <button
            type="button"
            className="ai-bottom-collapse"
            onClick={() => setIsExpanded(false)}
            aria-label="채팅 접기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
