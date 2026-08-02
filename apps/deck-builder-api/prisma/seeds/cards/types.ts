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

// Returned per card when the request includes `misc=yes`. Usually a single
// element; cards with alternate passcodes may return more, so we read [0].
export interface YgoApiMiscInfo {
  beta_name?: string;
  treated_as?: string;
  formats?: string[];
  upvotes?: number;
  downvotes?: number;
  konami_id?: number;
  md_rarity?: string;
  tcg_date?: string; // YYYY-MM-DD
  ocg_date?: string; // YYYY-MM-DD
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
  misc_info?: YgoApiMiscInfo[];
}

export interface YgoApiResponse {
  data: YgoApiCard[];
}
