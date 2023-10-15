import axios from "axios";
import {
  DecoderType,
  array,
  inexact,
  maybe,
  number,
  object,
  optional,
  string,
} from "decoders";
import { existsSync, read, readFileSync, writeFileSync } from "fs";
import { flow, groupBy, sumBy, uniqBy } from "lodash/fp";
import { join } from "path";
import { createObjectCsvStringifier } from "csv-writer";
import csvToMarkdown from "csv-to-markdown-table";

const Card = inexact({
  code: string,
  faction_code: string,
  encounter_code: optional(string),
  encounter_name: optional(string),
  encounter_position: optional(number),
  pack_code: optional(string),
  pack_name: optional(string),
  quantity: maybe(number, 1),
});

type Card = DecoderType<typeof Card>;

const EncounterSet = object({
  encounter_code: string,
  encounter_name: string,
  pack_code: string,
  pack_name: string,
  cards: array(Card),
  card_count: number,
});

type EncounterSet = DecoderType<typeof EncounterSet>;

const README_FILE = join(__dirname, "..", "README.md");
const CARDS_FILE = join(__dirname, "..", "cards.json");
const ENCOUNTER_SETS_FILE = join(__dirname, "..", "encounter-sets.csv");

const getCards = async (): Promise<Card[]> => {
  if (existsSync(CARDS_FILE)) {
    return string
      .transform((value) => JSON.parse(value))
      .then(array(Card).decode)
      .verify(readFileSync(CARDS_FILE, "utf-8"));
  }
  const result = await axios.get(
    "https://arkhamdb.com/api/public/cards?encounter=1"
  );
  const { data } = result;
  const cards = array(Card).verify(data);
  writeFileSync(CARDS_FILE, JSON.stringify(cards));
  return cards;
};

const getEncounterSets = (cards: Card[]): EncounterSet[] => {
  const encounterCards = cards.filter((c) => !!c.encounter_code);
  const grouped = groupBy((c) => c.encounter_code, encounterCards);
  return uniqBy((c) => c.encounter_code, encounterCards)
    .map((c) => {
      const cards: Card[] =
        (c.encounter_code && grouped[c.encounter_code]) || [];
      return {
        encounter_code: c.encounter_code,
        encounter_name: c.encounter_name,
        pack_code: c.pack_code,
        pack_name: c.pack_name,
        cards,
        card_count: flow(
          uniqBy((c: Card) => c.encounter_position),
          sumBy((c: Card) => c.quantity)
        )(cards),
      };
    })
    .filter((e): e is EncounterSet => EncounterSet.decode(e).ok);
};

const main = async () => {
  const cards = await getCards();

  const encounterSets: EncounterSet[] = getEncounterSets(cards);

  const csvWriter = createObjectCsvStringifier({
    header: [
      { id: "pack_name", title: "Pack" },
      { id: "encounter_name", title: "Encounter Set" },
      { id: "card_count", title: "Card Count" },
    ],
  });

  const csvData =
    csvWriter.getHeaderString() + csvWriter.stringifyRecords(encounterSets);

  writeFileSync(
    README_FILE,
    `# Arkham Horror LCG Encounter Sets

    ${csvToMarkdown(csvData, ",", true)}
    `
  );

  writeFileSync(ENCOUNTER_SETS_FILE, csvData);
};

main();
