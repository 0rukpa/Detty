/**
 * Seed the database.
 *
 *   npm run db:seed             Gbedu packs only (safe for the live site)
 *   npm run db:seed -- --demo   also ~25 mock Nigerian events + mock Plugs, for local demos
 *   npm run db:remove-demo      shows what the mock data is; add `-- --yes` to delete it
 *
 * Idempotent: fixed host ids, and seeded hosts' events are replaced on each run.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { parseDatabaseUrl } from "../src/db/url";
import { processFlyer, processImage } from "../src/features/events/watermark";
import type { EventCategory } from "../src/config/app";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}
const p = parseDatabaseUrl(url);
const client = postgres({ host: p.host, port: p.port, database: p.database, username: p.user, password: p.password, ssl: "require", prepare: false, max: 1 });
const db = drizzle(client, { schema });

const hostId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Host = Omit<schema.NewUser, "id" | "dob"> & { n: number };
const HOSTS: Host[] = [
  { n: 1, handle: "lagosafterdark", displayName: "Lagos After Dark", homeState: "Lagos", homeCity: "Victoria Island", bio: "The rave that never sleeps.", isPlug: true, plugStatus: "verified", certifiedPlug: true, ratingAvg: 4.7, ratingCount: 148, vibeTags: ["Rave", "Afro House"] },
  { n: 2, handle: "mainland.block", displayName: "Mainland Block Party", homeState: "Lagos", homeCity: "Yaba", bio: "Mainland to the world.", isPlug: true, plugStatus: "verified", certifiedPlug: true, ratingAvg: 4.5, ratingCount: 212, vibeTags: ["Afrobeats", "Street-Hop"] },
  { n: 3, handle: "abujasocial", displayName: "Abuja Social Club", homeState: "FCT", homeCity: "Abuja", bio: "Capital city vibes only.", isPlug: true, plugStatus: "verified", ratingAvg: 4.3, ratingCount: 41, vibeTags: ["Amapiano", "Brunch"] },
  { n: 4, handle: "ph_vibes", displayName: "PH City Vibes", homeState: "Rivers", homeCity: "Port Harcourt", bio: "Garden City, we outside.", isPlug: true, plugStatus: "verified", ratingAvg: 4.1, ratingCount: 27, vibeTags: ["Afrobeats", "Highlife"] },
  { n: 5, handle: "coalcity.live", displayName: "Coal City Live", homeState: "Enugu", homeCity: "Enugu", bio: "042 stand up.", isPlug: true, plugStatus: "verified", ratingAvg: 4.4, ratingCount: 63, vibeTags: ["Highlife", "Hip-Hop"] },
  { n: 6, handle: "southsouth.picnics", displayName: "South South Picnics", homeState: "Cross River", homeCity: "Calabar", bio: "Soft life, daytime edition.", isPlug: true, plugStatus: "pending", ratingAvg: 0, ratingCount: 0, vibeTags: ["Chill", "Games"] },
  // Vendors who co-sign events ("DJ confirmed" chips).
  { n: 7, handle: "dj_kulet", displayName: "DJ Kulet", homeState: "Lagos", homeCity: "Lekki", bio: "Afro house and amapiano selector.", vibeTags: ["Afro House", "Amapiano"] },
  { n: 8, handle: "hypeman_slimz", displayName: "Slimz the Hypeman", homeState: "Lagos", homeCity: "Yaba", bio: "If the crowd is quiet, call me.", vibeTags: ["Street-Hop"] },
];

/** [event title, vendor host number, vendor type] */
const COSIGNS: [string, number, string][] = [
  ["White Noise: All-White Rave", 7, "dj"],
  ["White Noise: All-White Rave", 8, "hypeman"],
  ["Mainland Block Party: December Edition", 8, "hypeman"],
  ["Detty Countdown: New Year's Eve", 7, "dj"],
];

// ---------- generated demo flyers ----------
const GRADIENTS: Record<EventCategory, [string, string, string]> = {
  party: ["#8b3dff", "#ff2e93", "#ff7a1a"],
  rave: ["#12062b", "#8b3dff", "#c6ff3d"],
  picnic: ["#7bd630", "#2ee6c8", "#4d8dff"],
  day_party: ["#ff7a1a", "#ff2e93", "#8b3dff"],
  beach: ["#2ee6c8", "#4d8dff", "#8b3dff"],
  concert: ["#ff2e93", "#8b3dff", "#12062b"],
  owambe: ["#ffb020", "#ff7a1a", "#ff2e93"],
  game_night: ["#4d8dff", "#8b3dff", "#ff2e93"],
  brunch: ["#ffb020", "#ff2e93", "#8b3dff"],
  other: ["#1c1924", "#8b3dff", "#ff2e93"],
};

const xml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;");

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const flyerDate = new Intl.DateTimeFormat("en-NG", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

/** A simple typographic flyer so the demo has real images to watermark. */
function flyerSvg(e: Seed): string {
  const [a, b, c] = GRADIENTS[e.category];
  const lines = wrap(e.title.toUpperCase(), 13);
  const size = lines.length > 4 ? 96 : 118;
  const startY = 560 - (lines.length * size) / 2;
  const title = lines
    .map(
      (l, i) =>
        `<text x="80" y="${startY + i * size * 1.02}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" fill="#fff">${xml(l)}</text>`,
    )
    .join("");
  const dots = Array.from(
    { length: 14 },
    (_, i) =>
      `<circle cx="${(i * 197) % 1080}" cy="${(i * 331) % 1350}" r="${40 + ((i * 53) % 140)}" fill="#fff" fill-opacity="0.05"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#g)"/>${dots}<rect width="1080" height="1350" fill="url(#s)"/>
  <text x="80" y="130" font-family="Arial, sans-serif" font-weight="700" font-size="34" letter-spacing="8" fill="#fff" fill-opacity="0.9">${xml(e.theme.toUpperCase().slice(0, 40))}</text>
  ${title}
  <text x="80" y="1130" font-family="Arial, sans-serif" font-weight="700" font-size="44" fill="#c6ff3d">${xml(flyerDate.format(e.starts))}</text>
  <text x="80" y="1195" font-family="Arial, sans-serif" font-size="38" fill="#fff">${xml(e.venue)}</text>
  <text x="80" y="1250" font-family="Arial, sans-serif" font-size="32" fill="#fff" fill-opacity="0.8">${xml(e.city)}, ${xml(e.state)}</text>
</svg>`;
}

const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "event-media";
const storage =
  storageUrl && serviceKey
    ? createClient(storageUrl, serviceKey, { auth: { persistSession: false } }).storage
    : null;

async function upload(path: string, body: Buffer): Promise<string> {
  const { error } = await storage!.from(BUCKET).upload(path, body, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
  return `${storageUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** A Date at `hour` Lagos time (UTC+1), `days` from today. */
function inDays(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour - 1, minute, 0, 0);
  return d;
}

/** A Date at `hour` Lagos time on a fixed day of the coming Detty December (Dec 15 – Jan 5). */
function december(day: number, hour: number): Date {
  const now = new Date();
  // Use this year's December unless it has fully passed.
  const year = now.getUTCMonth() === 0 && now.getUTCDate() <= 5 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  // day > 31 rolls into January (32 = Jan 1).
  return new Date(Date.UTC(year, 11, day, hour - 1, 0, 0));
}

type Tier = [name: string, naira: number, quantity: number];
type Seed = {
  host: number;
  title: string;
  category: EventCategory;
  theme: string;
  themeTags: string[];
  vibeTags: string[];
  starts: Date;
  hours: number;
  venue: string;
  address: string;
  state: string;
  city: string;
  lat: number;
  lng: number;
  ageMin?: number;
  tiers: Tier[];
  description: string;
};

const EVENTS: Seed[] = [
  // ---- Lagos ----
  { host: 1, title: "White Noise: All-White Rave", category: "rave", theme: "All white everything", themeTags: ["all-white", "rave", "neon"], vibeTags: ["Rave", "Afro House"], starts: december(20, 22), hours: 8, venue: "The Warehouse, Lekki", address: "Admiralty Way, Lekki Phase 1", state: "Lagos", city: "Lekki", lat: 6.4474, lng: 3.4723, tiers: [["Early Bird", 8000, 300], ["Regular", 12000, 600], ["VIP", 35000, 80]], description: "Lagos' biggest all-white rave returns for Detty December. Three stages, sunrise set, strict all-white dress code." },
  { host: 1, title: "Sunrise Sessions: Afro House on the Beach", category: "beach", theme: "Beach rave, linen and shades", themeTags: ["beach", "linen", "festival"], vibeTags: ["Afro House", "Beach"], starts: december(27, 16), hours: 12, venue: "Landmark Beach", address: "Water Corporation Rd, Oniru", state: "Lagos", city: "Victoria Island", lat: 6.4216, lng: 3.4441, tiers: [["General", 10000, 800], ["Cabana for 6", 250000, 12]], description: "Sunset to sunrise on the sand. Afro house, amapiano and a firework countdown." },
  { host: 1, title: "Low Light: Techno Thursday", category: "rave", theme: "All black", themeTags: ["all-black", "rave"], vibeTags: ["Rave"], starts: inDays(3, 22), hours: 6, venue: "Basement 44", address: "Idowu Martins St, Victoria Island", state: "Lagos", city: "Victoria Island", lat: 6.4311, lng: 3.4205, tiers: [["Regular", 7000, 200]], description: "Dark room, loud system. Lagos underground techno, every other Thursday." },
  { host: 2, title: "Mainland Block Party: December Edition", category: "party", theme: "Streetwear", themeTags: ["streetwear", "sneakers"], vibeTags: ["Afrobeats", "Street-Hop"], starts: december(23, 17), hours: 9, venue: "Secret Garden, Ikeja", address: "Isaac John St, Ikeja GRA", state: "Lagos", city: "Ikeja", lat: 6.5833, lng: 3.3577, tiers: [["Early Bird", 5000, 500], ["Regular", 8000, 1500], ["VIP", 25000, 150]], description: "The original block party. Street food, sneakers, and the best Afrobeats DJs on the mainland." },
  { host: 2, title: "Yaba Game Night: FIFA, Ludo and Whot", category: "game_night", theme: "Come as you are", themeTags: ["casual"], vibeTags: ["Games", "Chill"], starts: inDays(5, 18), hours: 5, venue: "Hub 9", address: "Herbert Macaulay Way, Yaba", state: "Lagos", city: "Yaba", lat: 6.5095, lng: 3.3711, ageMin: 16, tiers: [["Entry", 3000, 120], ["Squad of 4", 10000, 30]], description: "FIFA tournament with cash prizes, Ludo, Whot, Jenga and small chops all night." },
  { host: 2, title: "Sunday Service Brunch", category: "brunch", theme: "Pastels and soft life", themeTags: ["pastel", "brunch", "chic"], vibeTags: ["Brunch", "Amapiano"], starts: inDays(9, 12), hours: 6, venue: "The Rooftop, Ikoyi", address: "Kingsway Rd, Ikoyi", state: "Lagos", city: "Ikoyi", lat: 6.4541, lng: 3.4347, tiers: [["Brunch Pass", 20000, 150], ["Table for 6", 150000, 15]], description: "Bottomless mimosas, amapiano and a view. Lagos brunch done properly." },
  { host: 2, title: "Owambe Rewind: 90s Lagos Party", category: "owambe", theme: "Aso-ebi, gele and agbada", themeTags: ["owambe", "aso-ebi", "gele", "agbada"], vibeTags: ["Owambe", "Highlife"], starts: december(28, 15), hours: 8, venue: "Balmoral Hall, Federal Palace", address: "Ahmadu Bello Way, Victoria Island", state: "Lagos", city: "Victoria Island", lat: 6.4253, lng: 3.4095, tiers: [["Regular", 15000, 400], ["Table for 10", 300000, 20]], description: "Live band, juju classics, spraying allowed. Dress like it is your cousin's wedding in 1996." },
  { host: 1, title: "Detty Countdown: New Year's Eve", category: "concert", theme: "Glitter and gold", themeTags: ["glam", "gold", "sequins"], vibeTags: ["Afrobeats", "Amapiano"], starts: december(31, 20), hours: 9, venue: "Eko Atlantic Grounds", address: "Eko Atlantic City", state: "Lagos", city: "Victoria Island", lat: 6.4079, lng: 3.4067, tiers: [["General", 20000, 3000], ["VIP", 75000, 400], ["Table for 8", 1000000, 30]], description: "Count down to the new year with surprise headliners and the biggest fireworks in Lagos." },
  { host: 2, title: "Tarkwa Bay Picnic and Boat Day", category: "picnic", theme: "Beach day fits", themeTags: ["beach", "swimwear", "linen"], vibeTags: ["Beach", "Chill"], starts: inDays(12, 10), hours: 8, venue: "Tarkwa Bay Beach", address: "Boats leave from Tarzan Jetty, Lekki", state: "Lagos", city: "Lagos Island", lat: 6.4023, lng: 3.3958, ageMin: 0, tiers: [["Boat + Picnic", 18000, 100]], description: "Boat ride, picnic baskets, volleyball and suya on the beach. All ages welcome." },

  // ---- Abuja ----
  { host: 3, title: "Capital Amapiano Night", category: "party", theme: "Clubwear", themeTags: ["clubwear", "all-black"], vibeTags: ["Amapiano"], starts: inDays(2, 22), hours: 6, venue: "Sky Lounge, Wuse 2", address: "Aminu Kano Crescent, Wuse 2", state: "FCT", city: "Abuja", lat: 9.0786, lng: 7.4701, tiers: [["Regular", 10000, 250], ["VIP", 30000, 60]], description: "Log drums on the rooftop. Abuja's favourite amapiano night." },
  { host: 3, title: "Jabi Lake Sunset Picnic", category: "picnic", theme: "Cottagecore picnic", themeTags: ["picnic", "pastel", "florals"], vibeTags: ["Chill", "Games"], starts: inDays(6, 14), hours: 5, venue: "Jabi Lake Park", address: "Jabi Lake, Jabi", state: "FCT", city: "Abuja", lat: 9.0721, lng: 7.4149, ageMin: 0, tiers: [["Free entry", 0, 300]], description: "Bring a mat. Board games, paint and sip corner, and a live acoustic set at sunset." },
  { host: 3, title: "Abuja Detty Rave", category: "rave", theme: "Neon and reflective", themeTags: ["neon", "rave", "festival"], vibeTags: ["Rave", "Afro House"], starts: december(21, 21), hours: 8, venue: "The Dome", address: "Central Business District", state: "FCT", city: "Abuja", lat: 9.0563, lng: 7.4985, tiers: [["Early Bird", 7000, 400], ["Regular", 10000, 900], ["VIP", 30000, 100]], description: "The capital goes neon. UV paint, lasers and five DJs till morning." },
  { host: 3, title: "Bottomless Brunch: Maitama", category: "brunch", theme: "Sunday best", themeTags: ["brunch", "chic"], vibeTags: ["Brunch"], starts: december(26, 12), hours: 5, venue: "Cilantro Gardens", address: "Gana St, Maitama", state: "FCT", city: "Abuja", lat: 9.0882, lng: 7.4934, tiers: [["Brunch Pass", 25000, 120]], description: "Boxing Day brunch with bottomless cocktails and a live saxophonist." },

  // ---- Port Harcourt ----
  { host: 4, title: "Garden City Carnival Night", category: "concert", theme: "Carnival colours", themeTags: ["carnival", "colourful", "festival"], vibeTags: ["Afrobeats", "Highlife"], starts: december(22, 19), hours: 7, venue: "Liberation Stadium Grounds", address: "Stadium Rd, Elekahia", state: "Rivers", city: "Port Harcourt", lat: 4.8242, lng: 7.0198, tiers: [["Regular", 5000, 2000], ["VIP", 20000, 300]], description: "PH's biggest December concert. Live bands, Afrobeats headliners and street food village." },
  { host: 4, title: "PH Pool Party: Wet Season", category: "day_party", theme: "Swimwear and resort", themeTags: ["swimwear", "beach", "resort"], vibeTags: ["Afrobeats", "Beach"], starts: inDays(8, 13), hours: 7, venue: "Hotel Presidential Poolside", address: "Aba Rd, GRA Phase 2", state: "Rivers", city: "Port Harcourt", lat: 4.8156, lng: 7.0134, tiers: [["Regular", 8000, 250], ["Cabana for 5", 100000, 10]], description: "Day party by the pool. DJs, water guns and bole and fish on the grill." },
  { host: 4, title: "Bole Festival After Party", category: "party", theme: "Streetwear", themeTags: ["streetwear"], vibeTags: ["Street-Hop", "Afrobeats"], starts: inDays(15, 21), hours: 6, venue: "Casablanca Lounge", address: "Tombia St, GRA", state: "Rivers", city: "Port Harcourt", lat: 4.8312, lng: 7.0041, tiers: [["Regular", 6000, 300]], description: "The official after party. Come hungry, leave sweaty." },

  // ---- Ibadan ----
  { host: 2, title: "Ibadan Amala Rave", category: "rave", theme: "Brown and gold", themeTags: ["rave", "gold", "streetwear"], vibeTags: ["Rave", "Street-Hop"], starts: inDays(10, 21), hours: 7, venue: "Palms Mall Rooftop", address: "Ring Rd, Ibadan", state: "Oyo", city: "Ibadan", lat: 7.3623, lng: 3.8674, tiers: [["Early Bird", 4000, 300], ["Regular", 6000, 500]], description: "Amala first, rave after. Ibadan's wildest night with free amala at midnight." },
  { host: 2, title: "UI Throwback Day Party", category: "day_party", theme: "Y2K throwback", themeTags: ["y2k", "retro", "denim"], vibeTags: ["Hip-Hop", "Afrobeats"], starts: december(19, 14), hours: 7, venue: "Agodi Gardens", address: "Parliament Rd, Agodi", state: "Oyo", city: "Ibadan", lat: 7.4044, lng: 3.8997, ageMin: 16, tiers: [["Regular", 5000, 600]], description: "2000s hits only. Baggy jeans, durags and bandanas welcome." },

  // ---- Enugu ----
  { host: 5, title: "Coal City Highlife Night", category: "concert", theme: "Isiagu and native", themeTags: ["native", "isiagu", "owambe"], vibeTags: ["Highlife"], starts: inDays(4, 19), hours: 5, venue: "Nike Lake Resort", address: "Nike Lake Rd, Enugu", state: "Enugu", city: "Enugu", lat: 6.4951, lng: 7.5612, tiers: [["Regular", 7000, 400], ["Table for 6", 80000, 25]], description: "Live highlife band, palm wine bar and ogene. Wear your isiagu." },
  { host: 5, title: "042 Detty December Fest", category: "concert", theme: "Festival fits", themeTags: ["festival", "streetwear", "colourful"], vibeTags: ["Afrobeats", "Hip-Hop"], starts: december(24, 18), hours: 8, venue: "Michael Okpara Square", address: "Independence Layout", state: "Enugu", city: "Enugu", lat: 6.4402, lng: 7.5095, tiers: [["General", 5000, 2500], ["VIP", 20000, 300]], description: "Christmas Eve in the Coal City. The east's biggest homecoming concert." },
  { host: 5, title: "Enugu Rooftop Game Night", category: "game_night", theme: "Casual", themeTags: ["casual"], vibeTags: ["Games", "Chill"], starts: inDays(7, 18), hours: 5, venue: "The Deck, New Haven", address: "Chime Ave, New Haven", state: "Enugu", city: "Enugu", lat: 6.4527, lng: 7.5248, ageMin: 16, tiers: [["Entry", 2500, 100]], description: "Monopoly, karaoke, PS5 and pepper soup under the stars." },

  // ---- Calabar ----
  { host: 6, title: "Marina Resort Day Picnic", category: "picnic", theme: "Bright colours", themeTags: ["picnic", "colourful"], vibeTags: ["Chill", "Games"], starts: inDays(11, 12), hours: 6, venue: "Marina Resort", address: "Marina Rd, Calabar", state: "Cross River", city: "Calabar", lat: 4.9589, lng: 8.3143, ageMin: 0, tiers: [["Free entry", 0, 250]], description: "Free community picnic by the water. Bring your own basket, games provided." },
  { host: 4, title: "Calabar Carnival Street Party", category: "party", theme: "Carnival costumes and feathers", themeTags: ["carnival", "colourful", "festival"], vibeTags: ["Afrobeats", "Highlife"], starts: december(28, 16), hours: 10, venue: "Millennium Park", address: "Calabar Rd", state: "Cross River", city: "Calabar", lat: 4.9757, lng: 8.3417, tiers: [["Regular", 6000, 1500], ["VIP Stand", 25000, 200]], description: "Africa's biggest street party. Front-row stand tickets and the official after party." },

  // ---- Uyo ----
  { host: 4, title: "Uyo Beach Day at Ibeno", category: "beach", theme: "Beachwear", themeTags: ["beach", "swimwear", "linen"], vibeTags: ["Beach", "Afrobeats"], starts: december(30, 11), hours: 8, venue: "Ibeno Beach", address: "Bus leaves from Ibom Plaza, Uyo", state: "Akwa Ibom", city: "Uyo", lat: 4.5641, lng: 7.9766, tiers: [["Bus + Entry", 12000, 200]], description: "Road trip to the longest beach in West Africa. Bus, lunch and DJ included." },
  { host: 6, title: "Ibom Plaza Paint and Chill", category: "other", theme: "Clothes you can stain", themeTags: ["casual"], vibeTags: ["Chill"], starts: inDays(14, 15), hours: 4, venue: "Ibom Plaza", address: "Ikot Ekpene Rd, Uyo", state: "Akwa Ibom", city: "Uyo", lat: 5.0333, lng: 7.9266, ageMin: 0, tiers: [["Free entry", 0, 80]], description: "Free paint session, zobo and good conversation. Materials provided." },

  // ---- Benin ----
  { host: 5, title: "Benin City Bronze Ball", category: "owambe", theme: "Coral beads and royal red", themeTags: ["owambe", "beads", "native", "red"], vibeTags: ["Owambe", "Highlife"], starts: december(27, 17), hours: 7, venue: "Protea Hotel Hall", address: "Airport Rd, Benin City", state: "Edo", city: "Benin City", lat: 6.3176, lng: 5.6145, tiers: [["Regular", 10000, 350], ["Table for 8", 150000, 20]], description: "A royal-themed owambe. Coral beads, live band and Edo classics." },
  { host: 5, title: "Ring Road Rave", category: "rave", theme: "Neon", themeTags: ["neon", "rave"], vibeTags: ["Rave", "Street-Hop"], starts: inDays(13, 22), hours: 6, venue: "Club Joker", address: "Sapele Rd, Benin City", state: "Edo", city: "Benin City", lat: 6.3098, lng: 5.6231, tiers: [["Regular", 5000, 300], ["VIP", 15000, 50]], description: "Benin's loudest night. Glow sticks at the door." },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const DAY_CATEGORIES: EventCategory[] = ["picnic", "day_party", "beach", "brunch", "other"];

async function seedPacks() {
  // Default Gbedu packs (spec 7.3).
  await db.delete(schema.gbeduPacks);
  await db.insert(schema.gbeduPacks).values([
    { gbdAmount: 500, jaraBonus: 0, priceKobo: 500_000 },
    { gbdAmount: 1000, jaraBonus: 100, priceKobo: 1_000_000 },
    { gbdAmount: 2000, jaraBonus: 400, priceKobo: 2_000_000 },
    { gbdAmount: 5000, jaraBonus: 1500, priceKobo: 5_000_000 },
  ]);
}

async function main() {
  if (!process.argv.includes("--demo")) {
    await seedPacks();
    console.log("Seeded 4 Gbedu packs. No mock events added (pass --demo for those).");
    return;
  }
  const hostIds = HOSTS.map((h) => hostId(h.n));

  for (const { n, ...h } of HOSTS) {
    const row = { id: hostId(n), dob: "1995-06-15", ...h };
    await db.insert(schema.users).values(row).onConflictDoUpdate({ target: schema.users.id, set: row });
    await db.insert(schema.avatars).values({ userId: row.id }).onConflictDoNothing();
  }

  // Replace seeded events (tiers cascade).
  await db.delete(schema.events).where(inArray(schema.events.ownerId, hostIds));

  if (storage) {
    const { error } = await storage.createBucket(BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Bucket: ${error.message}`);
  } else {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set: seeding without flyers.");
  }
  const idByTitle = new Map<string, string>();

  for (const e of EVENTS) {
    const isDay = DAY_CATEGORIES.includes(e.category) || e.starts.getUTCHours() + 1 < 17;
    const [event] = await db
      .insert(schema.events)
      .values({
        slug: slugify(e.title),
        ownerId: hostId(e.host),
        title: e.title,
        description: e.description,
        category: e.category,
        theme: e.theme,
        themeTags: e.themeTags,
        vibeTags: e.vibeTags,
        ageMin: e.ageMin ?? (isDay ? 0 : 18),
        timeOfDay: isDay ? "day" : "night",
        startsAt: e.starts,
        endsAt: new Date(e.starts.getTime() + e.hours * 3_600_000),
        doorsAt: new Date(e.starts.getTime() - 3_600_000),
        venueName: e.venue,
        address: e.address,
        state: e.state,
        city: e.city,
        lat: e.lat,
        lng: e.lng,
        status: "published",
      })
      .returning({ id: schema.events.id });

    await db.insert(schema.ticketTiers).values(
      e.tiers.map(([name, naira, quantity]) => ({
        eventId: event.id,
        name,
        priceKobo: naira * 100,
        quantity,
        perUserLimit: name.toLowerCase().includes("table") || name.toLowerCase().includes("cabana") ? 2 : 6,
      })),
    );
    idByTitle.set(e.title, event.id);

    if (storage) {
      const slug = slugify(e.title);
      const flyer = await processFlyer(Buffer.from(flyerSvg(e)), slug);
      const [url, watermarkedUrl] = await Promise.all([
        upload(`seed/${slug}/flyer.webp`, flyer.original),
        upload(`seed/${slug}/flyer-wm.webp`, flyer.watermarked),
      ]);
      await db.insert(schema.eventMedia).values({
        eventId: event.id,
        type: "flyer",
        url,
        watermarkedUrl,
        alt: `Flyer for ${e.title} at ${e.venue}, ${e.city}`,
        createdBy: hostId(e.host),
      });
    }
  }

  // Vendor co-signs.
  await db.insert(schema.eventCollaborators).values(
    COSIGNS.map(([title, vendor, vendorType]) => ({
      eventId: idByTitle.get(title)!,
      userId: hostId(vendor),
      role: "vendor" as const,
      vendorType,
      status: "accepted" as const,
    })),
  );

  // Two 24h stories on the headline rave.
  if (storage) {
    const rave = EVENTS[0];
    const stories = [
      ["Stage build day 1. This one is going to be mad.", "#12062b", "#8b3dff"],
      ["Early Bird is almost gone. Wear white or stay home.", "#ff2e93", "#ff7a1a"],
    ];
    for (const [i, [caption, a, b]] of stories.entries()) {
      const text = wrap(caption.toUpperCase(), 14)
        .map(
          (l, j) =>
            `<text x="90" y="${820 + j * 120}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="104" fill="#fff">${xml(l)}</text>`,
        )
        .join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/>${text}</svg>`;
      const url = await upload(`seed/${slugify(rave.title)}/story-${i}.webp`, await processImage(Buffer.from(svg)));
      await db.insert(schema.eventMedia).values({
        eventId: idByTitle.get(rave.title)!,
        type: "story",
        url,
        caption,
        createdBy: hostId(rave.host),
        order: i,
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      });
    }
  }

  await seedPacks();

  console.log(`Seeded ${HOSTS.length} users, ${EVENTS.length} events${storage ? " with watermarked flyers and 2 stories" : ""}, ${COSIGNS.length} co-signs and 4 Gbedu packs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
