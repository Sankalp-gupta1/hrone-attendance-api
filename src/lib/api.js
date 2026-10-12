import { useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const isJSON = response.headers
    .get("content-type")
    ?.includes("application/json");
  const data = isJSON ? await response.json() : null;
  if (!response.ok || !isJSON) {
    let message =
      "Could not reach the workspace. Please check your connection and try again.";
    if (response.status === 503)
      message =
        "The database is not connected yet. An owner needs to finish the database setup.";
    else if (response.status === 401 || response.status === 403 || !isJSON)
      message =
        "This workspace requires access. Sign in to the owning Vercel account, then reload.";
    else if (Array.isArray(data?.detail))
      message = data.detail
        .map((e) => `${e.loc.filter((v) => v !== "body").join(" ")}: ${e.msg}`)
        .join(". ");
    else if (typeof data?.detail === "string") message = data.detail;
    throw new ApiError(message, response.status);
  }
  return data;
}

export function query(path, params = {}) {
  const values = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value != null),
  );
  const search = new URLSearchParams(values).toString();
  return path + (search ? `?${search}` : "");
}

export async function allPages(path, signal) {
  const first = await api(
    `${path}${path.includes("?") ? "&" : "?"}page_size=100&page=1`,
    { signal },
  );
  const pages = Math.ceil(first.total / 100);
  if (pages > 100)
    throw new Error(
      "This view supports up to 10,000 records. Narrow the date range in the API for a larger dataset.",
    );
  const items = [...first.items];
  // Four requests at a time bound the connection load on the free demo database.
  for (let start = 2; start <= pages; start += 4) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) =>
        api(
          `${path}${path.includes("?") ? "&" : "?"}page_size=100&page=${start + index}`,
          { signal },
        ),
      ),
    );
    batch.forEach((page) => items.push(...page.items));
  }
  return { ...first, items };
}

export function useResource(path, revision = 0, paginated = false) {
  const [state, setState] = useState({
    data: null,
    loading: Boolean(path),
    error: null,
  });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState({ data: null, loading: true, error: null });
    const request = paginated
      ? allPages(path, controller.signal)
      : api(path, { signal: controller.signal });
    request
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError")
          setState({ data: null, loading: false, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision, paginated]);
  return state;
}
