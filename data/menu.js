// Sample catalogue shared by the shop page and the server (the server recomputes prices from it).
// Prices are in euro cents, TTC. Allergen ids follow the 14 EU allergens (règlement INCO).
// Everything here is placeholder content until the chef sends the real menu and prices.
const MENU = (function () {
  // Option groups reused by several dishes. Functions return fresh copies so items never share objects.
  const accomp = () => ({
    id: "accomp", name: "Accompagnement", required: true, choices: [
      { id: "riz", name: "Riz blanc", price: 0 },
      { id: "haricots", name: "Riz & haricots rouges", price: 100 },
      { id: "couac", name: "Couac", price: 50 },
    ],
  });
  const piment = () => ({
    id: "piment", name: "Piment", required: true, choices: [
      { id: "doux", name: "Doux", price: 0 },
      { id: "moyen", name: "Moyen", price: 0 },
      { id: "fort", name: "Fort 🔥", price: 0 },
    ],
  });
  const taille = (extra) => ({
    id: "taille", name: "Format", required: true, choices: [
      { id: "50cl", name: "50 cl", price: 0 },
      { id: "1l", name: "1 L", price: extra },
    ],
  });

  return {
    sample: true, // placeholder content until the chef sends the real menu and prices
    categories: [
      { id: "plats", name: "Plats", blurb: "Les grands classiques de Guyane et des Antilles, mijotés le matin même et servis en barquette chaude." },
      { id: "boulangerie", name: "Boulangerie & douceurs", blurb: "Pâtés créoles, gâteaux coco et douceurs de manioc, comme dans les boulangeries de Cayenne." },
      { id: "boissons", name: "Boissons", blurb: "Jus de fruits pressés et boissons maison, toutes sans alcool, servies bien fraîches." },
      { id: "epices", name: "Épices & condiments", blurb: "Mélanges et condiments préparés à la main pour cuisiner créole chez vous." },
    ],

    items: [
      // ---------- Plats ----------
      {
        id: "bouillon-awara", cat: "plats", name: "Bouillon d'awara",
        desc: "Le plat de Pâques guyanais : pâte d'awara mijotée des heures avec viandes boucanées, crabe et légumes. Sur commande uniquement.",
        price: 1600, unit: "la barquette",
        options: [accomp()],
        allergens: ["crustaces", "poissons", "celeri"],
        tags: ["signature"], emoji: "🍲", img: null,
      },
      {
        id: "colombo-poulet", cat: "plats", name: "Colombo de poulet",
        desc: "Poulet mariné au citron vert puis mijoté avec notre poudre à colombo maison, pommes de terre et giraumon.",
        price: 1400, unit: "la barquette",
        options: [accomp(), piment()],
        allergens: ["celeri", "moutarde"],
        tags: ["signature", "epice"], emoji: "🍛", img: null,
      },
      {
        id: "fricassee-poulet", cat: "plats", name: "Fricassée de poulet",
        desc: "Morceaux de poulet dorés puis mijotés dans une sauce tomate aux cives, thym et ail. Le goût du dimanche.",
        price: 1350, unit: "la barquette",
        options: [accomp(), piment()],
        allergens: ["celeri"],
        tags: [], emoji: "🍗", img: null,
      },
      {
        id: "fricassee-crevettes", cat: "plats", name: "Fricassée de crevettes",
        desc: "Grosses crevettes sautées puis mijotées en sauce créole tomatée, relevée de cives et de piment végétarien.",
        price: 1550, unit: "la barquette",
        options: [accomp(), piment()],
        allergens: ["crustaces", "celeri"],
        tags: [], emoji: "🍤", img: null,
      },
      {
        id: "blaff-poisson", cat: "plats", name: "Blaff de poisson",
        desc: "Poisson mariné au citron vert, poché dans un bouillon parfumé au bois d'Inde, thym et cive. Léger et fragrant.",
        price: 1500, unit: "la barquette",
        options: [accomp(), piment()],
        allergens: ["poissons"],
        tags: ["sans-gluten"], emoji: "🐟", img: null,
      },
      {
        id: "poulet-boucane", cat: "plats", name: "Poulet boucané",
        desc: "Cuisses de poulet marinées une nuit puis fumées lentement au bois. Servi avec sauce chien maison.",
        price: 1400, unit: "la barquette",
        options: [accomp(), piment()],
        allergens: ["moutarde"],
        tags: ["signature"], emoji: "🍗", img: null,
      },
      {
        id: "pimentade-poisson", cat: "plats", name: "Pimentade de poisson",
        desc: "Tranches de poisson mijotées dans une sauce tomate bien relevée, à la manière guyanaise. Pour les amateurs de piment.",
        price: 1500, unit: "la barquette",
        options: [accomp()],
        allergens: ["poissons"],
        tags: ["epice", "sans-gluten"], emoji: "🌶️", img: null,
      },
      {
        id: "colombo-legumes", cat: "plats", name: "Colombo de légumes & giraumon",
        desc: "Giraumon, christophine, aubergine et pois chiches mijotés au colombo maison et au lait de coco. 100 % végétal.",
        price: 1150, unit: "la barquette",
        options: [accomp(), piment()],
        allergens: ["celeri", "moutarde"],
        tags: ["vegetarien", "vegan", "sans-gluten"], emoji: "🎃", img: null,
      },
      {
        id: "dombres-crevettes", cat: "plats", name: "Dombrés aux crevettes",
        desc: "Petites boulettes de farine pochées dans une sauce créole aux crevettes et haricots rouges. Généreux et réconfortant.",
        price: 1500, unit: "la barquette",
        options: [piment()],
        allergens: ["gluten", "crustaces", "celeri"],
        tags: [], emoji: "🥟", img: null,
      },
      {
        id: "haricots-rouges-riz", cat: "plats", name: "Haricots rouges & riz créole",
        desc: "Haricots rouges mijotés longuement aux épices et cives, servis avec un riz créole parfumé. Version végétarienne possible.",
        price: 1100, unit: "la barquette",
        options: [
          { id: "garniture", name: "Garniture", required: true, choices: [
            { id: "nature", name: "Nature (végétarien)", price: 0 },
            { id: "lard", name: "Avec lard fumé", price: 150 },
          ] },
          piment(),
        ],
        allergens: ["celeri"],
        tags: ["sans-gluten"], emoji: "🍚", img: null,
      },
      {
        id: "formule-marche", cat: "plats", name: "Formule marché",
        desc: "Un plat au choix avec riz, 3 accras de morue et un jus maison 50 cl. Le déjeuner complet du marché.",
        price: 1600, unit: "la formule",
        options: [
          { id: "plat", name: "Plat", required: true, choices: [
            { id: "colombo-poulet", name: "Colombo de poulet", price: 0 },
            { id: "fricassee-poulet", name: "Fricassée de poulet", price: 0 },
            { id: "colombo-legumes", name: "Colombo de légumes", price: 0 },
          ] },
          { id: "boisson", name: "Jus 50 cl", required: true, choices: [
            { id: "maracudja", name: "Maracudja", price: 0 },
            { id: "goyave", name: "Goyave", price: 0 },
            { id: "gingembre", name: "Limonade gingembre", price: 0 },
            { id: "wassai", name: "Wassaï", price: 100 },
          ] },
          piment(),
        ],
        allergens: ["gluten", "poissons", "oeufs", "celeri", "moutarde"],
        tags: [], emoji: "🍱", img: null,
      },

      // ---------- Boulangerie & douceurs ----------
      {
        id: "pate-creole", cat: "boulangerie", name: "Pâté créole",
        desc: "Feuilleté doré à la guyanaise, garni d'une farce épicée. Délicieux tiède, au petit-déjeuner comme au goûter.",
        price: 350, unit: "la pièce",
        options: [
          { id: "garniture", name: "Garniture", required: true, choices: [
            { id: "poulet", name: "Poulet", price: 0 },
            { id: "porc", name: "Porc", price: 0 },
            { id: "poisson", name: "Poisson (morue)", price: 0 },
          ] },
        ],
        allergens: ["gluten", "oeufs", "lait", "poissons"],
        tags: ["signature"], emoji: "🥐", img: null,
      },
      {
        id: "galette-rois-coco", cat: "boulangerie", name: "Galette des Rois coco",
        desc: "De saison, de l'Épiphanie au Carnaval : pâte feuilletée au beurre, frangipane à la noix de coco.",
        price: 450, unit: "la part",
        allergens: ["gluten", "oeufs", "lait", "fruits-a-coque"],
        tags: ["nouveau"], emoji: "👑", img: null,
      },
      {
        id: "tarte-coco", cat: "boulangerie", name: "Tarte coco",
        desc: "Pâte sablée maison garnie de confiture de coco à la cannelle et à la vanille, croisillons dorés.",
        price: 400, unit: "la part",
        allergens: ["gluten", "oeufs", "lait"],
        tags: [], emoji: "🥥", img: null,
      },
      {
        id: "sispa", cat: "boulangerie", name: "Sispa",
        desc: "Galette guyanaise de farine de manioc et coco râpé, cuite à la plaque. Croustillante dehors, fondante dedans.",
        price: 300, unit: "la pièce",
        allergens: [],
        tags: ["signature", "vegan", "sans-gluten"], emoji: "🫓", img: null,
      },
      {
        id: "gateau-patate", cat: "boulangerie", name: "Gâteau patate",
        desc: "Moelleux à la patate douce, parfumé à la muscade, à la cannelle et au zeste de citron vert.",
        price: 350, unit: "la part",
        allergens: ["gluten", "oeufs", "lait"],
        tags: ["vegetarien"], emoji: "🍠", img: null,
      },
      {
        id: "flan-coco", cat: "boulangerie", name: "Flan coco",
        desc: "Flan crémeux au lait de coco et lait concentré, nappé d'un caramel blond. Servi bien frais.",
        price: 350, unit: "la part",
        allergens: ["oeufs", "lait"],
        tags: ["vegetarien", "sans-gluten"], emoji: "🍮", img: null,
      },
      {
        id: "pain-au-beurre", cat: "boulangerie", name: "Pain au beurre natté",
        desc: "Brioche tressée guyanaise, dense et beurrée. Traditionnelle avec un chocolat de communion.",
        price: 500, unit: "la pièce",
        allergens: ["gluten", "oeufs", "lait"],
        tags: ["vegetarien"], emoji: "🍞", img: null,
      },
      {
        id: "tourment-amour", cat: "boulangerie", name: "Tourment d'amour",
        desc: "Petite tarte des Saintes : pâte sablée, confiture de coco et génoise légère par-dessus.",
        price: 400, unit: "la pièce",
        allergens: ["gluten", "oeufs", "lait"],
        tags: ["vegetarien"], emoji: "💛", img: null,
      },
      {
        id: "kassav", cat: "boulangerie", name: "Kassav",
        desc: "Galette de manioc cuite sur platine, nature ou fourrée. À croquer telle quelle ou avec un plat en sauce.",
        price: 350, unit: "la galette",
        options: [
          { id: "garniture", name: "Garniture", required: true, choices: [
            { id: "nature", name: "Nature", price: 0 },
            { id: "coco", name: "Coco", price: 50 },
            { id: "coco-cannelle", name: "Coco-cannelle", price: 50 },
          ] },
        ],
        allergens: [],
        tags: ["vegan", "sans-gluten"], emoji: "🫓", img: null,
      },

      // ---------- Boissons (sans alcool) ----------
      {
        id: "jus-wassai", cat: "boissons", name: "Jus de wassaï",
        desc: "Le wassaï (açaí) guyanais, épais et violet, légèrement sucré. Un incontournable à Cayenne.",
        price: 550, options: [taille(400)],
        allergens: [], tags: ["signature", "vegan", "sans-gluten"], emoji: "🫐", img: null,
      },
      {
        id: "jus-maracudja", cat: "boissons", name: "Jus de maracudja",
        desc: "Fruit de la passion pressé, acidulé et parfumé, simplement adouci au sucre de canne.",
        price: 400, options: [taille(300)],
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🥭", img: null,
      },
      {
        id: "jus-goyave", cat: "boissons", name: "Jus de goyave",
        desc: "Goyave rose mixée et filtrée, onctueuse et douce, avec une pointe de citron vert.",
        price: 400, options: [taille(300)],
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🍹", img: null,
      },
      {
        id: "jus-prune-cythere", cat: "boissons", name: "Jus de prune de Cythère",
        desc: "Prune de Cythère mixée avec une touche de cannelle : un goût vert et acidulé, très rafraîchissant.",
        price: 450, options: [taille(350)],
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🍏", img: null,
      },
      {
        id: "jus-corossol", cat: "boissons", name: "Jus de corossol",
        desc: "Pulpe de corossol mixée et passée, crémeuse et délicatement acidulée, relevée de citron vert.",
        price: 450, options: [taille(350)],
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🍈", img: null,
      },
      {
        id: "planteur-sans-alcool", cat: "boissons", name: "Planteur sans alcool",
        desc: "Mélange de jus tropicaux, grenadine, cannelle et muscade. Toute la fête du planteur, sans le rhum.",
        price: 500, options: [taille(400)],
        allergens: [], tags: ["nouveau", "vegan", "sans-gluten"], emoji: "🍹", img: null,
      },
      {
        id: "limonade-gingembre", cat: "boissons", name: "Limonade gingembre maison",
        desc: "Gingembre frais râpé, citron vert et sucre de canne. Piquante et désaltérante.",
        price: 400, options: [taille(300)],
        allergens: [], tags: ["vegan", "sans-gluten", "epice"], emoji: "🫚", img: null,
      },
      {
        id: "jus-canne", cat: "boissons", name: "Jus de canne",
        desc: "Canne à sucre pressée minute avec un trait de citron vert. À boire dans la journée.",
        price: 450, unit: "50 cl",
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🎋", img: null,
      },

      // ---------- Épices & condiments ----------
      {
        id: "poudre-colombo", cat: "epices", name: "Poudre à colombo maison",
        desc: "Curcuma, coriandre, cumin, fenugrec, graines de moutarde et poivre, torréfiés puis moulus par nos soins.",
        price: 650, unit: "le pot 100 g",
        allergens: ["moutarde"], tags: ["signature", "vegan"], emoji: "🟡", img: null,
      },
      {
        id: "sauce-piment", cat: "epices", name: "Sauce piment maison",
        desc: "Piments frais, cives, ail et citron vert, broyés et mis en bocal. Une cuillère suffit à réveiller un plat.",
        price: 700, unit: "le pot 150 g",
        options: [
          { id: "force", name: "Force", required: true, choices: [
            { id: "vegetarien", name: "Piment végétarien (doux, aromatique)", price: 0 },
            { id: "fort", name: "Fort 🔥", price: 0 },
          ] },
        ],
        allergens: [], tags: ["epice", "vegan", "sans-gluten"], emoji: "🌶️", img: null,
      },
      {
        id: "couac", cat: "epices", name: "Couac",
        desc: "Semoule de manioc grillée de Guyane, croquante. Pour accompagner un blaff, une fricassée ou un bouillon.",
        price: 800, unit: "le sachet 500 g",
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🌾", img: null,
      },
      {
        id: "epices-bouillon-awara", cat: "epices", name: "Épices pour bouillon d'awara",
        desc: "Bois d'Inde, clous de girofle, poivre, thym et laurier séchés : le mélange aromatique pour votre bouillon de Pâques.",
        price: 900, unit: "le sachet 80 g",
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🌿", img: null,
      },
      {
        id: "melange-boucane", cat: "epices", name: "Mélange boucané",
        desc: "Paprika fumé, ail, thym, piment doux et poivre pour retrouver le goût du boucané, même au four.",
        price: 750, unit: "le pot 80 g",
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🔥", img: null,
      },
      {
        id: "pate-piment", cat: "epices", name: "Rougail de piment",
        desc: "Pâte de piment, ail et gingembre à l'huile. À délayer dans une sauce ou à servir en condiment.",
        price: 750, unit: "le pot 100 g",
        allergens: [], tags: ["epice", "vegan", "sans-gluten"], emoji: "🫙", img: null,
      },
      {
        id: "cannelle-badiane", cat: "epices", name: "Mélange cannelle-badiane",
        desc: "Bâtons de cannelle, étoiles de badiane et noix de muscade entières pour planteur, chocolat de communion et desserts.",
        price: 600, unit: "le sachet 60 g",
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "⭐", img: null,
      },
      {
        id: "assaisonnement-creole", cat: "epices", name: "Assaisonnement créole",
        desc: "Cives, persil, thym, ail et piment séchés, prêts à parfumer marinades, fricassées et blaffs.",
        price: 650, unit: "le pot 70 g",
        allergens: [], tags: ["vegan", "sans-gluten"], emoji: "🧂", img: null,
      },
    ],

    catering: [ // event / bulk trays; requested ahead and confirmed by the chef
      {
        id: "plateau-accras", name: "Plateau d'accras de morue",
        desc: "Accras croustillants à la morue, cives et piment, avec sauce chien à part.",
        price: 4500, unit: "50 pièces", serves: "10–12 pers.", min: 1,
        allergens: ["gluten", "poissons", "oeufs"], emoji: "🧆",
      },
      {
        id: "plateau-mini-pates", name: "Plateau de mini pâtés créoles",
        desc: "Mini pâtés feuilletés, moitié poulet, moitié porc. À réchauffer quelques minutes au four.",
        price: 5500, unit: "40 pièces", serves: "10–15 pers.", min: 1,
        allergens: ["gluten", "oeufs", "lait"], emoji: "🥐",
      },
      {
        id: "colombo-10", name: "Colombo de poulet pour 10",
        desc: "Un grand faitout de colombo de poulet mijoté, prêt à servir. Riz à commander à part.",
        price: 12000, unit: "bac 10 parts", serves: "10 pers.", min: 1,
        allergens: ["celeri", "moutarde"], emoji: "🍛",
      },
      {
        id: "riz-creole-10", name: "Riz créole pour 10",
        desc: "Riz créole parfumé, ou riz aux haricots rouges sur demande. L'accompagnement de tous nos plats.",
        price: 3500, unit: "bac 10 parts", serves: "10 pers.", min: 1,
        allergens: [], emoji: "🍚",
      },
      {
        id: "assortiment-douceurs", name: "Assortiment de douceurs",
        desc: "Tarte coco, flan coco, gâteau patate, sispa et tourments d'amour en bouchées.",
        price: 6000, unit: "30 pièces", serves: "10–15 pers.", min: 1,
        allergens: ["gluten", "oeufs", "lait"], emoji: "🍰",
      },
      {
        id: "plateau-mini-bokits", name: "Plateau de mini bokits",
        desc: "Petits pains frits garnis poulet, morue ou thon-crudités, façon Guadeloupe. Parfaits pour un cocktail.",
        price: 7500, unit: "24 pièces", serves: "8–12 pers.", min: 1,
        allergens: ["gluten", "poissons", "oeufs", "lait", "moutarde"], emoji: "🥪",
      },
      {
        id: "fontaine-jus", name: "Fontaine de jus 5 L",
        desc: "Jus maison au choix (maracudja, goyave, planteur sans alcool ou limonade gingembre), servis en fontaine.",
        price: 4000, unit: "5 L", serves: "≈ 25 verres", min: 1,
        allergens: [], emoji: "🧃",
      },
      {
        id: "buffet-saveurs-guyane", name: "Buffet « Saveurs de Guyane »",
        desc: "Accras, mini pâtés, colombo de poulet, fricassée de crevettes, riz créole, douceurs et jus. Prix par personne.",
        price: 2200, unit: "par personne", serves: "à partir de 15 pers.", min: 15,
        allergens: ["gluten", "crustaces", "poissons", "oeufs", "lait", "celeri", "moutarde"], emoji: "🎉",
      },
    ],
  };
})();
if (typeof module !== "undefined") module.exports = MENU; else window.MENU = MENU;
