"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseBrowserEnvConfigured } from "@/app/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [btnHover, setBtnHover] = useState(false);
  const [btnActive, setBtnActive] = useState(false);

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

  const googleBtnStyle: React.CSSProperties = {
    ...styles.googleBtn,
    ...(loading ? styles.googleBtnDisabled : {}),
    ...(btnHover && !loading ? styles.googleBtnHover : {}),
    ...(btnActive && !loading ? styles.googleBtnActive : {}),
  };

  return (
    <div style={styles.container}>
      {/* Background decorative elements */}
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />

      <div style={styles.cardWrapper}>
        {/* Top accent bar */}
        <div style={styles.accentBar} />

        <div style={styles.card}>
          {/* Branding */}
          <div style={styles.header}>
            <div style={styles.logoMark}>K</div>
            <h1 style={styles.title}>Kevin</h1>
            <p style={styles.subtitle}>Social Match Dashboard</p>
          </div>

          <div style={styles.divider} />

          {/* Error */}
          {error && (
            <div style={styles.error}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <path
                  d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 5a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zM8 11.5A.75.75 0 118 10a.75.75 0 010 1.5z"
                  fill="var(--down)"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => { setBtnHover(false); setBtnActive(false); }}
            onMouseDown={() => setBtnActive(true)}
            onMouseUp={() => setBtnActive(false)}
            style={googleBtnStyle}
          >
            <div style={styles.googleIconWrap}>
              {loading ? (
                <span style={styles.spinner} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 48 48">
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
            </div>
            <div style={styles.googleDivider} />
            <span style={styles.googleText}>
              {loading ? "로그인 중..." : "Google로 로그인"}
            </span>
          </button>

          {/* Footer */}
          <div style={styles.footer}>
            <span>Powered by PLAB Football</span>
          </div>
        </div>
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
    background: "linear-gradient(160deg, #F7F9FC 0%, #EDF1F8 40%, #E0E6F0 100%)",
    position: "relative",
    overflow: "hidden",
  },
  bgOrb1: {
    position: "absolute",
    top: "-20%",
    right: "-10%",
    width: "600px",
    height: "600px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(108, 171, 221, 0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  bgOrb2: {
    position: "absolute",
    bottom: "-15%",
    left: "-10%",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(108, 171, 221, 0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  cardWrapper: {
    position: "relative",
    width: "100%",
    maxWidth: "430px",
    zIndex: 1,
  },
  accentBar: {
    height: "4px",
    borderRadius: "20px 20px 0 0",
    background: "linear-gradient(90deg, #1C2C5B 0%, #6CABDD 50%, #98C5E9 100%)",
  },
  card: {
    background: "var(--card)",
    borderRadius: "0 0 20px 20px",
    boxShadow: "0 20px 60px rgba(28, 44, 91, 0.10), 0 8px 24px rgba(28, 44, 91, 0.06), 0 2px 8px rgba(28, 44, 91, 0.04)",
    padding: "48px 44px 36px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  header: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  logoMark: {
    width: "48px",
    height: "48px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #6CABDD 0%, #1C2C5B 100%)",
    color: "#ffffff",
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "4px",
    boxShadow: "0 4px 12px rgba(108, 171, 221, 0.30)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "30px",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "2px",
    color: "var(--ink)",
  },
  subtitle: {
    margin: 0,
    color: "var(--muted)",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "0.5px",
  },
  divider: {
    height: "1px",
    background: "linear-gradient(90deg, transparent 0%, var(--border) 50%, transparent 100%)",
    margin: "0 -4px",
  },
  error: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    borderRadius: "10px",
    padding: "12px 14px",
    fontSize: "13px",
    lineHeight: "1.5",
    background: "rgba(220, 38, 38, 0.05)",
    color: "var(--down)",
    borderLeft: "3px solid var(--down)",
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: "50px",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "0",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    background: "var(--card)",
    color: "var(--ink)",
    cursor: "pointer",
    transition: "all 0.2s ease",
    overflow: "hidden",
  },
  googleBtnHover: {
    borderColor: "var(--primary)",
    boxShadow: "0 4px 16px rgba(108, 171, 221, 0.12), 0 2px 6px rgba(28, 44, 91, 0.06)",
    transform: "scale(1.01)",
  },
  googleBtnActive: {
    transform: "scale(0.98)",
    boxShadow: "0 2px 8px rgba(108, 171, 221, 0.08)",
  },
  googleBtnDisabled: {
    background: "var(--bg-accent)",
    color: "var(--muted)",
    cursor: "not-allowed",
    borderColor: "var(--border)",
    boxShadow: "none",
    transform: "none",
  },
  googleIconWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "50px",
    height: "100%",
    flexShrink: 0,
  },
  googleDivider: {
    width: "1px",
    height: "24px",
    background: "var(--border)",
    flexShrink: 0,
  },
  googleText: {
    flex: 1,
    textAlign: "center",
    paddingRight: "50px",
  },
  spinner: {
    display: "inline-block",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "2.5px solid var(--border)",
    borderTopColor: "var(--primary)",
    animation: "spin 0.9s linear infinite",
  },
  footer: {
    textAlign: "center",
    color: "var(--muted)",
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.3px",
    opacity: 0.7,
    marginTop: "4px",
  },
};
