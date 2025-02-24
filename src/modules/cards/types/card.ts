export interface ILinkMonsterCardProperties {
  linkval:       number;
  linkmarkers:   ILinkMarker[];
}

export type IBaseMonsterCardProperties = {
  atk:           number;
  def:           number;
  attribute:     string;
}

export type IMonsterCardProperties = IBaseMonsterCardProperties & ILinkMonsterCardProperties;

export interface ICard extends Partial<IMonsterCardProperties> {
  id:             number;
  name:           string;
  type:           string;
  frameType:      string;
  desc:           string;
  race:           string;
  archetype:      string;
  ygoprodeckUrl: string;
  cardSets:      ICardSet[];
  cardImages:    ICardImage[];
}

export interface ICardImage {
  id:                number;
  imageUrl:         string;
  imageUrlSmall:   string;
  imageUrlCropped: string;
}

export interface ICardSet {
  setName:        string;
  setCode:        string;
  setRarity:      string;
  setRarityCode: string;
  setPrice:       string;
}

export type ILinkMarker = "Top" | "Top-Right" | "Right" | "Bottom-Right" | "Bottom" | "Bottom-Left" | "Left" | "Top-Left";
