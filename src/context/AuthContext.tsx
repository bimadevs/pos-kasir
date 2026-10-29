import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ipc } from "../services/ipc";
import type { AuthSession, LoginRequest, User } from "../types/domain";

interface AuthContextValue {
  session: AuthSession | null;
  user: User | null;
  isAdmin: boolean;
  loadingAuth: boolean;
  login: (req: LoginRequest) => Promise<AuthSession>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    ipc
      .getActiveSession()
      .then((active) => {
        if (mounted) {
          setSession(active);
        }
      })
      .catch(() => {
        if (mounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingAuth(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setSession(null);
      void ipc.logout().catch(() => {});
    };
    window.addEventListener("muditamart:session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener(
        "muditamart:session-expired",
        handleSessionExpired,
      );
    };
  }, []);

  const login = useCallback(async (req: LoginRequest): Promise<AuthSession> => {
    const sess = await ipc.login(req);
    setSession(sess);
    return sess;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await ipc.logout();
    } finally {
      setSession(null);
    }
  }, []);

  const user = session?.user ?? null;
  const isAdmin = user?.role === "ADMIN";

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isAdmin,
        loadingAuth,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth harus digunakan di dalam AuthProvider");
  }
  return ctx;
}
