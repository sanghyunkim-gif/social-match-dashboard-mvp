"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseBrowserEnvConfigured } from "@/app/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (typeof window === "undefined") return;

      const canonicalUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (canonicalUrl) {
        const canonicalOrigin = new URL(canonicalUrl).origin;
        if (window.location.origin !== canonicalOrigin) {
          const target = `${canonicalOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.location.replace(target);
          return;
        }
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (!code) return;
      if (!isSupabaseBrowserEnvConfigured()) return;

      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        window.location.replace(appUrl);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseBrowserEnvConfigured()) {
        setError("배포 환경변수(NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${appUrl}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>플랩풋볼</h1>
          <p style={styles.subtitle}>내부 대시보드</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            ...styles.googleBtn,
            ...(loading ? styles.googleBtnDisabled : {}),
          }}
        >
          {loading ? (
            <span style={styles.spinner} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
          )}
          <span>{loading ? "로그인 중..." : "Google로 로그인"}</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "24px",
  },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  header: {
    textAlign: "center",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "28px",
    fontWeight: 700,
    margin: "0 0 4px",
    letterSpacing: "-0.5px",
    color: "var(--ink)",
  },
  subtitle: {
    margin: 0,
    color: "var(--muted)",
    fontSize: "14px",
  },
  error: {
    borderRadius: "12px",
    padding: "10px 14px",
    fontSize: "13px",
    borderColor: "rgba(239, 68, 68, 0.3)",
    background: "rgba(239, 68, 68, 0.12)",
    color: "#991b1b",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "12px 16px",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    background: "#fff",
    color: "var(--ink)",
    cursor: "pointer",
    transition: "border 0.2s ease, box-shadow 0.2s ease",
  },
  googleBtnDisabled: {
    background: "#f1f5f9",
    color: "var(--muted)",
    cursor: "not-allowed",
  },
  spinner: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: "3px solid #e2e8f0",
    borderTopColor: "var(--primary)",
    animation: "spin 0.9s linear infinite",
  },
};
