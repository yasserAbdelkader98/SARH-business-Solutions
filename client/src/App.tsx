import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./Pages/LoginPage";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { OrdersPage } from "./Pages/OrdersPage";
import { CreateOrderForm } from "./components/CreateOrderForm";

export function App() {
  const { session, logout } = useAuth();

  return (
    <main>
      <h1>Orders Console</h1>
      {session ? (
        <>
          <section aria-label="Signed-in account">
            <p>
              Signed in as {session.user.email} ({session.user.role}).
            </p>
            <button onClick={logout}>Sign out</button>
          </section>
          <OrdersPage />
          <CreateOrderForm key={session.user.id} />
        </>
      ) : (
        <LoginPage />
      )}
      <ConnectionStatus />
    </main>
  );
}
