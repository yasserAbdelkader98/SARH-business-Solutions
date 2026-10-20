import { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./Pages/LoginPage";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { OrdersPage } from "./Pages/OrdersPage";
import { CreateOrderForm } from "./components/CreateOrderForm";

export function App() {
  const { session, loading, authError, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    setLogoutError("");
    try {
      await logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Sign out failed.",
      );
    } finally {
      setSigningOut(false);
    }
  }
  if (loading)
    return (
      <main>
        <p>Checking session...</p>
      </main>
    );

  return (
    <main className={session ? "app-shell" : "login-shell"}>
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          O
        </span>
        <div>
          <p className="eyebrow">OPERATIONS WORKSPACE</p>
          <h1>Orders Console</h1>
        </div>
      </header>
      {authError && (
        <p role="alert">{authError} Reload to retry or sign in below.</p>
      )}
      {logoutError && <p role="alert">{logoutError}</p>}
      {session ? (
        <>
          <section aria-label="Signed-in account">
            <p>
              Signed in as {session.user.email} ({session.user.role}).
            </p>
            <button disabled={signingOut} onClick={() => void signOut()}>
              Sign out
            </button>
          </section>
          <CreateOrderForm key={session.user.id} />
          <OrdersPage />
        </>
      ) : (
        <LoginPage />
      )}
      <ConnectionStatus />
    </main>
  );
}
