"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getCurrentUser, type AuthUser } from "@/lib/auth-api";

type AuthContextValue = {
  user: AuthUser | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  refresh: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setUser(await getCurrentUser());
    } catch {
      setUser(null);
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) {
          setUser(null);
          router.replace("/login");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    function onUnauthorized() {
      setUser(null);
      router.replace("/login");
    }

    window.addEventListener("cognivault:unauthorized", onUnauthorized);

    return () => {
      active = false;
      window.removeEventListener("cognivault:unauthorized", onUnauthorized);
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#8b93a7]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-400" />
          Checking authentication…
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, refresh: load }}>
      {children}
    </AuthContext.Provider>
  );
}
