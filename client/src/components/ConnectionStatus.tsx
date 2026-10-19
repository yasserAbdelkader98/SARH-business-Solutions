import { useQuery } from "@tanstack/react-query";

export function ConnectionStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/health", { signal });
      if (!response.ok)
        throw new Error(
          "API or database unavailable. Check the server terminal.",
        );
      return true;
    },
    retry: false,
  });

  return (
    <section aria-label="Connection status">
      <p role="status">
        {health.isPending
          ? "Checking API and database…"
          : health.isError
            ? health.error.message
            : "API and MongoDB are connected."}
      </p>
      <button
        onClick={() => void health.refetch()}
        disabled={health.isFetching}
      >
        {health.isFetching ? "Checking…" : "Check connection"}
      </button>
    </section>
  );
}
