const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiFetcher = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${BASE_URL}${url}`, options);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { data, status: response.status, headers: response.headers } as T;
};
