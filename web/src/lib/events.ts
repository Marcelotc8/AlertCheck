// Spanish names for NWS products (official data always comes in English).
// Place names (counties, zones) are not translated.
const EVENTS_ES: [RegExp, string][] = [
  [/^hurricane warning$/i, "Aviso de huracán"],
  [/^hurricane watch$/i, "Vigilancia de huracán"],
  [/^tropical storm warning$/i, "Aviso de tormenta tropical"],
  [/^tropical storm watch$/i, "Vigilancia de tormenta tropical"],
  [/^storm surge warning$/i, "Aviso de marejada ciclónica"],
  [/^storm surge watch$/i, "Vigilancia de marejada ciclónica"],
  [/^tornado warning$/i, "Aviso de tornado"],
  [/^tornado watch$/i, "Vigilancia de tornado"],
  [/^flash flood warning$/i, "Aviso de inundación repentina"],
  [/^flood warning$/i, "Aviso de inundación"],
  [/^flood watch$/i, "Vigilancia de inundación"],
  [/^severe thunderstorm warning$/i, "Aviso de tormenta severa"],
  [/^extreme wind warning$/i, "Aviso de vientos extremos"],
  [/^hurricane local statement$/i, "Declaración local de huracán"],
];

export function eventName(event: string, lang: "en" | "es"): string {
  if (lang === "en") return event;
  const hit = EVENTS_ES.find(([re]) => re.test(event.trim()));
  if (hit) return hit[1];
  const advisory = event.match(/^(Hurricane|Tropical Storm) (\S+) Public Advisory$/i);
  if (advisory) return `Boletín público ${advisory[1].toLowerCase() === "hurricane" ? "del huracán" : "de la tormenta tropical"} ${advisory[2]}`;
  return event;
}

// NWS zones: modifiers ("Northern", "Coastal"…) are translated, proper names are not.
const C = String.raw`(Palm Beach|St\. Lucie|Indian River|[\w-]+)`; // county (some are two words)
const r = (src: string) => new RegExp(src.replaceAll("{C}", C), "g");
const AREA_ES: [RegExp, string][] = [
  [/\bFlorida Keys\b/g, "Cayos de Florida"],
  [/\bFlorida Bay\b/g, "Bahía de Florida"],
  [/\bincluding\b/g, "incluidos"],
  [/\band\b/g, "y"],
  [/\bFlorida east coast south of the (.+?) County Line to (\w+)/g, "costa este de Florida desde el límite de los condados $1 hasta $2"],
  [/\bFlorida west coast from (\w+) northward/g, "costa oeste de Florida desde $1 hacia el norte"],
  [/\(([A-Za-z ]+(?:Warning|Watch))\)/g, "(§E§$1§E§)"],
  [/\bMonroe (Lower|Middle|Upper) Keys\b/g, "§K§$1§K§ de Monroe"],
  [r(String.raw`\bFar South {C}`), "extremo sur de $1"],
  [r(String.raw`\bSoutheastern {C}`), "sureste de $1"],
  [r(String.raw`\bSouthwestern {C}`), "suroeste de $1"],
  [r(String.raw`\bNortheastern {C}`), "noreste de $1"],
  [r(String.raw`\bNorthwestern {C}`), "noroeste de $1"],
  [r(String.raw`\bNorthern Mainland {C}`), "norte de $1 continental"],
  [r(String.raw`\bNorthern {C}`), "norte de $1"],
  [r(String.raw`\bSouthern {C}`), "sur de $1"],
  [r(String.raw`\bEastern {C}`), "este de $1"],
  [r(String.raw`\bWestern {C}`), "oeste de $1"],
  [r(String.raw`\bCoastal {C}`), "$1 costero"],
  [r(String.raw`\bInland {C}`), "$1 interior"],
  [r(String.raw`\b(?:Metro|Metropolitan) {C}`), "$1 metropolitano"],
  [r(String.raw`\bMainland {C}`), "$1 continental"],
];
const KEYS_ES: Record<string, string> = { Lower: "Cayos bajos", Middle: "Cayos medios", Upper: "Cayos altos" };

export function areaName(area: string, lang: "en" | "es"): string {
  if (lang === "en") return area;
  return area
    .split(";")
    .map((part) => AREA_ES.reduce((s, [re, to]) => s.replace(re, to), part).replace(/§K§(\w+)§K§/g, (_, k) => KEYS_ES[k] ?? k)
        .replace(/§E§(.+?)§E§/g, (_, e) => eventName(e, "es")))
    .join(";");
}
