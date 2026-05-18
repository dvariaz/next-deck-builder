import { CARDINFO_API_URL, YgoApiCard, YgoApiResponse } from './types';

export async function fetchAllCards(): Promise<YgoApiCard[]> {
  console.log(`Fetching cards from ${CARDINFO_API_URL}...`);

  const response = await fetch(CARDINFO_API_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch cards: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as YgoApiResponse;
  if (!Array.isArray(body.data)) {
    throw new Error('Unexpected API response: missing data array');
  }

  return body.data;
}
