// Business settings shared by the shop page and the server.
// Times are Paris time. Prices are in euro cents.
const CONFIG = {
  name: "Montabo Soleil",
  tagline: "Cuisine guyanaise & caribéenne, faite maison à Paris",
  chef: "la cheffe",                                    // TODO: chef's first name
  market: {
    name: "Marché — lieu à confirmer",                  // TODO: market name
    address: "Adresse du marché, 75000 Paris",          // TODO
    mapUrl: "",                                         // optional Google Maps link
  },
  instagram: "",                                        // optional, e.g. "montabosoleil"
  pickup: {
    days: [6, 0],         // 0 = Sunday … 6 = Saturday
    open: "09:00",
    close: "17:00",
    slotMinutes: 30,
    leadMinutes: 90,      // earliest pickup = now + lead time
    windowDays: 14,       // how far ahead people can order
  },
  catering: {
    noticeDays: 4,        // trays must be requested this many days ahead
  },
  privateChef: {
    noticeDays: 10,
    minGuests: 6,
    maxGuests: 40,
    depositPercent: 30,
    // Île-de-France départements only
    postcodes: ["75", "77", "78", "91", "92", "93", "94", "95"],
    venues: [
      { id: "domicile", label: "Domicile privé (l'hôte est présent)" },
      { id: "salle", label: "Salle de réception louée" },
      { id: "entreprise", label: "Locaux d'entreprise" },
      { id: "association", label: "Association / lieu culturel" },
    ],
    events: ["Anniversaire", "Repas de famille", "Dîner entre amis", "Baptême / communion", "Mariage", "Dîner d'entreprise", "Autre"],
  },
};
if (typeof module !== "undefined") module.exports = CONFIG; else window.CONFIG = CONFIG;
