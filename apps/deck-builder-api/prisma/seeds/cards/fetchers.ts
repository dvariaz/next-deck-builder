import { CARDINFO_API_URL, YgoApiCard, YgoApiResponse } from './types';

export async function fetchAllCards(): Promise<YgoApiCard[]> {
  // `misc=yes` enriches each card with a `misc_info` block (release dates,
  // votes, formats, konami id, MD rarity, etc.).
  const url = `${CARDINFO_API_URL}?misc=yes`;
  console.log(`Fetching cards from ${url}...`);

  const response = await fetch(url);
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
