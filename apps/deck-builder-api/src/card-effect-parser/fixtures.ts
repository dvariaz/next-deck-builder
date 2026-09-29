/**
 * Real card text, copied VERBATIM from the seeded database.
 *
 * Do not hand-edit these strings. The whole value of the end-to-end parser
 * spec is that it runs against genuine YGOProDeck text, including its
 * inconsistencies: legacy "-Type" suffixes, bullet lists on their own lines,
 * and the several distinct once-per-turn phrasings.
 *
 * Regenerate with:
 *   SELECT name, description FROM "Card" WHERE name IN (...)
 */

export interface CardFixture {
  name: string;
  description: string;
}

export const FIXTURES = {
  reinforcementOfTheArmy: {
    name: 'Reinforcement of the Army',
    description:
      'Add 1 Level 4 or lower Warrior monster from your Deck to your hand.',
  },
  terraforming: {
    name: 'Terraforming',
    description: 'Add 1 Field Spell from your Deck to your hand.',
  },
  foolishBurial: {
    name: 'Foolish Burial',
    description: 'Send 1 monster from your Deck to the GY.',
  },
  sangan: {
    name: 'Sangan',
    description:
      'If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand, but you cannot activate cards, or the effects of cards, with that name for the rest of this turn. You can only use this effect of "Sangan" once per turn.',
  },
  monsterReborn: {
    name: 'Monster Reborn',
    description: 'Target 1 monster in either GY; Special Summon it.',
  },
  instantFusion: {
    name: 'Instant Fusion',
    description:
      'Pay 1000 LP; Special Summon 1 Level 5 or lower Fusion Monster from your Extra Deck, but it cannot attack, also it is destroyed during the End Phase. (This is treated as a Fusion Summon.) You can only activate 1 "Instant Fusion" per turn.',
  },
  emergencyTeleport: {
    name: 'Emergency Teleport',
    description:
      'Special Summon 1 Level 3 or lower Psychic-Type monster from your hand or Deck, but banish it during the End Phase of this turn.',
  },
  oneForOne: {
    name: 'One for One',
    description:
      'Send 1 monster from your hand to the GY; Special Summon 1 Level 1 monster from your hand or Deck.',
  },
  skyStrikerAceRaye: {
    name: 'Sky Striker Ace - Raye',
    description:
      '(Quick Effect): You can Tribute this card; Special Summon 1 "Sky Striker Ace" monster from your Extra Deck to the Extra Monster Zone. While this card is in your GY, if a face-up "Sky Striker Ace" Link Monster you control is destroyed by battle, or leaves the field because of an opponent\'s card effect: You can Special Summon this card. You can only use each effect of "Sky Striker Ace - Raye" once per turn.',
  },
  elementalHeroStratos: {
    name: 'Elemental HERO Stratos',
    description:
      'When this card is Normal or Special Summoned: You can activate 1 of these effects.\r\n\u25cf Destroy Spells/Traps on the field, up to the number of "HERO" monsters you control, except this card.\r\n\u25cf Add 1 "HERO" monster from your Deck to your hand.',
  },
  trickstarLightStage: {
    name: 'Trickstar Light Stage',
    description:
      'When this card is activated: You can add 1 "Trickstar" monster from your Deck to your hand. Once per turn: You can target 1 Set card in your opponent\'s Spell & Trap Zone; while this card is in the Field Zone, that Set card cannot be activated until the End Phase, and your opponent must activate it during the End Phase or else send it to the GY. Each time a "Trickstar" monster you control inflicts battle or effect damage to your opponent, inflict 200 damage to them.',
  },
  aIConnect: {
    name: 'A.I. Connect',
    description:
      'Reveal 1 Cyberse monster in your hand; apply this effect based on its Attribute, also you cannot Special Summon for the rest of this turn after this card resolves, except Cyberse monsters.\r\n\u25cf DARK: Special Summon the revealed monster, and if you do, add 1 Level 4 or lower non-DARK Cyberse monster from your Deck to your hand.\r\n\u25cf Other: Shuffle the revealed monster into the Deck, and if you do, add 1 "@Ignister" monster with a different Attribute from your Deck to your hand.\r\nYou can only activate 1 "A.I. Connect" per turn.',
  },
  ashBlossomJoyousSpring: {
    name: 'Ash Blossom & Joyous Spring',
    description:
      'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\r\n\u25cf Add a card from the Deck to the hand.\r\n\u25cf Special Summon from the Deck.\r\n\u25cf Send a card from the Deck to the GY.\r\nYou can only use this effect of "Ash Blossom & Joyous Spring" once per turn.',
  },
  blueEyesWhiteDragon: {
    name: 'Blue-Eyes White Dragon',
    description:
      'This legendary dragon is a powerful engine of destruction. Virtually invincible, very few have faced this awesome creature and lived to tell the tale.',
  },
} satisfies Record<string, CardFixture>;

/** Vocabulary covering the fixtures, so specs never touch the database. */
export const FIXTURE_ARCHETYPES = new Set([
  'HERO',
  'Elemental HERO',
  'Sky Striker Ace',
  'Trickstar',
  '@Ignister',
]);

export const FIXTURE_RACES = new Set([
  'Warrior',
  'Spellcaster',
  'Psychic',
  'Dragon',
  'Cyberse',
  'Beast',
  'Beast-Warrior',
  'Winged Beast',
  'Fiend',
  'Machine',
]);

/**
 * Cards that grant themselves another name, copied VERBATIM from the seeded
 * database, together with the near-miss phrasings that must NOT parse.
 *
 * The rejection half is the important half: `treated as` and `name becomes`
 * both appear far more often as ordinary effect text than as an alias, so a
 * loose rule here would invent hundreds of wrong graph edges.
 */
export const ALIAS_FIXTURES = {
  fallenOfTheWhiteDragon: {
    name: 'Fallen of the White Dragon',
    description:
      '(This card is always treated as "Fallen of Albaz".)\r\nIf this card is in your hand: You can send 1 monster that mentions "Fallen of Albaz" from your Extra Deck to the GY; Special Summon this card, also you cannot Special Summon from the Extra Deck for the rest of this turn, except Level 8 Fusion or Synchro Monsters. If this card is Normal or Special Summoned: You can Special Summon 1 "Ecclesia" monster from your hand, Deck, or GY. You can only use each effect of "Fallen of the White Dragon" once per turn.',
  },
  toonSummonedSkull: {
    name: 'Toon Summoned Skull',
    description:
      '(This card is always treated as an "Archfiend" card.)\nCannot be Normal Summoned/Set. Must first be Special Summoned (from your hand) by Tributing 1 monster, while you control "Toon World". Cannot attack the turn it is Special Summoned. You must pay 500 LP to declare an attack with this monster. If "Toon World" on the field is destroyed, destroy this card. Can attack your opponent directly, unless they control a Toon monster, in which case this card must target a Toon monster for its attacks.',
  },
  fusionSubstitute: {
    name: 'Fusion Substitute',
    description:
      '(This card\'s name is always treated as "Polymerization".)\r\nFusion Summon 1 Fusion Monster from your Extra Deck, using monsters you control as Fusion Material. You can banish this card from your GY, then target 1 Fusion Monster in your GY; return it to the Extra Deck, then draw 1 card.',
  },
  raidersWing: {
    name: "Raider's Wing",
    description:
      '(This card is always treated as a "The Phantom Knights" and "Raidraptor" card.)\r\nIf this card is in your hand or GY: You can detach 1 material from your DARK Xyz Monster; Special Summon this card, but banish it when it leaves the field. You can only use this effect of "Raider\'s Wing" once per turn. An Xyz Monster whose original Attribute is DARK and has this card as material gains this effect.\r\n\u25cf Your opponent cannot target this card with card effects.',
  },
  fandora: {
    name: 'Fandora, the Flying Fighting Furtress',
    description:
      '(This card is always treated as a card "Fur Hire".)\r\nMonsters "Fur Hire" you control gain 300 ATK for each monster "Fur Hire" you control with a different name. You can only use each of the following effects of "Fandora, the Flying Fighting Furtress" once per turn. During your Main Phase: You can add 1 monster "Fur Hire" from your Deck to your hand, then discard 1 card. If a face-up monster(s) "Fur Hire" you control is destroyed by an opponent\'s card effect (except during the Damage Step): You can Special Summon 1 monster "Fur Hire" from your Deck.',
  },
  scarredDragonArchfiend: {
    name: 'Scarred Dragon Archfiend',
    description:
      '1 Tuner + 1+ non-Tuner DARK monsters\r\nThis card\'s name becomes "Red Dragon Archfiend" while on the field or in the GY. If this card is sent from the Monster Zone to the GY: You can Special Summon 1 "Red Dragon Archfiend" from your Extra Deck (this is treated as a Synchro Summon), then, if this card was sent to the GY as Synchro Material for a DARK Dragon Synchro Monster, you can destroy all Attack Position monsters your opponent controls. You can only use this effect of "Scarred Dragon Archfiend" once per turn.',
  },
  amazonessBabyTiger: {
    name: 'Amazoness Baby Tiger',
    description:
      'This card\'s name becomes "Amazoness Tiger" while on the field or in the GY. If an "Amazoness" monster is Normal or Special Summoned to your field while this card is in your hand or GY: You can Special Summon this card. You can only use this effect of "Amazoness Baby Tiger" once per turn. Gains 100 ATK for each "Amazoness" card in your GY.',
  },
  blazeAcceleratorReload: {
    name: 'Blaze Accelerator Reload',
    description:
      'This card\'s name becomes "Tri-Blaze Accelerator" while in the Spell & Trap Zone. During either player\'s Main Phase: You can send 1 "Volcanic" card from your hand to the Graveyard, and if you do, draw 1 card. You can only use this effect of "Blaze Accelerator Reload" once per turn. During either player\'s Main Phase: You can banish this card from your Graveyard; send 1 "Volcanic" card from your Deck to the Graveyard.',
  },
  mokeyMokeyAdrift: {
    name: 'Mokey Mokey Adrift',
    description:
      'This card\'s name becomes "Mokey Mokey" and is treated as a Normal Monster while face-up on the field or in the GY. You can discard this card; add 1 "Mokey Mokey" card from your Deck to your hand, except "Mokey Mokey Adrift".',
  },
  ultimitlBishbaalkin: {
    name: 'Phantasmal Lord Ultimitl Bishbaalkin',
    description:
      "(This card's original Level is always treated as 12.)\nCannot be Synchro Summoned. Must be Special Summoned (from your Extra Deck) by sending 2 Level 8 or higher monsters you control with the same Level to the Graveyard (1 Tuner and 1 non-Tuner), and cannot be Special Summoned by other ways. Cannot be destroyed by card effects. This card gains 1000 ATK for each monster on the field. Once per turn, during either player's Main Phase: You can Special Summon the same number of \"Utchatzimime Tokens\" (Fiend-Type/DARK/Level 1/ATK 0/DEF 0) on each player's field in Defense Position, so as to Summon as many as possible, also this card cannot attack for the rest of this turn.",
  },
  infernoidDecatron: {
    name: 'Infernoid Decatron',
    description:
      'If this card is Normal or Special Summoned: You can send 1 "Infernoid" monster from your Deck to the Graveyard, except "Infernoid Decatron", and if you do, increase this card\'s Level by the Level of the sent monster, and if you do that, this card\'s name becomes that monster\'s, and replace this effect with that monster\'s original effects.',
  },
  epsilonTheMagnetWarrior: {
    name: 'Epsilon The Magnet Warrior',
    description:
      'If this card is Normal or Special Summoned: You can send 1 Level 4 or lower "Magnet Warrior" monster from your Deck to the GY, except "Epsilon The Magnet Warrior"; this card\'s name becomes the sent monster\'s name (until the End Phase), then you can Special Summon 1 "Magnet Warrior" or "Magna Warrior" monster from your GY with a different name than the cards you control. You can only use this effect of "Epsilon The Magnet Warrior" once per turn.',
  },
  superSoldierSoul: {
    name: 'Super Soldier Soul',
    description:
      'You can send 1 "Black Luster Soldier" monster from your hand to the Graveyard; until your opponent\'s next End Phase, this card\'s ATK becomes 3000, and this card\'s name becomes "Black Luster Soldier". You can banish this card from your Graveyard; add 1 "Beginning Knight" or "Evening Twilight Knight" from your Deck to your hand. You can only use each effect of "Super Soldier Soul" once per turn.',
  },
  tikiPeace: {
    name: 'Tiki Peace',
    description:
      'Special Summon this card as an Effect Monster (Rock/EARTH/Level 4/ATK 1800/DEF 1800) with the following effect (this card is also still a Trap).\r\n\u25cf (Quick Effect): You can pay 800 LP; Special Summon 1 Continuous Trap, except "Tiki Peace", from your GY or banishment as a Normal Monster (Rock/EARTH/Level 4/ATK 1000/DEF 1000) and its name becomes "Tiki Peace" (even while face-down) (that card is NOT treated as a Trap). You can only use this effect of "Tiki Peace" once per turn.',
  },
  dupeFrog: {
    name: 'Dupe Frog',
    description:
      'This card\'s name becomes "Des Frog" while it is on the field. Monsters your opponent controls cannot target monsters for attacks, except this one. When this card is sent from the field to the Graveyard: You can add 1 "Frog" monster from your Deck or Graveyard to your hand, except "Dupe Frog".',
  },
} satisfies Record<string, CardFixture>;
