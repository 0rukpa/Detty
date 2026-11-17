/** All 36 Nigerian states + FCT with centre coordinates and major cities. */
export type NigerianState = {
  code: string;
  name: string;
  lat: number;
  lng: number;
  cities: string[];
};

export const NIGERIAN_STATES: NigerianState[] = [
  { code: "AB", name: "Abia", lat: 5.5320, lng: 7.4860, cities: ["Umuahia", "Aba"] },
  { code: "AD", name: "Adamawa", lat: 9.2035, lng: 12.4954, cities: ["Yola", "Mubi"] },
  { code: "AK", name: "Akwa Ibom", lat: 5.0377, lng: 7.9128, cities: ["Uyo", "Eket", "Ikot Ekpene"] },
  { code: "AN", name: "Anambra", lat: 6.2104, lng: 7.0700, cities: ["Awka", "Onitsha", "Nnewi"] },
  { code: "BA", name: "Bauchi", lat: 10.3158, lng: 9.8442, cities: ["Bauchi", "Azare"] },
  { code: "BY", name: "Bayelsa", lat: 4.9267, lng: 6.2676, cities: ["Yenagoa"] },
  { code: "BE", name: "Benue", lat: 7.7322, lng: 8.5391, cities: ["Makurdi", "Gboko", "Otukpo"] },
  { code: "BO", name: "Borno", lat: 11.8333, lng: 13.1500, cities: ["Maiduguri"] },
  { code: "CR", name: "Cross River", lat: 4.9757, lng: 8.3417, cities: ["Calabar", "Ikom", "Obudu"] },
  { code: "DE", name: "Delta", lat: 5.5325, lng: 5.8987, cities: ["Asaba", "Warri", "Sapele"] },
  { code: "EB", name: "Ebonyi", lat: 6.3249, lng: 8.1137, cities: ["Abakaliki"] },
  { code: "ED", name: "Edo", lat: 6.3350, lng: 5.6037, cities: ["Benin City", "Auchi", "Ekpoma"] },
  { code: "EK", name: "Ekiti", lat: 7.6211, lng: 5.2214, cities: ["Ado-Ekiti"] },
  { code: "EN", name: "Enugu", lat: 6.4584, lng: 7.5464, cities: ["Enugu", "Nsukka"] },
  { code: "FC", name: "FCT", lat: 9.0765, lng: 7.3986, cities: ["Abuja", "Gwagwalada"] },
  { code: "GO", name: "Gombe", lat: 10.2897, lng: 11.1673, cities: ["Gombe"] },
  { code: "IM", name: "Imo", lat: 5.4850, lng: 7.0351, cities: ["Owerri", "Orlu"] },
  { code: "JI", name: "Jigawa", lat: 11.7564, lng: 9.3390, cities: ["Dutse", "Hadejia"] },
  { code: "KD", name: "Kaduna", lat: 10.5105, lng: 7.4165, cities: ["Kaduna", "Zaria"] },
  { code: "KN", name: "Kano", lat: 12.0022, lng: 8.5920, cities: ["Kano"] },
  { code: "KT", name: "Katsina", lat: 12.9908, lng: 7.6018, cities: ["Katsina", "Funtua"] },
  { code: "KE", name: "Kebbi", lat: 12.4539, lng: 4.1975, cities: ["Birnin Kebbi"] },
  { code: "KO", name: "Kogi", lat: 7.8023, lng: 6.7333, cities: ["Lokoja", "Okene"] },
  { code: "KW", name: "Kwara", lat: 8.4966, lng: 4.5421, cities: ["Ilorin", "Offa"] },
  { code: "LA", name: "Lagos", lat: 6.5244, lng: 3.3792, cities: ["Lagos Island", "Victoria Island", "Lekki", "Ikeja", "Yaba", "Surulere", "Ikoyi", "Ajah"] },
  { code: "NA", name: "Nasarawa", lat: 8.4939, lng: 8.5153, cities: ["Lafia", "Keffi"] },
  { code: "NI", name: "Niger", lat: 9.6139, lng: 6.5569, cities: ["Minna", "Bida", "Suleja"] },
  { code: "OG", name: "Ogun", lat: 7.1475, lng: 3.3619, cities: ["Abeokuta", "Ijebu Ode", "Sagamu", "Ota"] },
  { code: "ON", name: "Ondo", lat: 7.2571, lng: 5.2058, cities: ["Akure", "Ondo"] },
  { code: "OS", name: "Osun", lat: 7.7827, lng: 4.5418, cities: ["Osogbo", "Ile-Ife", "Ilesa"] },
  { code: "OY", name: "Oyo", lat: 7.3775, lng: 3.9470, cities: ["Ibadan", "Ogbomoso", "Oyo"] },
  { code: "PL", name: "Plateau", lat: 9.8965, lng: 8.8583, cities: ["Jos"] },
  { code: "RI", name: "Rivers", lat: 4.8156, lng: 7.0498, cities: ["Port Harcourt", "Bonny", "Obio-Akpor"] },
  { code: "SO", name: "Sokoto", lat: 13.0059, lng: 5.2476, cities: ["Sokoto"] },
  { code: "TA", name: "Taraba", lat: 8.8937, lng: 11.3596, cities: ["Jalingo"] },
  { code: "YO", name: "Yobe", lat: 11.7480, lng: 11.9660, cities: ["Damaturu", "Potiskum"] },
  { code: "ZA", name: "Zamfara", lat: 12.1700, lng: 6.6600, cities: ["Gusau"] },
];

export const STATE_NAMES = NIGERIAN_STATES.map((s) => s.name);

export function getState(name: string): NigerianState | undefined {
  return NIGERIAN_STATES.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
