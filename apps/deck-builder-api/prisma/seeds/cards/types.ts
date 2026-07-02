export const CARDINFO_API_URL =
  'https://db.ygoprodeck.com/api/v7/cardinfo.php';

export interface YgoApiCardImage {
  id: number;
  image_url: string;
  image_url_small: string;
  image_url_cropped: string;
}

export interface YgoApiCardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code: string;
  set_price: string;
}

export interface YgoApiBanlistInfo {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
}

export interface YgoApiCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  race: string;
  archetype?: string;
  ygoprodeck_url?: string;
  atk?: number | null;
  def?: number | null;
  level?: number;
  scale?: number;
  linkval?: number;
  attribute?: string;
  typeline?: string[];
  linkmarkers?: string[];
  banlist_info?: YgoApiBanlistInfo;
  card_sets?: YgoApiCardSet[];
  card_images?: YgoApiCardImage[];
}

export interface YgoApiResponse {
  data: YgoApiCard[];
}
