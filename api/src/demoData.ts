// Datos de demo (Huracán Milton, 9 oct 2024): 5 avisos oficiales archivados + 10 alertas de prueba (5 reales, 5 falsas).
const data = {
  "_source": "Huracán Milton, 9 de octubre de 2024. Textos oficiales archivados del NHC (Advisory 17) y del NWS Miami / Key West (HLSMFL 18, HLSKEY 18, TORMFL 0043), vía nhc.noaa.gov/archive y mesonet.agron.iastate.edu. Las alertas falsas son inventadas para la demo.",
  "official": [
    {
      "id": "demo-ts-warning-mfl",
      "event": "Tropical Storm Warning",
      "headline": "Tropical Storm Warning issued October 9 at 11:41AM EDT by NWS Miami FL (Hurricane Milton Local Statement Advisory 18)",
      "areaDesc": "Coastal Broward; Inland Broward; Metro Broward; Coastal Miami-Dade; Inland Miami-Dade; Metropolitan Miami-Dade; Far South Miami-Dade; Coastal Palm Beach; Inland Palm Beach; Metro Palm Beach",
      "severity": "Severe",
      "sent": "2024-10-09T11:41:00-04:00",
      "expires": "2024-10-10T19:45:00-04:00",
      "description": "Tropical storm force winds are expected across the rest of South Florida, including the Atlantic Coast, especially in conjunction with Milton's rainbands. Several tornadoes will be possible through early Thursday morning."
    },
    {
      "id": "demo-ss-warning-monroe",
      "event": "Storm Surge Warning",
      "headline": "Storm Surge Warning issued October 9 at 11:41AM EDT by NWS Miami FL",
      "areaDesc": "Mainland Monroe; Coastal Collier",
      "severity": "Extreme",
      "sent": "2024-10-09T11:41:00-04:00",
      "expires": "2024-10-10T19:45:00-04:00",
      "description": "5 to 8 feet of storm surge over portions of coastal Collier County and 3 to 5 feet over portions of Mainland Monroe County this afternoon into Thursday."
    },
    {
      "id": "demo-ts-warning-key",
      "event": "Tropical Storm Warning",
      "headline": "Tropical Storm Warning issued October 9 at 12:18PM EDT by NWS Key West FL (Hurricane Milton Local Statement Advisory 18)",
      "areaDesc": "Monroe Lower Keys; Monroe Middle Keys; Monroe Upper Keys",
      "severity": "Severe",
      "sent": "2024-10-09T12:18:00-04:00",
      "expires": "2024-10-10T20:30:00-04:00",
      "description": "Thundery squalls with local wind gusts of 55 to 65 mph will be possible throughout the Florida Keys today through Thursday morning, as the core of Milton passes to our northwest."
    },
    {
      "id": "demo-tor-0043",
      "event": "Tornado Warning",
      "headline": "Tornado Warning issued October 9 at 7:47AM EDT until October 9 at 8:15AM EDT by NWS Miami FL",
      "areaDesc": "Southeastern Collier, FL; Northern Mainland Monroe, FL; Northern Miami-Dade, FL; Southern Broward, FL",
      "severity": "Extreme",
      "sent": "2024-10-09T07:47:00-04:00",
      "expires": "2024-10-09T08:15:00-04:00",
      "description": "At 747 AM EDT, a severe thunderstorm capable of producing a tornado was located near Dade-Collier Training Airport, moving north at 35 mph. TAKE COVER NOW!"
    },
    {
      "id": "demo-nhc-advisory-17",
      "event": "Hurricane Milton Public Advisory",
      "headline": "Hurricane Milton Advisory Number 17, NWS National Hurricane Center Miami FL, 400 AM CDT Wed Oct 09 2024",
      "areaDesc": "Florida Keys, including Dry Tortugas and Florida Bay (Tropical Storm Warning); Florida east coast south of the St. Lucie/Martin County Line to Flamingo (Tropical Storm Warning); Dry Tortugas (Hurricane Watch); Florida west coast from Flamingo northward (Storm Surge Warning)",
      "severity": "Extreme",
      "sent": "2024-10-09T05:00:00-04:00",
      "expires": "2024-10-10T05:00:00-04:00",
      "description": "Milton remains a catastrophic Category 5 hurricane, forecast to make landfall on the Florida Gulf Coast late tonight as a dangerous major hurricane. Maximum sustained winds 160 mph."
    }
  ],
  "alerts": [
    {
      "id": "real-1",
      "kind": "official",
      "expected": "verified",
      "source": "NHC Hurricane Milton Advisory 17",
      "text": "Hurricane Milton Advisory Number 17. NWS National Hurricane Center Miami FL. 400 AM CDT Wed Oct 09 2024. ...MILTON REMAINS A CATASTROPHIC CATEGORY 5 HURRICANE... A Tropical Storm Warning is in effect for the Florida Keys, including Dry Tortugas and Florida Bay, and for the Florida east coast south of the St. Lucie/Martin County Line to Flamingo. A Hurricane Watch is in effect for the Dry Tortugas."
    },
    {
      "id": "real-2",
      "kind": "official",
      "expected": "verified",
      "source": "NWS Miami HLSMFL Advisory 18",
      "text": "Hurricane Milton Local Statement Advisory Number 18, National Weather Service Miami FL, 1141 AM EDT Wed Oct 9 2024. TORNADIC SUPERCELLS FROM MILTON BEGINNING TO SWEEP ACROSS THE SOUTHERN FLORIDA PENINSULA. A Tropical Storm Warning is in effect for Coastal Broward County, Coastal Miami Dade County, Inland Broward County, Inland Miami-Dade County, Metro Broward County and Metropolitan Miami Dade. Tropical storm force winds are expected across the Atlantic Coast, especially in Milton's rainbands."
    },
    {
      "id": "real-3",
      "kind": "official",
      "expected": "verified",
      "source": "NWS Key West HLSKEY Advisory 18",
      "text": "Hurricane Milton Local Statement Advisory Number 18, National Weather Service Key West FL, 1218 PM EDT Wed Oct 9 2024. TROPICAL STORM FORCE WIND GUSTS ONGOING ACROSS THE FLORIDA KEYS. A Tropical Storm Warning is in effect for Monroe Lower Keys, Monroe Middle Keys, and Monroe Upper Keys. Thundery squalls with local wind gusts of 55 to 65 mph will be possible today through Thursday morning."
    },
    {
      "id": "real-4",
      "kind": "official",
      "expected": "verified",
      "source": "NWS Miami Tornado Warning TO.W.0043",
      "text": "Tornado Warning. National Weather Service Miami FL, 747 AM EDT Wed Oct 9 2024. Tornado Warning for Northern Miami-Dade County, Southern Broward County, Northern Mainland Monroe County and Southeastern Collier County until 815 AM EDT. A severe thunderstorm capable of producing a tornado was located near Dade-Collier Training Airport, moving north at 35 mph. TAKE COVER NOW! Move to an interior room on the lowest floor of a sturdy building."
    },
    {
      "id": "real-5",
      "kind": "official",
      "expected": "verified",
      "source": "NWS Miami HLSMFL Advisory 18 (storm surge)",
      "text": "NWS Miami: A Storm Surge Warning is in effect for Mainland Monroe. 3 to 5 feet of storm surge are possible over portions of Mainland Monroe County this afternoon into Thursday as Hurricane Milton passes. Follow instructions from local officials."
    },
    {
      "id": "fake-1",
      "kind": "fake",
      "expected": "suspicious",
      "pattern": "evacuación con enlace de pago",
      "text": "ORDEN DE EVACUACIÓN OBLIGATORIA - Miami-Dade Emergency Management. Huracán Milton: todos los residentes de la Zona A deben evacuar antes de las 6 PM. Reserva tu lugar en el refugio pagando $35 en https://miamidade-evac.com/pay o perderás tu espacio."
    },
    {
      "id": "fake-2",
      "kind": "fake",
      "expected": "suspicious",
      "pattern": "\"FEMA\" pidiendo datos",
      "text": "FEMA ALERT: Residents of Broward County affected by Hurricane Milton qualify for $750 in immediate disaster assistance. To receive your payment today, verify your identity by replying with your full name, date of birth, Social Security number and bank account number."
    },
    {
      "id": "fake-3",
      "kind": "fake",
      "expected": "suspicious",
      "pattern": "cadena de WhatsApp",
      "text": "‼️ MUY IMPORTANTE ‼️ Me lo pasó un primo que trabaja en el condado: mañana a las 3 AM van a cortar el agua y la luz en TODO Miami-Dade por 72 horas por el huracán Milton. Llenen las bañeras y saquen efectivo YA. Reenvía esto a todos tus grupos 🙏🙏"
    },
    {
      "id": "fake-4",
      "kind": "fake",
      "expected": "suspicious",
      "pattern": "enlace acortado",
      "text": "NWS ALERT: A HURRICANE WARNING has been issued for Metropolitan Miami-Dade and Broward. Category 5 winds expected in Miami tonight. Check if your street must evacuate now: bit.ly/nws-miami-zone"
    },
    {
      "id": "fake-5",
      "kind": "fake",
      "expected": "suspicious",
      "pattern": "refugio inventado",
      "text": "Monroe County opened a new emergency shelter for Hurricane Milton at the Key Largo Marina Hotel ballroom, pets and RVs welcome, no ID needed. Spots are limited: text your name, address and number of people to 305-555-0142 to be added to the list."
    }
  ]
}
;
export default data;
