/**
 * Every brand term lives here so the founder can rename things in one place.
 * Never hard-code "Plug", "Gbedu", "The Lounge" etc. in UI copy; import BRAND.
 */
export const BRAND = {
  appName: "Detty",
  tagline: "Find the party. Meet the people. Show up dressed.",
  domain: "detty.app",
  organiser: { singular: "Plug", plural: "Plugs" }, // organiser account title
  certifiedOrganiser: "Certified Plug", // 100+ ratings, avg > 4.0
  currency: { name: "Gbedu", code: "GBD", nairaPerUnit: 10 }, // 1 GBD = ₦10
  bonusCurrencyLabel: "Jara", // bonus coins on bigger packs
  eventChat: "The Lounge", // paid attendee group chat
  aiStylist: "Detty Stylist",
} as const;
