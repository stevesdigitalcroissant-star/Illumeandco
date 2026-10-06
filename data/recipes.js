// Recipe database for Calorie Coach.
// Nutrition is PER SERVING, computed from the listed ingredient amounts using USDA FoodData Central values.
// level: easy (<=15 min, <=7 ingredients) | medium (20-40 min) | chef (45-150 min, real technique).
window.RECIPES = [
  {
    id: "greek-yogurt-berry-bowl",
    name: "Greek Yogurt Berry Bowl",
    meal: ["breakfast", "snack"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 253, p: 20, c: 22, f: 11, fib: 4, sug: 16, na: 65, satf: 1.1,
    contains: ["dairy", "nuts"],
    tags: ["vegetarian", "high-protein", "heart-healthy", "low-sodium", "no-cook"],
    ingredients: [
      "170 g plain nonfat Greek yogurt",
      "75 g mixed berries",
      "15 g walnuts, chopped",
      "1 tsp honey"
    ],
    steps: [
      "Spoon yogurt into a bowl.",
      "Top with berries and walnuts.",
      "Drizzle with honey."
    ]
  },
  {
    id: "microwave-veggie-egg-mug",
    name: "Microwave Veggie Egg Mug with Toast",
    meal: ["breakfast"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 301, p: 21, c: 20, f: 15, fib: 3, sug: 4, na: 550, satf: 6.4,
    contains: ["egg", "dairy", "gluten", "bell-pepper"],
    tags: ["vegetarian", "low-carb", "diabetes-friendly", "budget"],
    ingredients: [
      "2 large eggs",
      "30 g baby spinach, chopped",
      "30 g red bell pepper, diced",
      "20 g feta, crumbled",
      "1 slice whole-wheat bread (35 g)",
      "Pinch of black pepper"
    ],
    steps: [
      "Crack the eggs into a large microwave-safe mug and beat with a fork.",
      "Stir in the spinach, bell pepper, feta and black pepper.",
      "Microwave 1 minute, stir, then microwave 30-45 seconds more until just set.",
      "Toast the bread and eat alongside."
    ]
  },
  {
    id: "pb-banana-overnight-oats",
    name: "Peanut Butter Banana Overnight Oats",
    meal: ["breakfast"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 439, p: 21, c: 56, f: 16, fib: 9, sug: 18, na: 100, satf: 4.1,
    contains: ["dairy", "peanuts"],
    tags: ["vegetarian", "high-fiber", "low-sodium", "budget", "meal-prep", "no-cook"],
    ingredients: [
      "40 g rolled oats",
      "150 ml 2% milk",
      "50 g plain nonfat Greek yogurt",
      "1 tbsp natural peanut butter (16 g)",
      "1/2 small banana (60 g), sliced",
      "1/2 tbsp chia seeds (6 g)",
      "1/2 tsp cinnamon"
    ],
    steps: [
      "Stir oats, milk, yogurt, chia and cinnamon together in a jar.",
      "Swirl in the peanut butter.",
      "Cover and refrigerate overnight (or at least 4 hours).",
      "Top with banana slices and eat cold."
    ]
  },
  {
    id: "smoked-salmon-avocado-toast",
    name: "Smoked Salmon Avocado Toast",
    meal: ["breakfast", "lunch"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 362, p: 20, c: 41, f: 14, fib: 9, sug: 4, na: 755, satf: 2.3,
    contains: ["fish", "seafood", "gluten", "onion", "avocado"],
    tags: ["high-fiber", "diabetes-friendly"],
    ingredients: [
      "2 slices whole-wheat bread (80 g)",
      "1/2 avocado (60 g)",
      "50 g smoked salmon",
      "1 tsp lemon juice",
      "10 g red onion, thinly sliced",
      "Pinch of black pepper"
    ],
    steps: [
      "Toast the bread.",
      "Mash avocado with lemon juice and spread on the toast.",
      "Lay salmon on top.",
      "Add red onion and black pepper."
    ]
  },
  {
    id: "microwave-breakfast-burrito",
    name: "Microwave Breakfast Burrito",
    meal: ["breakfast"],
    level: "easy",
    mins: 6,
    serves: 1,
    kcal: 395, p: 24, c: 32, f: 18, fib: 7, sug: 3, na: 750, satf: 6.9,
    contains: ["egg", "dairy", "gluten", "onion", "garlic", "tomato", "beans", "cilantro"],
    tags: ["vegetarian", "diabetes-friendly", "budget"],
    ingredients: [
      "1 whole-wheat tortilla (8-inch, 45 g)",
      "2 large eggs",
      "40 g canned black beans, rinsed",
      "30 g jarred salsa",
      "15 g shredded cheddar"
    ],
    steps: [
      "Beat eggs in a microwave-safe bowl.",
      "Microwave 1 minute, stir, then 30 seconds more until set.",
      "Warm the tortilla for 10 seconds.",
      "Fill with eggs, beans, cheese and salsa, then roll up."
    ]
  },
  {
    id: "tropical-green-smoothie",
    name: "Tropical Green Smoothie",
    meal: ["breakfast", "snack"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 250, p: 11, c: 38, f: 8, fib: 8, sug: 22, na: 115, satf: 1,
    contains: ["soy"],
    tags: ["vegetarian", "vegan", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "no-cook"],
    ingredients: [
      "240 ml unsweetened soy milk",
      "100 g frozen mango",
      "1/2 frozen banana (60 g)",
      "30 g baby spinach",
      "1 tbsp chia seeds (10 g)"
    ],
    steps: [
      "Put everything in a blender.",
      "Blend until smooth, about 1 minute.",
      "Pour and drink right away."
    ]
  },
  {
    id: "mediterranean-chickpea-salad",
    name: "Mediterranean Chickpea Salad",
    meal: ["lunch"],
    level: "easy",
    mins: 10,
    serves: 1,
    kcal: 350, p: 14, c: 37, f: 18, fib: 10, sug: 6, na: 540, satf: 5.3,
    contains: ["dairy", "onion", "tomato", "beans"],
    tags: ["vegetarian", "high-fiber", "diabetes-friendly", "budget", "meal-prep", "no-cook"],
    ingredients: [
      "120 g canned chickpeas, rinsed",
      "80 g cucumber, diced",
      "80 g cherry tomatoes, halved",
      "20 g red onion, diced",
      "25 g feta, crumbled",
      "2 tsp olive oil (9 g)",
      "1 tbsp lemon juice"
    ],
    steps: [
      "Put chickpeas, cucumber, tomatoes and onion in a bowl.",
      "Add olive oil and lemon juice and toss.",
      "Top with feta."
    ]
  },
  {
    id: "tuna-avocado-lettuce-wraps",
    name: "Tuna Avocado Lettuce Wraps",
    meal: ["lunch"],
    level: "easy",
    mins: 8,
    serves: 1,
    kcal: 277, p: 32, c: 13, f: 12, fib: 8, sug: 4, na: 295, satf: 1.7,
    contains: ["fish", "seafood", "onion", "tomato", "avocado"],
    tags: ["high-protein", "high-fiber", "low-carb", "diabetes-friendly", "heart-healthy", "low-sodium", "no-cook"],
    ingredients: [
      "1 can tuna in water, drained (113 g)",
      "1/2 avocado (70 g)",
      "2 tsp lime juice",
      "15 g red onion, minced",
      "50 g cherry tomatoes, chopped",
      "6 large romaine leaves (90 g)",
      "Pinch of black pepper"
    ],
    steps: [
      "Mash avocado with lime juice in a bowl.",
      "Stir in tuna, onion, tomatoes and pepper.",
      "Spoon into lettuce leaves and wrap."
    ]
  },
  {
    id: "turkey-hummus-wrap",
    name: "Turkey Hummus Veggie Wrap",
    meal: ["lunch"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 327, p: 21, c: 40, f: 9, fib: 8, sug: 5, na: 840, satf: 2,
    contains: ["turkey", "gluten", "sesame", "garlic", "beans", "bell-pepper"],
    tags: ["high-fiber", "diabetes-friendly", "no-cook"],
    ingredients: [
      "1 large whole-wheat tortilla (60 g)",
      "70 g low-sodium deli turkey",
      "2 tbsp hummus (30 g)",
      "20 g baby spinach",
      "50 g cucumber, sliced",
      "40 g red bell pepper, sliced"
    ],
    steps: [
      "Spread hummus over the tortilla.",
      "Layer turkey, spinach, cucumber and pepper.",
      "Roll up tightly and cut in half."
    ]
  },
  {
    id: "chicken-black-bean-quesadilla",
    name: "Chicken & Black Bean Quesadilla",
    meal: ["lunch", "dinner"],
    level: "easy",
    mins: 10,
    serves: 1,
    kcal: 497, p: 36, c: 51, f: 16, fib: 10, sug: 4, na: 900, satf: 6.7,
    contains: ["chicken", "dairy", "gluten", "onion", "garlic", "tomato", "beans", "cilantro"],
    tags: ["high-protein", "high-fiber"],
    ingredients: [
      "1 large whole-wheat tortilla (60 g)",
      "60 g cooked chicken breast, shredded",
      "60 g canned black beans, rinsed",
      "40 g frozen corn, thawed",
      "25 g shredded cheddar",
      "40 g jarred salsa, to serve"
    ],
    steps: [
      "Lightly mash beans on half the tortilla.",
      "Add chicken, corn and cheese, then fold over.",
      "Cook in a dry nonstick pan 2-3 minutes per side until crisp and melted.",
      "Cut into wedges and serve with salsa."
    ]
  },
  {
    id: "sesame-chicken-rice-bowl",
    name: "Sesame Chicken Rice Bowl",
    meal: ["lunch", "dinner"],
    level: "easy",
    mins: 8,
    serves: 1,
    kcal: 475, p: 43, c: 43, f: 14, fib: 7, sug: 4, na: 450, satf: 2.6,
    contains: ["chicken", "gluten", "soy", "sesame", "beans", "rice"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy", "meal-prep"],
    ingredients: [
      "125 g cooked brown rice (microwave pouch)",
      "100 g cooked chicken breast, sliced",
      "60 g shelled edamame, thawed",
      "50 g shredded carrot",
      "2 tsp low-sodium soy sauce",
      "1 tsp toasted sesame oil",
      "1 tsp sesame seeds"
    ],
    steps: [
      "Heat the rice pouch in the microwave as directed.",
      "Put rice in a bowl and top with chicken, edamame and carrot.",
      "Microwave 1 minute if you want it warm.",
      "Drizzle with soy sauce and sesame oil, then sprinkle sesame seeds."
    ]
  },
  {
    id: "chicken-caprese-white-bean-salad",
    name: "Chicken Caprese White Bean Salad",
    meal: ["lunch"],
    level: "easy",
    mins: 8,
    serves: 1,
    kcal: 404, p: 39, c: 22, f: 17, fib: 5, sug: 5, na: 380, satf: 5.2,
    contains: ["chicken", "dairy", "tomato", "beans"],
    tags: ["high-protein", "diabetes-friendly", "low-sodium", "no-cook"],
    ingredients: [
      "80 g cooked chicken breast, diced",
      "80 g canned white beans, rinsed",
      "100 g cherry tomatoes, halved",
      "30 g part-skim mozzarella pearls",
      "5 g fresh basil, torn",
      "2 tsp olive oil (9 g)",
      "2 tsp balsamic vinegar"
    ],
    steps: [
      "Add chicken, beans, tomatoes and mozzarella to a bowl.",
      "Drizzle with olive oil and balsamic.",
      "Toss and top with basil."
    ]
  },
  {
    id: "sheet-pan-salmon-asparagus",
    name: "Sheet-Pan Lemon Salmon & Asparagus",
    meal: ["dinner"],
    level: "easy",
    mins: 15,
    serves: 1,
    kcal: 426, p: 37, c: 35, f: 16, fib: 7, sug: 4, na: 365, satf: 2.3,
    contains: ["fish", "seafood", "garlic"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy", "low-sodium"],
    ingredients: [
      "140 g salmon fillet",
      "150 g asparagus, trimmed",
      "1 tsp olive oil",
      "1 tbsp lemon juice",
      "1 garlic clove, grated",
      "1/8 tsp salt",
      "125 g cooked quinoa (microwave pouch)"
    ],
    steps: [
      "Heat oven to 220 C (425 F).",
      "Put salmon and asparagus on a lined sheet pan.",
      "Rub with oil, garlic and salt.",
      "Roast 10-12 minutes until salmon flakes.",
      "Squeeze lemon over and serve with warmed quinoa."
    ]
  },
  {
    id: "garlic-shrimp-zucchini-noodles",
    name: "Garlic Shrimp Zucchini Noodles",
    meal: ["dinner"],
    level: "easy",
    mins: 12,
    serves: 1,
    kcal: 318, p: 41, c: 11, f: 13, fib: 3, sug: 7, na: 385, satf: 3.3,
    contains: ["shellfish", "seafood", "dairy", "garlic", "spicy"],
    tags: ["high-protein", "low-carb", "diabetes-friendly", "heart-healthy", "low-sodium"],
    ingredients: [
      "170 g peeled raw shrimp",
      "250 g spiralized zucchini",
      "2 tsp olive oil (9 g)",
      "2 garlic cloves, sliced",
      "Pinch of red pepper flakes",
      "2 tbsp grated parmesan (10 g)",
      "2 tsp lemon juice"
    ],
    steps: [
      "Heat oil in a large pan over medium-high.",
      "Add shrimp, garlic and pepper flakes; cook 2 minutes per side until pink.",
      "Add zucchini noodles and toss 2 minutes until just warm.",
      "Finish with lemon juice and parmesan."
    ]
  },
  {
    id: "turkey-taco-skillet",
    name: "One-Pan Turkey Taco Skillet",
    meal: ["dinner"],
    level: "easy",
    mins: 15,
    serves: 2,
    kcal: 435, p: 37, c: 36, f: 17, fib: 11, sug: 5, na: 755, satf: 5.9,
    contains: ["turkey", "dairy", "onion", "garlic", "tomato", "beans", "cilantro"],
    tags: ["high-protein", "high-fiber", "diabetes-friendly", "budget", "meal-prep"],
    ingredients: [
      "250 g 93% lean ground turkey",
      "200 g canned black beans, rinsed",
      "100 g frozen corn",
      "120 g jarred salsa",
      "2 tsp chili powder",
      "30 g shredded cheddar"
    ],
    steps: [
      "Brown turkey in a nonstick skillet over medium-high, breaking it up, about 6 minutes.",
      "Stir in chili powder, beans, corn and salsa.",
      "Simmer 4 minutes until hot.",
      "Sprinkle with cheese, cover 1 minute to melt, and serve."
    ]
  },
  {
    id: "black-bean-stuffed-sweet-potato",
    name: "Black Bean Stuffed Sweet Potato",
    meal: ["dinner", "lunch"],
    level: "easy",
    mins: 12,
    serves: 1,
    kcal: 409, p: 13, c: 77, f: 7, fib: 19, sug: 13, na: 540, satf: 0.9,
    contains: ["onion", "garlic", "tomato", "avocado", "beans", "cilantro"],
    tags: ["vegetarian", "vegan", "high-fiber", "heart-healthy", "budget"],
    ingredients: [
      "1 sweet potato (250 g)",
      "100 g canned black beans, rinsed",
      "40 g jarred salsa",
      "40 g avocado, diced",
      "1 tsp lime juice",
      "Small handful cilantro (3 g)"
    ],
    steps: [
      "Prick the sweet potato with a fork.",
      "Microwave 8-10 minutes, turning once, until soft.",
      "Microwave beans 1 minute.",
      "Split the potato and fill with beans, salsa, avocado, lime and cilantro."
    ]
  },
  {
    id: "15-minute-chickpea-coconut-curry",
    name: "15-Minute Chickpea Coconut Curry",
    meal: ["dinner", "lunch"],
    level: "easy",
    mins: 15,
    serves: 2,
    kcal: 446, p: 16, c: 72, f: 12, fib: 14, sug: 6, na: 495, satf: 7,
    contains: ["garlic", "tomato", "coconut", "beans", "rice"],
    tags: ["vegetarian", "vegan", "high-fiber", "budget", "meal-prep"],
    ingredients: [
      "1 can chickpeas, rinsed (240 g)",
      "200 ml light coconut milk",
      "200 g canned crushed tomatoes",
      "60 g baby spinach",
      "1 tbsp curry powder (8 g)",
      "2 garlic cloves, grated",
      "250 g cooked brown rice (microwave pouch)"
    ],
    steps: [
      "Warm garlic and curry powder in a dry pot for 30 seconds.",
      "Add tomatoes, coconut milk and chickpeas; simmer 8 minutes.",
      "Stir in spinach until wilted.",
      "Heat the rice and serve the curry over it."
    ]
  },
  {
    id: "quick-beef-broccoli",
    name: "Quick Beef & Broccoli",
    meal: ["dinner"],
    level: "easy",
    mins: 15,
    serves: 2,
    kcal: 440, p: 33, c: 46, f: 14, fib: 6, sug: 3, na: 515, satf: 4,
    contains: ["beef", "gluten", "soy", "garlic", "rice"],
    tags: ["high-protein", "heart-healthy"],
    ingredients: [
      "225 g flank steak, thinly sliced",
      "300 g broccoli florets",
      "1 1/2 tbsp low-sodium soy sauce",
      "2 tsp canola oil",
      "2 garlic cloves, minced",
      "1 1/2 tsp cornstarch",
      "250 g cooked brown rice (microwave pouch)"
    ],
    steps: [
      "Toss beef with cornstarch.",
      "Heat oil in a large pan over high and sear beef 2 minutes; remove.",
      "Add broccoli and 3 tbsp water, cover and steam 3 minutes.",
      "Return beef, add garlic and soy sauce, and toss 1 minute until glossy.",
      "Serve over heated rice."
    ]
  },
  {
    id: "shrimp-egg-fried-rice",
    name: "Shrimp Egg Fried Rice",
    meal: ["dinner", "lunch"],
    level: "easy",
    mins: 15,
    serves: 2,
    kcal: 427, p: 30, c: 50, f: 11, fib: 6, sug: 5, na: 515, satf: 2.8,
    contains: ["shellfish", "seafood", "egg", "gluten", "soy", "sesame", "onion", "rice"],
    tags: ["high-protein", "heart-healthy", "budget"],
    ingredients: [
      "300 g cooked brown rice, cold",
      "150 g peeled raw shrimp",
      "2 large eggs, beaten",
      "150 g frozen peas",
      "1 tbsp low-sodium soy sauce",
      "2 tsp toasted sesame oil",
      "3 scallions, sliced (30 g)"
    ],
    steps: [
      "Heat half the oil in a large pan over high; cook shrimp 2 minutes and set aside.",
      "Scramble eggs in the pan and set aside.",
      "Add remaining oil, rice and peas; stir-fry 4 minutes.",
      "Return shrimp and eggs, add soy sauce and scallions, and toss."
    ]
  },
  {
    id: "apple-peanut-butter",
    name: "Apple Slices with Peanut Butter",
    meal: ["snack"],
    level: "easy",
    mins: 3,
    serves: 1,
    kcal: 189, p: 5, c: 28, f: 8, fib: 5, sug: 20, na: 5, satf: 1.6,
    contains: ["peanuts"],
    tags: ["vegetarian", "vegan", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "budget", "no-cook"],
    ingredients: [
      "1 medium apple (180 g), sliced",
      "1 tbsp natural peanut butter (16 g)",
      "Pinch of cinnamon"
    ],
    steps: [
      "Slice the apple.",
      "Dip in peanut butter.",
      "Dust with cinnamon."
    ]
  },
  {
    id: "hummus-veggie-sticks",
    name: "Hummus & Veggie Sticks",
    meal: ["snack"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 163, p: 7, c: 23, f: 6, fib: 8, sug: 8, na: 285, satf: 0.8,
    contains: ["sesame", "garlic", "beans", "bell-pepper"],
    tags: ["vegetarian", "vegan", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "budget", "no-cook"],
    ingredients: [
      "60 g hummus",
      "80 g carrot sticks",
      "80 g cucumber sticks",
      "60 g red bell pepper strips"
    ],
    steps: [
      "Cut the vegetables into sticks.",
      "Serve with hummus for dipping."
    ]
  },
  {
    id: "chili-lime-edamame",
    name: "Chili-Lime Edamame",
    meal: ["snack"],
    level: "easy",
    mins: 5,
    serves: 1,
    kcal: 147, p: 14, c: 11, f: 6, fib: 6, sug: 3, na: 160, satf: 0.7,
    contains: ["soy", "spicy", "beans"],
    tags: ["vegetarian", "vegan", "high-protein", "high-fiber", "low-carb", "diabetes-friendly", "heart-healthy", "low-sodium", "budget"],
    ingredients: [
      "120 g frozen shelled edamame",
      "1 tsp lime juice",
      "Pinch of red pepper flakes",
      "Pinch of flaky salt (0.4 g)"
    ],
    steps: [
      "Microwave edamame with 1 tbsp water, covered, for 2-3 minutes.",
      "Drain.",
      "Toss with lime juice, pepper flakes and salt."
    ]
  },
  {
    id: "classic-shakshuka",
    name: "Classic Shakshuka",
    meal: ["breakfast", "lunch"],
    level: "medium",
    mins: 30,
    serves: 2,
    kcal: 448, p: 24, c: 42, f: 22, fib: 9, sug: 16, na: 660, satf: 6.6,
    contains: ["egg", "dairy", "gluten", "onion", "garlic", "tomato", "spicy", "bell-pepper"],
    tags: ["vegetarian", "high-fiber", "diabetes-friendly", "budget"],
    ingredients: [
      "1 tbsp olive oil (14 g)",
      "1 small onion (100 g), diced",
      "1 red bell pepper (120 g), diced",
      "2 garlic cloves, minced",
      "1 tsp cumin + 1 tsp smoked paprika",
      "1/4 tsp red pepper flakes",
      "400 g can no-salt-added crushed tomatoes",
      "1/8 tsp salt",
      "4 large eggs",
      "30 g feta, crumbled",
      "Small handful parsley (5 g)",
      "2 slices whole-wheat bread (70 g), toasted"
    ],
    steps: [
      "Heat oil in a 25 cm skillet over medium. Cook onion and pepper 6-7 minutes until soft.",
      "Add garlic, cumin, paprika and pepper flakes; stir 1 minute until fragrant.",
      "Pour in tomatoes and salt and simmer 8-10 minutes until thickened.",
      "Make 4 wells and crack an egg into each.",
      "Cover and cook on low 5-7 minutes until whites are set but yolks still runny.",
      "Scatter feta and parsley and serve with toast for dipping."
    ]
  },
  {
    id: "turkey-sweet-potato-hash",
    name: "Turkey Sweet Potato Hash with Eggs",
    meal: ["breakfast", "dinner"],
    level: "medium",
    mins: 30,
    serves: 2,
    kcal: 400, p: 25, c: 40, f: 16, fib: 8, sug: 11, na: 370, satf: 3.9,
    contains: ["turkey", "egg", "onion", "bell-pepper"],
    tags: ["high-protein", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "meal-prep"],
    ingredients: [
      "300 g sweet potato, 1 cm dice",
      "2 tsp olive oil (9 g)",
      "150 g 93% lean ground turkey",
      "1 small onion (100 g), diced",
      "1 red bell pepper (100 g), diced",
      "50 g kale, chopped",
      "1 tsp smoked paprika",
      "1/8 tsp salt",
      "2 large eggs"
    ],
    steps: [
      "Microwave the diced sweet potato, covered, 4 minutes to par-cook.",
      "Heat oil in a large skillet over medium-high and brown the turkey, breaking it up, 5 minutes.",
      "Add sweet potato, onion, pepper, paprika and salt; cook 8-10 minutes, stirring occasionally, until potatoes are crisp at the edges.",
      "Stir in kale until wilted.",
      "Make 2 wells, crack in eggs, cover and cook 4-5 minutes until set."
    ]
  },
  {
    id: "banana-oat-protein-pancakes",
    name: "Banana Oat Protein Pancakes",
    meal: ["breakfast"],
    level: "medium",
    mins: 20,
    serves: 2,
    kcal: 374, p: 21, c: 52, f: 11, fib: 8, sug: 14, na: 345, satf: 2.3,
    contains: ["egg", "dairy"],
    tags: ["vegetarian", "high-fiber", "heart-healthy", "low-sodium", "budget"],
    ingredients: [
      "80 g rolled oats",
      "2 large eggs",
      "1 ripe banana (120 g)",
      "150 g plain nonfat Greek yogurt, divided",
      "1 tsp baking powder",
      "1 tsp cinnamon",
      "1 tsp canola oil",
      "120 g mixed berries"
    ],
    steps: [
      "Blend oats into a coarse flour.",
      "Add eggs, banana, 100 g of the yogurt, baking powder and cinnamon; blend until smooth and rest 5 minutes.",
      "Heat a nonstick pan over medium and brush lightly with oil.",
      "Cook 1/4-cup portions 2-3 minutes until bubbles form, flip and cook 1-2 minutes more.",
      "Serve with remaining yogurt and berries."
    ]
  },
  {
    id: "veggie-tofu-scramble",
    name: "Veggie Tofu Scramble on Toast",
    meal: ["breakfast"],
    level: "medium",
    mins: 20,
    serves: 2,
    kcal: 462, p: 41, c: 30, f: 24, fib: 9, sug: 7, na: 360, satf: 3.5,
    contains: ["gluten", "soy", "onion", "garlic", "bell-pepper"],
    tags: ["vegetarian", "vegan", "high-protein", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "budget"],
    ingredients: [
      "400 g firm tofu, drained",
      "2 tsp olive oil (9 g)",
      "80 g onion, diced",
      "1 red bell pepper (100 g), diced",
      "60 g baby spinach",
      "1 tsp turmeric + 1/2 tsp cumin",
      "1 garlic clove, minced",
      "1/8 tsp salt",
      "2 slices whole-wheat bread (70 g)"
    ],
    steps: [
      "Press tofu with paper towels to remove excess water.",
      "Heat oil in a skillet over medium and cook onion and pepper 5 minutes.",
      "Add garlic, turmeric and cumin and stir 30 seconds.",
      "Crumble in tofu, add salt and cook 6-8 minutes, stirring, until lightly golden.",
      "Fold in spinach until wilted and serve with toast."
    ]
  },
  {
    id: "indian-masala-omelette",
    name: "Indian Masala Omelette",
    meal: ["breakfast"],
    level: "medium",
    mins: 20,
    serves: 1,
    kcal: 381, p: 25, c: 28, f: 18, fib: 5, sug: 4, na: 680, satf: 4.4,
    contains: ["egg", "gluten", "onion", "tomato", "spicy", "cilantro"],
    tags: ["vegetarian", "high-protein", "diabetes-friendly", "budget"],
    ingredients: [
      "2 large eggs",
      "2 egg whites (66 g)",
      "30 g red onion, finely diced",
      "40 g tomato, diced",
      "1 small green chile, minced (5 g)",
      "1 tbsp chopped cilantro (4 g)",
      "1/4 tsp turmeric + 1/4 tsp cumin",
      "1 tsp canola oil",
      "Pinch of salt (0.4 g)",
      "1 whole-wheat chapati or small tortilla (45 g)"
    ],
    steps: [
      "Whisk eggs, egg whites, turmeric, cumin and salt.",
      "Stir in onion, tomato, chile and cilantro.",
      "Heat oil in a nonstick pan over medium-low and pour in the egg mixture.",
      "Cook 3-4 minutes until the bottom sets, then fold or flip and cook 1-2 minutes more.",
      "Warm the chapati in the pan and serve with the omelette."
    ]
  },
  {
    id: "baked-blueberry-walnut-oatmeal",
    name: "Baked Blueberry Walnut Oatmeal",
    meal: ["breakfast"],
    level: "medium",
    mins: 40,
    serves: 4,
    kcal: 354, p: 13, c: 51, f: 12, fib: 7, sug: 17, na: 240, satf: 2.7,
    contains: ["egg", "dairy", "nuts"],
    tags: ["vegetarian", "heart-healthy", "low-sodium", "budget", "meal-prep"],
    ingredients: [
      "160 g rolled oats",
      "360 ml 2% milk",
      "2 large eggs",
      "1 ripe banana (120 g), mashed",
      "200 g blueberries",
      "30 g walnuts, chopped",
      "1 1/4 tsp baking powder",
      "1 1/2 tsp cinnamon",
      "1 tbsp maple syrup (20 g)"
    ],
    steps: [
      "Heat oven to 190 C (375 F) and lightly grease a 20 cm baking dish.",
      "Mix oats, baking powder and cinnamon in a bowl.",
      "Whisk milk, eggs, banana and maple syrup, then stir into the oats.",
      "Fold in most of the blueberries and pour into the dish.",
      "Top with remaining berries and walnuts.",
      "Bake 30-35 minutes until set and golden. Cut into 4 squares; keeps 4 days in the fridge."
    ]
  },
  {
    id: "chicken-shawarma-bowl",
    name: "Chicken Shawarma Bowl with Garlic Yogurt",
    meal: ["lunch", "dinner"],
    level: "medium",
    mins: 35,
    serves: 2,
    kcal: 475, p: 40, c: 44, f: 15, fib: 4, sug: 6, na: 450, satf: 2.9,
    contains: ["chicken", "dairy", "onion", "garlic", "tomato", "rice"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy", "meal-prep"],
    ingredients: [
      "300 g boneless skinless chicken thighs",
      "1 tbsp olive oil (14 g)",
      "1 tbsp shawarma spice (cumin, paprika, coriander, turmeric, cinnamon) (6 g)",
      "2 garlic cloves, grated, divided",
      "1 tbsp lemon juice",
      "1/4 tsp salt",
      "100 g plain nonfat Greek yogurt",
      "150 g cucumber, diced",
      "150 g tomato, diced",
      "40 g red onion, sliced",
      "250 g cooked brown rice"
    ],
    steps: [
      "Toss chicken with oil, spice mix, half the garlic, lemon juice and salt; rest 10 minutes.",
      "Heat oven to 220 C (425 F) and roast chicken on a lined tray 18-20 minutes until 74 C (165 F) inside.",
      "Meanwhile stir remaining garlic into the yogurt with a splash of water.",
      "Rest chicken 5 minutes, then slice.",
      "Build bowls with rice, cucumber, tomato, onion and chicken, and spoon over garlic yogurt."
    ]
  },
  {
    id: "turkish-red-lentil-soup",
    name: "Turkish Red Lentil Soup",
    meal: ["lunch", "dinner"],
    level: "medium",
    mins: 35,
    serves: 4,
    kcal: 310, p: 17, c: 52, f: 5, fib: 9, sug: 6, na: 350, satf: 0.8,
    contains: ["onion", "garlic", "tomato"],
    tags: ["vegetarian", "vegan", "high-fiber", "heart-healthy", "low-sodium", "budget", "meal-prep"],
    ingredients: [
      "1 tbsp olive oil (14 g)",
      "1 onion (150 g), diced",
      "1 carrot (100 g), diced",
      "2 garlic cloves, minced",
      "1 tbsp tomato paste (16 g)",
      "2 tsp cumin + 1 tsp paprika + 1/2 tsp dried mint",
      "250 g red lentils, rinsed",
      "1.2 L low-sodium vegetable broth",
      "2 tbsp lemon juice",
      "1/4 tsp salt"
    ],
    steps: [
      "Heat oil in a large pot over medium and cook onion and carrot 6 minutes.",
      "Add garlic, tomato paste and spices and stir 1 minute.",
      "Add lentils and broth, bring to a boil, then simmer 20 minutes until lentils collapse.",
      "Blend until smooth (or leave chunky).",
      "Season with salt and lemon juice and serve."
    ]
  },
  {
    id: "vietnamese-shrimp-noodle-salad",
    name: "Vietnamese Shrimp Noodle Salad (Bun Tom)",
    meal: ["lunch", "dinner"],
    level: "medium",
    mins: 25,
    serves: 2,
    kcal: 438, p: 33, c: 58, f: 9, fib: 5, sug: 10, na: 1070, satf: 1.1,
    contains: ["fish", "shellfish", "seafood", "peanuts", "garlic", "spicy", "rice", "cilantro"],
    tags: ["high-protein"],
    ingredients: [
      "100 g dried rice vermicelli",
      "250 g peeled raw shrimp",
      "1 tsp canola oil",
      "150 g cucumber, julienned",
      "100 g carrot, julienned",
      "60 g lettuce, shredded",
      "10 g fresh mint",
      "10 g cilantro",
      "20 g roasted unsalted peanuts, chopped",
      "4 tsp fish sauce (20 g)",
      "2 tbsp lime juice",
      "2 1/2 tsp sugar (10 g)",
      "1 garlic clove, minced",
      "1 bird's eye chile, sliced (3 g)"
    ],
    steps: [
      "Cook noodles per package, rinse under cold water and drain well.",
      "Make nuoc cham: stir fish sauce, lime juice, sugar, garlic, chile and 3 tbsp water until sugar dissolves.",
      "Heat oil in a pan over high and sear shrimp 1-2 minutes per side.",
      "Divide noodles, lettuce, cucumber, carrot and herbs between bowls.",
      "Top with shrimp and peanuts and pour over the dressing."
    ]
  },
  {
    id: "chicken-burrito-bowl",
    name: "Chicken Burrito Bowl",
    meal: ["lunch", "dinner"],
    level: "medium",
    mins: 30,
    serves: 2,
    kcal: 519, p: 39, c: 58, f: 16, fib: 12, sug: 5, na: 320, satf: 2.8,
    contains: ["chicken", "onion", "tomato", "avocado", "beans", "rice", "cilantro"],
    tags: ["high-protein", "high-fiber", "heart-healthy", "low-sodium", "meal-prep"],
    ingredients: [
      "250 g boneless skinless chicken breast",
      "1 tsp cumin + 1 tsp chili powder",
      "2 tsp olive oil (9 g)",
      "1/8 tsp salt",
      "200 g cooked brown rice",
      "120 g canned black beans, rinsed",
      "100 g frozen corn, thawed",
      "150 g cherry tomatoes, quartered",
      "30 g red onion, diced",
      "80 g avocado, sliced",
      "2 tbsp lime juice",
      "6 g cilantro, chopped"
    ],
    steps: [
      "Rub chicken with spices, salt and half the oil.",
      "Cook in a hot skillet over medium-high 5-6 minutes per side until 74 C (165 F) inside; rest and slice.",
      "In the same pan, char the corn in the remaining oil for 3 minutes, then add beans to warm through.",
      "Toss tomatoes, onion, cilantro and half the lime juice to make a quick pico.",
      "Assemble bowls with rice, beans and corn, chicken, pico and avocado; finish with remaining lime."
    ]
  },
  {
    id: "west-african-peanut-chicken-stew",
    name: "West African Peanut Chicken Stew (Maafe)",
    meal: ["lunch", "dinner"],
    level: "medium",
    mins: 40,
    serves: 4,
    kcal: 379, p: 29, c: 31, f: 16, fib: 6, sug: 8, na: 410, satf: 2.9,
    contains: ["chicken", "peanuts", "onion", "garlic", "tomato", "spicy"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy", "meal-prep"],
    ingredients: [
      "1 tbsp canola oil (14 g)",
      "400 g boneless skinless chicken thighs, cubed",
      "1 onion (150 g), diced",
      "2 garlic cloves, minced",
      "1 tbsp grated ginger (10 g)",
      "2 tbsp tomato paste (32 g)",
      "400 g sweet potato, cubed",
      "4 tbsp natural peanut butter (64 g)",
      "700 ml low-sodium chicken broth",
      "100 g kale, chopped",
      "1/2 scotch bonnet, minced (3 g)",
      "1/4 tsp salt"
    ],
    steps: [
      "Heat oil in a large pot over medium-high and brown chicken 5 minutes; remove.",
      "Lower heat, add onion and cook 5 minutes, then garlic, ginger, chile and tomato paste for 2 minutes.",
      "Whisk peanut butter into the broth and add to the pot with sweet potato, chicken and salt.",
      "Simmer, partly covered, 20 minutes until sweet potato is tender and sauce thickens.",
      "Stir in kale for the last 3 minutes and serve."
    ]
  },
  {
    id: "caribbean-shrimp-mango-quinoa-bowl",
    name: "Caribbean Shrimp, Mango & Black Bean Quinoa Bowl",
    meal: ["lunch"],
    level: "medium",
    mins: 25,
    serves: 2,
    kcal: 452, p: 33, c: 62, f: 9, fib: 12, sug: 14, na: 325, satf: 1.2,
    contains: ["shellfish", "seafood", "onion", "spicy", "beans", "cilantro", "bell-pepper"],
    tags: ["high-protein", "high-fiber", "heart-healthy", "low-sodium", "meal-prep"],
    ingredients: [
      "90 g quinoa, rinsed",
      "200 g peeled raw shrimp",
      "1/2 tsp allspice + 1/2 tsp cumin",
      "2 tsp olive oil (9 g)",
      "150 g canned black beans, rinsed",
      "150 g mango, diced",
      "1 red bell pepper (100 g), diced",
      "30 g red onion, diced",
      "1 small jalapeno, minced (10 g)",
      "8 g cilantro, chopped",
      "2 tbsp lime juice",
      "Pinch of salt (0.4 g)"
    ],
    steps: [
      "Simmer quinoa in 180 ml water, covered, 15 minutes; rest 5 minutes and fluff.",
      "Toss shrimp with allspice, cumin and half the oil; sear 1-2 minutes per side.",
      "Mix beans, mango, pepper, onion, jalapeno and cilantro with lime juice, salt and remaining oil.",
      "Divide quinoa between bowls and top with the salsa and shrimp."
    ]
  },
  {
    id: "weeknight-chicken-tikka-masala",
    name: "Weeknight Chicken Tikka Masala",
    meal: ["dinner"],
    level: "medium",
    mins: 40,
    serves: 4,
    kcal: 506, p: 44, c: 57, f: 11, fib: 4, sug: 8, na: 425, satf: 3.2,
    contains: ["chicken", "dairy", "onion", "garlic", "tomato", "coconut", "rice", "cilantro"],
    tags: ["high-protein", "heart-healthy", "meal-prep"],
    ingredients: [
      "600 g boneless skinless chicken breast, cubed",
      "120 g plain nonfat Greek yogurt",
      "1 1/2 tbsp garam masala + 1 tsp turmeric (10 g)",
      "1 tbsp canola oil (14 g)",
      "1 onion (150 g), finely diced",
      "3 garlic cloves, grated (10 g)",
      "1 tbsp grated ginger (10 g)",
      "400 g canned crushed tomatoes",
      "120 ml light coconut milk",
      "1/4 tsp salt",
      "8 g cilantro, chopped",
      "600 g cooked basmati rice"
    ],
    steps: [
      "Toss chicken with yogurt and half the spice mix; marinate 10 minutes while you prep.",
      "Heat oil in a large pan over medium-high and sear chicken in batches 3-4 minutes until browned; set aside.",
      "Cook onion in the same pan 6 minutes, then add garlic, ginger and remaining spices for 1 minute.",
      "Add tomatoes and salt and simmer 8 minutes.",
      "Stir in coconut milk and chicken and simmer 5 minutes until chicken is cooked through.",
      "Garnish with cilantro and serve over rice."
    ]
  },
  {
    id: "turkey-kidney-bean-chili",
    name: "Turkey & Kidney Bean Chili",
    meal: ["dinner", "lunch"],
    level: "medium",
    mins: 40,
    serves: 4,
    kcal: 430, p: 35, c: 47, f: 14, fib: 14, sug: 13, na: 545, satf: 3,
    contains: ["chicken", "turkey", "onion", "garlic", "tomato", "beans", "bell-pepper"],
    tags: ["high-protein", "high-fiber", "heart-healthy", "budget", "meal-prep"],
    ingredients: [
      "450 g 93% lean ground turkey",
      "2 tsp olive oil (9 g)",
      "1 onion (150 g), diced",
      "1 bell pepper (150 g), diced",
      "2 garlic cloves, minced",
      "4 tsp chili powder (12 g)",
      "2 tsp cumin",
      "800 g no-salt-added crushed tomatoes",
      "2 cans kidney beans, rinsed (480 g)",
      "250 ml low-sodium chicken broth",
      "1/4 tsp salt"
    ],
    steps: [
      "Heat oil in a large pot over medium-high and brown turkey 6 minutes.",
      "Add onion and pepper and cook 5 minutes.",
      "Stir in garlic, chili powder and cumin for 1 minute.",
      "Add tomatoes, beans, broth and salt; bring to a boil.",
      "Simmer uncovered 20-25 minutes, stirring now and then, until thick."
    ]
  },
  {
    id: "lemon-herb-cod-potatoes",
    name: "Lemon Herb Baked Cod with Potatoes & Green Beans",
    meal: ["dinner"],
    level: "medium",
    mins: 35,
    serves: 2,
    kcal: 392, p: 33, c: 43, f: 10, fib: 7, sug: 5, na: 245, satf: 1.4,
    contains: ["fish", "seafood", "garlic"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy", "low-sodium"],
    ingredients: [
      "2 cod fillets (300 g)",
      "400 g baby potatoes, halved",
      "200 g green beans, trimmed",
      "4 tsp olive oil (18 g), divided",
      "1 tbsp lemon juice + zest",
      "1 garlic clove, minced",
      "5 g parsley, chopped",
      "1/8 tsp salt + pepper"
    ],
    steps: [
      "Heat oven to 220 C (425 F).",
      "Toss potatoes with half the oil and a pinch of the salt; roast 15 minutes.",
      "Push potatoes aside, add green beans and cod to the tray.",
      "Mix remaining oil with garlic, lemon zest and juice, parsley and salt; spoon over the cod.",
      "Roast 10-12 minutes until cod flakes easily."
    ]
  },
  {
    id: "honey-ginger-salmon-bok-choy",
    name: "Honey-Ginger Glazed Salmon with Bok Choy",
    meal: ["dinner"],
    level: "medium",
    mins: 25,
    serves: 2,
    kcal: 436, p: 35, c: 43, f: 14, fib: 4, sug: 8, na: 565, satf: 2.2,
    contains: ["fish", "seafood", "gluten", "soy", "sesame", "garlic", "rice"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy"],
    ingredients: [
      "2 salmon fillets (280 g)",
      "1 1/2 tbsp low-sodium soy sauce",
      "2 tsp honey (14 g)",
      "1 tsp grated ginger (6 g)",
      "1 garlic clove, grated",
      "2 tsp rice vinegar",
      "300 g baby bok choy, halved",
      "1 tsp toasted sesame oil",
      "250 g cooked brown rice",
      "1 tsp sesame seeds"
    ],
    steps: [
      "Whisk soy sauce, honey, ginger, garlic and vinegar.",
      "Heat oven to 200 C (400 F). Place salmon on a lined tray and brush with half the glaze.",
      "Bake 10-12 minutes, brushing once more halfway.",
      "Meanwhile stir-fry bok choy in sesame oil over high heat 3 minutes with remaining glaze.",
      "Serve salmon over rice with bok choy and sesame seeds."
    ]
  },
  {
    id: "chicken-mushroom-spinach-pasta",
    name: "Chicken, Mushroom & Spinach Whole-Wheat Pasta",
    meal: ["dinner"],
    level: "medium",
    mins: 25,
    serves: 2,
    kcal: 598, p: 51, c: 65, f: 17, fib: 11, sug: 5, na: 495, satf: 4.6,
    contains: ["chicken", "dairy", "gluten", "mushrooms", "garlic", "spicy"],
    tags: ["high-protein", "high-fiber"],
    ingredients: [
      "160 g whole-wheat penne",
      "250 g chicken breast, sliced",
      "1 tbsp olive oil (14 g)",
      "250 g cremini mushrooms, sliced",
      "2 garlic cloves, sliced",
      "100 g baby spinach",
      "30 g parmesan, grated",
      "1/4 tsp red pepper flakes",
      "2 tsp lemon juice",
      "1/8 tsp salt"
    ],
    steps: [
      "Cook pasta in unsalted boiling water until al dente; save 120 ml pasta water.",
      "Meanwhile heat oil in a large skillet and sear chicken with the salt 5-6 minutes until cooked; set aside.",
      "Add mushrooms and cook 6 minutes until browned.",
      "Add garlic and pepper flakes for 30 seconds, then spinach until wilted.",
      "Toss in pasta, chicken, parmesan, lemon juice and enough pasta water to make a light sauce."
    ]
  },
  {
    id: "sheet-pan-pork-tenderloin-apples-brussels",
    name: "Sheet-Pan Dijon Pork Tenderloin with Apples & Brussels Sprouts",
    meal: ["dinner"],
    level: "medium",
    mins: 35,
    serves: 3,
    kcal: 348, p: 37, c: 31, f: 10, fib: 8, sug: 17, na: 345, satf: 2,
    contains: ["pork"],
    tags: ["high-protein", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium"],
    ingredients: [
      "450 g pork tenderloin",
      "400 g Brussels sprouts, halved",
      "2 apples (300 g), cut in wedges",
      "4 tsp olive oil (18 g)",
      "2 tsp Dijon mustard (10 g)",
      "1 tbsp maple syrup (20 g)",
      "1 tsp dried thyme + 1/4 tsp black pepper",
      "1/4 tsp salt"
    ],
    steps: [
      "Heat oven to 220 C (425 F).",
      "Toss sprouts and apples with most of the oil and half the salt; spread on a sheet pan.",
      "Rub pork with remaining oil, salt, thyme and pepper; nestle in the center.",
      "Roast 10 minutes, then brush pork with Dijon mixed with maple.",
      "Roast 12-15 minutes more until pork reaches 63 C (145 F).",
      "Rest 5 minutes, slice and serve with the vegetables."
    ]
  },
  {
    id: "sweet-potato-black-bean-enchiladas",
    name: "Sweet Potato & Black Bean Enchiladas",
    meal: ["dinner"],
    level: "medium",
    mins: 40,
    serves: 4,
    kcal: 419, p: 16, c: 67, f: 11, fib: 14, sug: 11, na: 425, satf: 4.4,
    contains: ["dairy", "onion", "garlic", "tomato", "beans", "cilantro"],
    tags: ["vegetarian", "high-fiber", "budget", "meal-prep"],
    ingredients: [
      "8 corn tortillas (208 g)",
      "400 g sweet potato, diced",
      "240 g canned black beans, rinsed",
      "1 onion (100 g), diced",
      "2 tsp olive oil (9 g)",
      "1 tsp cumin",
      "400 g no-salt-added crushed tomatoes",
      "1 tbsp chili powder (8 g)",
      "1 garlic clove, minced",
      "80 g shredded cheddar",
      "8 g cilantro",
      "1/8 tsp salt"
    ],
    steps: [
      "Heat oven to 200 C (400 F). Microwave sweet potato, covered, 6 minutes until tender.",
      "Saute onion in oil 5 minutes, add cumin, sweet potato and beans and lightly mash.",
      "Simmer tomatoes with chili powder, garlic and salt 5 minutes for the sauce.",
      "Warm tortillas, fill each with the mixture and roll; place seam-down in a baking dish.",
      "Pour sauce over, sprinkle cheese and bake 15 minutes until bubbling.",
      "Top with cilantro."
    ]
  },
  {
    id: "crispy-roasted-chickpeas",
    name: "Crispy Smoked Paprika Chickpeas",
    meal: ["snack"],
    level: "medium",
    mins: 35,
    serves: 4,
    kcal: 189, p: 8, c: 27, f: 5, fib: 9, sug: 0, na: 325, satf: 0.7,
    contains: ["beans"],
    tags: ["vegetarian", "vegan", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "budget", "meal-prep"],
    ingredients: [
      "2 cans chickpeas, rinsed (480 g)",
      "2 tsp olive oil (9 g)",
      "1 tsp smoked paprika + 1/2 tsp cumin",
      "1/8 tsp salt"
    ],
    steps: [
      "Heat oven to 200 C (400 F).",
      "Pat chickpeas very dry with a towel and remove loose skins.",
      "Toss with oil and spread on a sheet pan.",
      "Roast 25-30 minutes, shaking twice, until crunchy.",
      "Toss hot chickpeas with paprika, cumin and salt; cool to crisp further."
    ]
  },
  {
    id: "pb-oat-energy-bites",
    name: "Peanut Butter Oat Energy Bites",
    meal: ["snack"],
    level: "medium",
    mins: 20,
    serves: 4,
    kcal: 243, p: 8, c: 26, f: 13, fib: 5, sug: 9, na: 5, satf: 3.2,
    contains: ["peanuts"],
    tags: ["vegetarian", "high-fiber", "heart-healthy", "low-sodium", "meal-prep", "no-cook"],
    ingredients: [
      "80 g rolled oats",
      "4 tbsp natural peanut butter (64 g)",
      "1 1/2 tbsp honey (30 g)",
      "2 tbsp ground flaxseed (15 g)",
      "20 g dark chocolate (70%), chopped"
    ],
    steps: [
      "Stir everything together in a bowl until evenly combined.",
      "Chill 10 minutes so the mixture firms up.",
      "Roll into 12 balls (3 per serving).",
      "Store in the fridge up to 1 week."
    ]
  },
  {
    id: "tzatziki-pita-chips",
    name: "Tzatziki with Baked Pita Chips",
    meal: ["snack"],
    level: "medium",
    mins: 25,
    serves: 4,
    kcal: 169, p: 11, c: 22, f: 5, fib: 3, sug: 3, na: 270, satf: 0.7,
    contains: ["dairy", "gluten", "garlic"],
    tags: ["vegetarian", "diabetes-friendly", "heart-healthy", "low-sodium", "meal-prep"],
    ingredients: [
      "300 g plain nonfat Greek yogurt",
      "150 g cucumber, grated and squeezed",
      "2 garlic cloves, grated",
      "2 tsp lemon juice",
      "5 g fresh dill, chopped",
      "1 tbsp olive oil (14 g), divided",
      "1/8 tsp salt",
      "2 whole-wheat pitas (128 g)"
    ],
    steps: [
      "Heat oven to 190 C (375 F).",
      "Cut pitas into wedges, brush with 1 tsp of the oil and bake 10-12 minutes until crisp.",
      "Squeeze the grated cucumber in a towel to remove water.",
      "Mix yogurt, cucumber, garlic, lemon, dill, salt and remaining oil.",
      "Chill 10 minutes and serve with the chips."
    ]
  },
  {
    id: "huevos-rancheros-from-scratch",
    name: "Huevos Rancheros with Charred Ranchero Sauce & Refried Pintos",
    meal: ["breakfast", "lunch"],
    level: "chef",
    mins: 50,
    serves: 2,
    kcal: 591, p: 31, c: 62, f: 26, fib: 16, sug: 8, na: 665, satf: 7,
    contains: ["egg", "dairy", "onion", "garlic", "tomato", "spicy", "avocado", "beans", "cilantro"],
    tags: ["vegetarian", "high-protein", "high-fiber"],
    ingredients: [
      "300 g ripe Roma tomatoes",
      "60 g white onion, in thick slices",
      "1 jalapeno (15 g)",
      "2 garlic cloves, unpeeled",
      "2 tsp canola oil (10 g), divided",
      "240 g canned pinto beans, rinsed",
      "1 tsp cumin",
      "4 corn tortillas (104 g)",
      "4 large eggs",
      "40 g queso fresco, crumbled",
      "60 g avocado, sliced",
      "6 g cilantro",
      "2 tsp lime juice",
      "1/8 tsp salt"
    ],
    steps: [
      "Heat a dry cast-iron skillet over high. Char tomatoes, onion, jalapeno and garlic, turning, until blistered and blackened in spots, 10-12 minutes.",
      "Peel the garlic, stem the jalapeno (seed it for less heat) and blend everything with lime juice, half the salt and 60 ml water until slightly chunky.",
      "Heat 1 tsp oil in a saucepan, add the sauce (it will spit) and fry, stirring, 5 minutes until it darkens and thickens.",
      "In another pan, warm cumin in 2 tbsp water, add beans and remaining salt and mash with a potato masher, adding splashes of water until creamy; keep warm.",
      "Toast tortillas directly over a gas flame or in the dry skillet until spotted and pliable; wrap in a towel.",
      "Heat remaining oil in a nonstick pan over medium-low and fry eggs gently, basting the whites with oil, until set with runny yolks.",
      "Spread beans on each tortilla, top with an egg and a generous spoonful of ranchero sauce.",
      "Finish with queso fresco, avocado and cilantro."
    ]
  },
  {
    id: "eggs-florentine-yogurt-hollandaise",
    name: "Mushroom Eggs Florentine with Lemon-Yogurt Hollandaise",
    meal: ["breakfast"],
    level: "chef",
    mins: 45,
    serves: 2,
    kcal: 503, p: 28, c: 35, f: 30, fib: 7, sug: 8, na: 610, satf: 12.5,
    contains: ["egg", "dairy", "gluten", "mushrooms", "garlic"],
    tags: ["vegetarian", "high-protein", "diabetes-friendly"],
    ingredients: [
      "2 whole-wheat English muffins (132 g), split",
      "4 very fresh large eggs",
      "150 g baby spinach",
      "150 g cremini mushrooms, sliced",
      "1 tsp olive oil",
      "1 garlic clove, minced",
      "2 egg yolks (34 g)",
      "2 tbsp unsalted butter (28 g), melted and hot",
      "2 tsp lemon juice",
      "40 g plain nonfat Greek yogurt",
      "Pinch of cayenne",
      "1/8 tsp salt",
      "1 tbsp white vinegar (for the poaching water)"
    ],
    steps: [
      "Make the hollandaise: whisk yolks and lemon juice in a heatproof bowl set over barely simmering water until thick and ribbony, about 2 minutes.",
      "Off the heat, drizzle in the hot butter in a thin stream, whisking constantly until emulsified.",
      "Whisk in the yogurt, cayenne and a pinch of the salt; keep the bowl over the warm (not simmering) water.",
      "Saute mushrooms in the oil over high heat without stirring for 2 minutes, then stir and cook until golden; add garlic and spinach and toss until just wilted. Season lightly and drain on a towel.",
      "Bring a wide pan of water to a bare simmer and add the vinegar. Crack each egg into a small sieve to drain loose white, then into a ramekin.",
      "Swirl the water gently, slide in the eggs one at a time and poach 3 minutes until whites are set and yolks soft. Lift out with a slotted spoon and blot.",
      "Toast the muffins and top each half with the mushroom-spinach mixture and a poached egg.",
      "Spoon over the hollandaise and finish with a pinch of cayenne."
    ]
  },
  {
    id: "ful-medames-whole-wheat-flatbread",
    name: "Ful Medames with Homemade Whole-Wheat Flatbread",
    meal: ["breakfast", "lunch"],
    level: "chef",
    mins: 90,
    serves: 4,
    kcal: 502, p: 22, c: 79, f: 13, fib: 18, sug: 4, na: 450, satf: 1.8,
    contains: ["gluten", "garlic", "tomato", "spicy", "beans"],
    tags: ["vegetarian", "vegan", "high-fiber", "heart-healthy", "budget"],
    ingredients: [
      "200 g dried split fava beans, soaked overnight",
      "150 g whole-wheat flour",
      "100 g all-purpose flour",
      "1 1/4 tsp instant yeast (4 g)",
      "160 ml warm water",
      "3 tbsp extra-virgin olive oil (42 g), divided",
      "3/4 tsp salt (4.5 g), divided",
      "3 garlic cloves, crushed to a paste",
      "1 1/2 tsp ground cumin",
      "3 tbsp lemon juice",
      "150 g tomato, finely diced",
      "15 g flat-leaf parsley, chopped",
      "1/2 tsp Aleppo pepper or chili flakes"
    ],
    steps: [
      "For the dough, mix both flours, yeast and 1/4 tsp salt; add warm water and 1 tbsp oil and knead 8 minutes until smooth and springy.",
      "Cover and let rise in a warm spot 45-60 minutes until doubled.",
      "Meanwhile drain the soaked favas, cover with fresh water by 5 cm and simmer gently, partly covered, 40-50 minutes until completely soft, skimming foam.",
      "Pound the garlic with the remaining salt and cumin to a paste in a mortar.",
      "Drain the beans, reserving 120 ml liquid. Return to the pot with the garlic paste and lemon juice and mash coarsely, loosening with cooking liquid until creamy.",
      "Divide the dough into 4, roll each to 3-4 mm thick rounds.",
      "Cook each flatbread in a very hot dry cast-iron pan 1-2 minutes per side until puffed and charred in spots; wrap in a towel to stay soft.",
      "Spoon ful into shallow bowls, make a well and pour in the remaining olive oil.",
      "Top with tomato, parsley and Aleppo pepper and serve with warm flatbread for scooping."
    ]
  },
  {
    id: "japanese-breakfast-miso-salmon",
    name: "Japanese Breakfast: Miso-Glazed Salmon, Tamagoyaki & Miso Soup",
    meal: ["breakfast", "dinner"],
    level: "chef",
    mins: 60,
    serves: 2,
    kcal: 630, p: 49, c: 56, f: 23, fib: 3, sug: 9, na: 1080, satf: 4.7,
    contains: ["fish", "seafood", "egg", "gluten", "soy", "onion", "rice"],
    tags: ["high-protein"],
    ingredients: [
      "240 g salmon fillet, skin on, in 2 pieces",
      "20 g white miso (for the glaze)",
      "1 tsp honey",
      "3 large eggs",
      "1 tsp low-sodium soy sauce",
      "1 1/2 tsp sugar (6 g)",
      "1 tsp canola oil",
      "100 g Japanese short-grain rice",
      "20 g white miso (for the soup)",
      "100 g silken or firm tofu, cubed",
      "2 scallions (20 g), sliced",
      "100 g cucumber, very thinly sliced",
      "1 tbsp rice vinegar",
      "Pinch of salt (0.4 g)"
    ],
    steps: [
      "Whisk 20 g miso with honey and 1 tsp water; coat the salmon flesh and marinate in the fridge at least 30 minutes (overnight is best).",
      "Rinse the rice until the water runs clear, soak 20 minutes, then cook with 130 ml water: boil, cover, simmer 12 minutes on low and rest 10 minutes off the heat.",
      "Salt the cucumber, rest 10 minutes, squeeze out liquid and toss with rice vinegar for a quick sunomono.",
      "Beat eggs with soy sauce, sugar and 1 tbsp water without making foam.",
      "Heat a small rectangular or round pan over medium-low and wipe with oil. Pour in a thin layer of egg, and when barely set, roll it to one end with chopsticks.",
      "Oil the pan again, pour another thin layer, lifting the rolled egg so it flows underneath; roll back over it. Repeat until the egg is used, then press in a bamboo mat or towel 5 minutes and slice.",
      "Wipe most of the miso off the salmon and grill skin-side up under a hot broiler 7-9 minutes until caramelized at the edges and just opaque inside.",
      "Bring 500 ml water to a simmer, add tofu, then turn off the heat and whisk in the soup miso through a sieve (do not boil). Add scallions.",
      "Serve each person rice, salmon, tamagoyaki slices, cucumber and a bowl of miso soup."
    ]
  },
  {
    id: "akara-black-eyed-pea-fritters",
    name: "Akara (Black-Eyed Pea Fritters) with Pepper Sauce",
    meal: ["breakfast", "snack"],
    level: "chef",
    mins: 75,
    serves: 4,
    kcal: 356, p: 16, c: 45, f: 14, fib: 9, sug: 9, na: 235, satf: 1.1,
    contains: ["onion", "tomato", "spicy", "beans", "bell-pepper"],
    tags: ["vegetarian", "vegan", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium", "budget"],
    ingredients: [
      "250 g dried black-eyed peas, soaked 2 hours",
      "80 g onion, roughly chopped",
      "1/2 scotch bonnet (5 g)",
      "60 g red bell pepper",
      "1/4 tsp + 1/8 tsp salt (2.25 g), divided",
      "Neutral oil for shallow-frying (about 40 g absorbed)",
      "200 g ripe tomatoes",
      "100 g red bell pepper (for the sauce)",
      "50 g onion (for the sauce)",
      "1/2 scotch bonnet (5 g, for the sauce)",
      "2 tsp canola oil (for the sauce)"
    ],
    steps: [
      "Rub the soaked peas between your palms in a bowl of water to loosen the skins; let skins float to the top and pour them off. Repeat until most peas are skinned.",
      "Blend the peas with 80 g onion, 5 g scotch bonnet, 60 g bell pepper and only 3-4 tbsp water to a thick, smooth paste.",
      "Transfer to a bowl and beat with a wooden spoon or whisk for 3-4 minutes to incorporate air, until fluffy and lighter in color. Season with 1/4 tsp salt.",
      "For the sauce, blend tomatoes, remaining bell pepper, onion and scotch bonnet, then fry in 2 tsp oil, stirring, 15 minutes until reduced and the oil separates. Season with remaining salt.",
      "Heat 2-3 cm of oil in a heavy pan to 175 C (350 F).",
      "Drop heaping tablespoons of batter into the oil without crowding. Fry 2-3 minutes per side until deep golden.",
      "Drain on a rack set over paper towels; keep warm in a low oven while you fry the rest.",
      "Serve hot with the pepper sauce for dipping."
    ]
  },
  {
    id: "smoked-salmon-potato-rosti",
    name: "Crispy Potato Rosti with Smoked Salmon, Poached Egg & Dill Yogurt",
    meal: ["breakfast"],
    level: "chef",
    mins: 50,
    serves: 2,
    kcal: 472, p: 25, c: 44, f: 22, fib: 5, sug: 4, na: 690, satf: 7.3,
    contains: ["fish", "seafood", "egg", "dairy", "gluten", "onion"],
    tags: ["high-protein", "diabetes-friendly"],
    ingredients: [
      "400 g Yukon Gold potatoes",
      "40 g onion, grated",
      "3 large eggs (1 for the rosti, 2 to poach)",
      "1 tbsp all-purpose flour (10 g)",
      "1 tbsp unsalted butter (14 g)",
      "1 tbsp olive oil (14 g)",
      "80 g smoked salmon",
      "60 g plain nonfat Greek yogurt",
      "4 g fresh dill, chopped",
      "1 tbsp capers, rinsed (8 g)",
      "2 tsp lemon juice",
      "1/8 tsp salt",
      "40 g arugula"
    ],
    steps: [
      "Coarsely grate the potatoes, then wrap in a clean towel and wring out as much liquid as possible; the drier, the crispier.",
      "Mix potatoes with onion, 1 beaten egg, flour and the salt.",
      "Heat half the butter and oil in a 20 cm nonstick skillet over medium. Press the potato mixture in firmly, forming a flat cake.",
      "Cook 10-12 minutes without moving until the underside is deep golden. Slide onto a plate, invert back into the pan with the remaining butter and oil and cook 10 minutes more.",
      "Stir dill, lemon juice and capers into the yogurt.",
      "Poach the remaining 2 eggs in barely simmering water 3 minutes; drain on paper towel.",
      "Cut the rosti in half, top each with arugula, smoked salmon and a poached egg.",
      "Spoon dill yogurt alongside and finish with black pepper."
    ]
  },
  {
    id: "chicken-pho-ga",
    name: "Chicken Pho Ga with Charred Aromatics",
    meal: ["lunch", "dinner"],
    level: "chef",
    mins: 120,
    serves: 4,
    kcal: 488, p: 40, c: 63, f: 7, fib: 3, sug: 7, na: 1130, satf: 1.7,
    contains: ["chicken", "fish", "seafood", "onion", "spicy", "rice", "cilantro"],
    tags: ["high-protein"],
    ingredients: [
      "600 g boneless skinless chicken thighs",
      "1.5 L low-sodium chicken broth",
      "1 large onion (200 g), halved",
      "50 g ginger, halved lengthwise",
      "3 star anise, 1 cinnamon stick, 4 cloves, 1 tbsp coriander seeds (6 g)",
      "2 tbsp fish sauce (30 g)",
      "2 tsp sugar (8 g)",
      "1/8 tsp salt",
      "240 g dried flat rice noodles",
      "120 g bean sprouts",
      "15 g Thai basil",
      "15 g cilantro",
      "3 scallions (30 g), sliced",
      "2 limes, in wedges (30 g juice)",
      "1 jalapeno (15 g), sliced"
    ],
    steps: [
      "Char the onion and ginger directly over a gas flame or under a broiler, turning, until blackened in spots, about 10 minutes. Rinse off loose char.",
      "Toast the star anise, cinnamon, cloves and coriander in a dry stockpot 2 minutes until fragrant, then tie in a spice bag.",
      "Add broth, 1 L water, the charred aromatics, spices and chicken thighs. Bring to a bare simmer (never a rolling boil) and skim the scum carefully.",
      "Poach chicken 25 minutes, then remove and cool; shred into bite-size pieces.",
      "Continue simmering the broth gently 45 minutes to deepen the flavor.",
      "Strain the broth through a fine sieve and season with fish sauce, sugar and salt to a balanced savory-sweet taste.",
      "Soak noodles in hot water 20 minutes, then dip in boiling water 20-30 seconds and divide among deep bowls.",
      "Top with chicken and scallions and ladle over boiling-hot broth.",
      "Serve with bean sprouts, herbs, lime wedges and jalapeno for each person to add."
    ]
  },
  {
    id: "falafel-pita-tahini",
    name: "Herb Falafel Pitas with Lemon Tahini",
    meal: ["lunch", "dinner"],
    level: "chef",
    mins: 60,
    serves: 4,
    kcal: 524, p: 20, c: 76, f: 19, fib: 13, sug: 8, na: 670, satf: 2,
    contains: ["gluten", "sesame", "onion", "garlic", "tomato", "beans", "cilantro"],
    tags: ["vegetarian", "vegan", "high-fiber", "budget"],
    ingredients: [
      "200 g dried chickpeas, soaked overnight (not canned)",
      "60 g onion, chopped",
      "4 garlic cloves (12 g), divided",
      "20 g flat-leaf parsley",
      "20 g cilantro",
      "1 tsp cumin + 1 tsp coriander",
      "1/2 tsp baking powder (3 g)",
      "1/4 tsp + 1/8 tsp salt (2.25 g)",
      "Oil for shallow-frying (about 30 g absorbed)",
      "3 tbsp tahini (45 g)",
      "2 tbsp lemon juice",
      "4 whole-wheat pitas (256 g)",
      "150 g tomato, diced",
      "150 g cucumber, diced"
    ],
    steps: [
      "Drain the soaked chickpeas very well and pat dry; raw soaked chickpeas give falafel its fluffy, green interior.",
      "Pulse chickpeas, onion, 3 garlic cloves, parsley, cilantro, cumin, coriander and 1/4 tsp salt in a food processor until finely ground like coarse sand, scraping down often. Do not puree.",
      "Chill the mixture 20 minutes, then stir in baking powder.",
      "Whisk tahini with lemon juice, the remaining grated garlic clove, a pinch of salt and 4-6 tbsp ice water until pale and pourable.",
      "Shape into 20 small patties, packing lightly.",
      "Heat 1.5 cm oil in a skillet to 175 C (350 F) and fry falafel in batches 2-3 minutes per side until deep brown and crisp. Drain on a rack.",
      "Warm the pitas and open them up.",
      "Fill with tomato, cucumber and falafel and drizzle generously with tahini sauce."
    ]
  },
  {
    id: "nicoise-salad-seared-tuna",
    name: "Nicoise Salad with Seared Ahi Tuna",
    meal: ["lunch", "dinner"],
    level: "chef",
    mins: 45,
    serves: 2,
    kcal: 486, p: 42, c: 34, f: 20, fib: 8, sug: 7, na: 490, satf: 3.6,
    contains: ["fish", "seafood", "egg", "onion", "tomato", "olives"],
    tags: ["high-protein", "high-fiber", "diabetes-friendly", "heart-healthy"],
    ingredients: [
      "250 g sushi-grade ahi tuna steak",
      "250 g baby potatoes",
      "150 g green beans, trimmed",
      "2 large eggs",
      "150 g cherry tomatoes, halved",
      "30 g Nicoise or kalamata olives",
      "120 g butter lettuce",
      "1 1/2 tbsp extra-virgin olive oil (20 g)",
      "1 tbsp red wine vinegar",
      "1 1/2 tsp Dijon mustard (8 g)",
      "1 small shallot (15 g), minced",
      "1 tsp canola oil (for searing)",
      "1/8 tsp salt + 1/2 tsp cracked pepper"
    ],
    steps: [
      "Whisk vinegar, Dijon and shallot, then slowly whisk in olive oil to emulsify; rest so the shallot mellows.",
      "Simmer potatoes in water until just tender, 12-15 minutes. Halve and toss with 1 tbsp of the vinaigrette while warm.",
      "Blanch green beans 3 minutes in boiling water, then plunge into ice water.",
      "Boil eggs 8 minutes for jammy yolks, chill in ice water, peel and halve.",
      "Pat tuna dry, coat with cracked pepper and the salt.",
      "Heat a heavy skillet until smoking, add canola oil and sear tuna 45-60 seconds per side, keeping the center rare. Rest 2 minutes and slice thick against the grain.",
      "Arrange lettuce, potatoes, beans, tomatoes, olives and eggs on platters.",
      "Lay tuna over the top and drizzle with remaining vinaigrette."
    ]
  },
  {
    id: "fattoush-sumac-chicken",
    name: "Fattoush with Sumac-Roasted Chicken",
    meal: ["lunch"],
    level: "chef",
    mins: 60,
    serves: 2,
    kcal: 484, p: 44, c: 35, f: 20, fib: 7, sug: 9, na: 560, satf: 3.1,
    contains: ["chicken", "dairy", "gluten", "onion", "garlic", "tomato"],
    tags: ["high-protein", "diabetes-friendly", "heart-healthy"],
    ingredients: [
      "300 g boneless skinless chicken breast",
      "60 g plain nonfat Greek yogurt",
      "1 tbsp sumac + 1/2 tsp allspice (5 g), divided",
      "2 garlic cloves, grated",
      "2 tbsp lemon juice, divided",
      "2 tbsp extra-virgin olive oil (28 g), divided",
      "1/4 tsp salt",
      "1 whole-wheat pita (64 g)",
      "150 g romaine, chopped",
      "150 g tomato, chopped",
      "150 g Persian cucumber, chopped",
      "2 scallions (20 g), sliced",
      "15 g parsley + 10 g mint",
      "40 g pomegranate seeds"
    ],
    steps: [
      "Butterfly or pound the chicken to even 2 cm thickness.",
      "Mix yogurt, half the sumac, allspice, garlic, 1 tbsp lemon juice, 1 tsp oil and half the salt; coat the chicken and marinate 30 minutes (up to 8 hours).",
      "Heat oven to 200 C (400 F). Split the pita into 2 rounds, brush with 1 tsp oil, sprinkle with a little sumac and bake 8 minutes until crisp; break into shards.",
      "Scrape off excess marinade and roast or grill the chicken over high heat 6-7 minutes per side until charred at the edges and 74 C (165 F) inside. Rest 5 minutes.",
      "Whisk remaining oil, lemon juice, sumac and salt into a sharp dressing.",
      "Toss lettuce, tomato, cucumber, scallions and herbs with the dressing, then fold in the pita shards so they stay partly crisp.",
      "Slice the chicken, lay over the salad and scatter with pomegranate seeds."
    ]
  },
  {
    id: "butternut-squash-soup-sage-brown-butter",
    name: "Roasted Butternut Squash Soup with Sage Brown Butter & Pepitas",
    meal: ["lunch", "dinner"],
    level: "chef",
    mins: 75,
    serves: 4,
    kcal: 365, p: 13, c: 55, f: 13, fib: 10, sug: 10, na: 400, satf: 4,
    contains: ["dairy", "onion", "garlic", "beans"],
    tags: ["vegetarian", "high-fiber", "heart-healthy", "low-sodium", "meal-prep"],
    ingredients: [
      "1 large butternut squash (1.2 kg), peeled and cubed",
      "1 onion (150 g), in wedges",
      "3 garlic cloves, unpeeled",
      "1 tbsp olive oil (14 g)",
      "240 g canned white beans, rinsed",
      "900 ml low-sodium vegetable broth",
      "1/4 tsp salt",
      "Pinch of nutmeg",
      "20 g unsalted butter",
      "12 fresh sage leaves (4 g)",
      "40 g pumpkin seeds",
      "60 g plain nonfat Greek yogurt, to swirl"
    ],
    steps: [
      "Heat oven to 220 C (425 F). Toss squash, onion and garlic with oil and roast 35-40 minutes, turning once, until deeply caramelized at the edges.",
      "Toast pumpkin seeds in a dry skillet until they pop and smell nutty; set aside.",
      "Squeeze the roasted garlic from its skins into a pot. Add squash, onion, beans and broth and simmer 10 minutes.",
      "Blend until completely silky (a high-speed blender works best), adding broth or water to reach a pourable consistency. Season with salt and nutmeg.",
      "In a small pan, melt butter over medium and add sage leaves. Swirl until the butter foams, the milk solids turn hazelnut brown and the sage crisps, 2-3 minutes.",
      "Lift out the sage onto paper towel.",
      "Ladle soup into bowls, swirl in yogurt and drizzle with brown butter.",
      "Top with crisp sage and toasted pepitas."
    ]
  },
  {
    id: "jerk-chicken-rice-and-peas",
    name: "Jamaican Jerk Chicken with Rice and Peas",
    meal: ["lunch", "dinner"],
    level: "chef",
    mins: 90,
    serves: 4,
    kcal: 560, p: 44, c: 58, f: 16, fib: 7, sug: 4, na: 540, satf: 5.5,
    contains: ["chicken", "gluten", "soy", "onion", "garlic", "spicy", "coconut", "beans", "rice"],
    tags: ["high-protein"],
    ingredients: [
      "700 g boneless skinless chicken thighs",
      "4 scallions (40 g)",
      "1-2 scotch bonnets (10 g)",
      "3 garlic cloves",
      "1 tbsp grated ginger (10 g)",
      "2 tsp ground allspice, 1 tsp dried thyme, 1/2 tsp cinnamon, 1/4 tsp nutmeg (6 g)",
      "1 tbsp low-sodium soy sauce",
      "2 tbsp lime juice",
      "2 tsp brown sugar (8 g)",
      "1 tbsp canola oil (14 g)",
      "1/4 tsp salt",
      "200 g long-grain brown rice",
      "240 g canned kidney beans, rinsed",
      "200 ml light coconut milk",
      "60 g onion, diced"
    ],
    steps: [
      "Blend scallions (reserve a few slices for garnish), scotch bonnet, garlic, ginger, spices, soy sauce, lime juice, brown sugar and oil into a smooth marinade.",
      "Score the chicken, rub with the marinade and refrigerate at least 4 hours or overnight.",
      "For rice and peas, combine rice, beans, coconut milk, onion, salt and 300 ml water in a heavy pot; bring to a boil.",
      "Cover tightly and simmer on the lowest heat 40 minutes, then rest 10 minutes covered and fluff.",
      "Heat a grill or grill pan to medium-high. Grill chicken 6-7 minutes per side, moving it to a cooler zone if it chars too fast, until 74 C (165 F) inside with blackened edges.",
      "Rest 5 minutes, then chop.",
      "Serve chicken over rice and peas with lime wedges and reserved scallions."
    ]
  },
  {
    id: "red-wine-braised-beef-mushrooms",
    name: "Red Wine Braised Beef with Mushrooms & Smashed Potatoes",
    meal: ["dinner"],
    level: "chef",
    mins: 150,
    serves: 4,
    kcal: 543, p: 45, c: 46, f: 21, fib: 7, sug: 10, na: 535, satf: 6.5,
    contains: ["beef", "dairy", "gluten", "mushrooms", "onion", "garlic", "tomato"],
    tags: ["high-protein"],
    ingredients: [
      "700 g beef chuck, trimmed and cut in 5 cm pieces",
      "1 tbsp all-purpose flour (10 g)",
      "4 tsp olive oil (20 g), divided",
      "1 onion (200 g), diced",
      "200 g carrots, in thick coins",
      "3 garlic cloves, smashed",
      "2 tbsp tomato paste (32 g)",
      "300 ml dry red wine",
      "400 ml low-sodium beef broth",
      "300 g cremini mushrooms, quartered",
      "2 sprigs thyme + 2 bay leaves",
      "1/2 tsp salt (3 g), divided",
      "600 g Yukon Gold potatoes",
      "60 ml 2% milk",
      "5 g parsley, chopped"
    ],
    steps: [
      "Pat beef very dry and season with half the salt; let sit 20 minutes at room temperature.",
      "Heat oven to 160 C (325 F). Heat half the oil in a Dutch oven over medium-high and sear beef in batches without crowding until a deep brown crust forms on 2-3 sides, 8-10 minutes per batch.",
      "Lower heat, add onion and carrots and cook 6 minutes, scraping up the browned bits.",
      "Stir in garlic and tomato paste and cook 2 minutes until the paste darkens to brick red; sprinkle in flour and stir 1 minute.",
      "Pour in wine and boil 3-4 minutes to reduce by half, scraping the bottom.",
      "Return beef with broth, thyme and bay; bring to a simmer, cover and braise in the oven 2 hours until fork-tender.",
      "Meanwhile brown the mushrooms in remaining oil over high heat until golden; add to the pot for the last 30 minutes.",
      "Simmer potatoes until tender, drain, then smash with warm milk and remaining salt.",
      "If the sauce is thin, reduce it on the stovetop to a glossy coat. Remove herbs, scatter with parsley and serve over the potatoes."
    ]
  },
  {
    id: "chicken-mole-poblano",
    name: "Chicken Mole Poblano from Scratch",
    meal: ["dinner"],
    level: "chef",
    mins: 120,
    serves: 4,
    kcal: 629, p: 45, c: 64, f: 21, fib: 6, sug: 8, na: 470, satf: 4.4,
    contains: ["chicken", "nuts", "sesame", "onion", "garlic", "tomato", "rice"],
    tags: ["high-protein"],
    ingredients: [
      "700 g boneless skinless chicken thighs",
      "30 g dried ancho and guajillo chiles, stemmed and seeded",
      "4 tsp canola oil (20 g), divided",
      "1 onion (120 g), chopped",
      "3 garlic cloves",
      "200 g tomatoes",
      "25 g almonds",
      "12 g sesame seeds, divided",
      "20 g raisins",
      "1 corn tortilla (26 g), torn",
      "25 g Mexican or dark chocolate",
      "1/2 tsp cinnamon, 1/4 tsp cumin, 2 cloves, 1/4 tsp black pepper (3 g)",
      "600 ml low-sodium chicken broth",
      "1/4 tsp + 1/8 tsp salt (2.25 g)",
      "600 g cooked white rice"
    ],
    steps: [
      "Toast the chiles in a dry skillet 20-30 seconds per side until fragrant and pliable (do not burn), then soak in hot water 20 minutes.",
      "In the same skillet toast almonds and 10 g sesame seeds until golden; toast the spices 30 seconds.",
      "Heat 2 tsp oil and fry onion, garlic, tomatoes, raisins and the torn tortilla until the tomatoes collapse and everything is browned, 10 minutes.",
      "Blend drained chiles, the fried mixture, nuts, seeds, spices and 300 ml broth until completely smooth; push through a sieve.",
      "Heat remaining oil in a heavy pot until shimmering, add the puree all at once (it will splatter) and fry, stirring, 5 minutes until darker and thick.",
      "Add remaining broth, chocolate and salt, and simmer gently 30 minutes, stirring often, until the sauce coats a spoon.",
      "Nestle in the chicken and simmer, covered, 25 minutes until tender and cooked through.",
      "Serve over rice, sprinkled with the remaining sesame seeds."
    ]
  },
  {
    id: "butter-basted-steak-chimichurri",
    name: "Butter-Basted Sirloin with Chimichurri & Crispy Potatoes",
    meal: ["dinner"],
    level: "chef",
    mins: 55,
    serves: 2,
    kcal: 616, p: 41, c: 39, f: 33, fib: 5, sug: 2, na: 415, satf: 9.7,
    contains: ["beef", "dairy", "garlic", "spicy"],
    tags: ["high-protein", "diabetes-friendly"],
    ingredients: [
      "340 g top sirloin steak, about 3 cm thick",
      "1 tsp canola oil",
      "1 tbsp unsalted butter (14 g)",
      "3 garlic cloves, divided",
      "3 sprigs thyme",
      "25 g flat-leaf parsley, finely chopped",
      "1/2 tsp dried oregano",
      "1 tbsp red wine vinegar",
      "2 tbsp extra-virgin olive oil (28 g), divided",
      "1/4 tsp red pepper flakes",
      "1/4 tsp salt (1.5 g), divided",
      "400 g baby potatoes",
      "50 g arugula"
    ],
    steps: [
      "Season steak with most of the salt and leave uncovered on a rack 30 minutes (or overnight in the fridge) to dry the surface.",
      "Make chimichurri: mix parsley, oregano, 1 minced garlic clove, vinegar, pepper flakes and 1 1/2 tbsp of the olive oil; rest 20 minutes.",
      "Boil potatoes until just tender, drain, smash flat and roast at 230 C (450 F) with remaining olive oil and a pinch of salt 25 minutes until crisp.",
      "Heat a cast-iron skillet until smoking hot, add canola oil and lay in the steak. Sear 3 minutes without moving.",
      "Flip, then add butter, 2 smashed garlic cloves and thyme. Tilt the pan and baste the steak continuously with foaming butter for 2-3 minutes.",
      "Check the center reaches 52-54 C (125-130 F) for medium-rare.",
      "Rest the steak 8 minutes on a board, then slice against the grain.",
      "Serve with crispy potatoes and arugula, spooning chimichurri over the steak."
    ]
  },
  {
    id: "lamb-tagine-apricots-chickpeas",
    name: "Lamb Tagine with Apricots & Chickpeas over Couscous",
    meal: ["dinner"],
    level: "chef",
    mins: 135,
    serves: 4,
    kcal: 660, p: 47, c: 79, f: 18, fib: 11, sug: 18, na: 540, satf: 4,
    contains: ["chicken", "lamb", "gluten", "nuts", "onion", "garlic", "tomato", "beans", "cilantro"],
    tags: ["high-protein", "high-fiber", "heart-healthy"],
    ingredients: [
      "600 g lean lamb leg, in 4 cm cubes",
      "4 tsp olive oil (20 g)",
      "1 large onion (200 g), grated",
      "3 garlic cloves, minced",
      "1 tbsp grated ginger (10 g)",
      "Ras el hanout: 1 tsp each cumin, coriander, paprika, 1/2 tsp each cinnamon, turmeric (10 g)",
      "Pinch of saffron, steeped in 2 tbsp hot water",
      "200 g no-salt-added crushed tomatoes",
      "500 ml low-sodium chicken broth",
      "240 g canned chickpeas, rinsed",
      "80 g dried apricots, halved",
      "2 tsp honey (10 g)",
      "1/4 tsp + 1/8 tsp salt (2.25 g)",
      "200 g couscous",
      "20 g sliced almonds, toasted",
      "8 g cilantro"
    ],
    steps: [
      "Toss lamb with half the ras el hanout and the salt; marinate 30 minutes (or overnight).",
      "Heat oil in a tagine or heavy Dutch oven over medium-high and brown the lamb in batches until well colored; set aside.",
      "Lower heat, add grated onion and cook 8 minutes until golden and jammy.",
      "Add garlic, ginger and the rest of the ras el hanout and stir 1 minute.",
      "Return lamb with the saffron and its water, tomatoes and broth. Cover and simmer very gently 1 1/4 hours.",
      "Add chickpeas, apricots and honey and simmer uncovered 20-25 minutes until the lamb is tender and the sauce is thick and glossy.",
      "Pour 250 ml boiling water over the couscous, cover 5 minutes and fluff with a fork.",
      "Serve the tagine over couscous topped with toasted almonds and cilantro."
    ]
  },
  {
    id: "wild-mushroom-risotto",
    name: "Wild Mushroom Risotto",
    meal: ["dinner"],
    level: "chef",
    mins: 50,
    serves: 4,
    kcal: 436, p: 13, c: 73, f: 10, fib: 3, sug: 5, na: 500, satf: 4.2,
    contains: ["dairy", "mushrooms", "onion", "garlic", "rice"],
    tags: ["vegetarian"],
    ingredients: [
      "1 tbsp olive oil (14 g)",
      "15 g unsalted butter",
      "200 g cremini mushrooms, sliced",
      "200 g shiitake mushrooms, sliced",
      "100 g shallots, finely diced",
      "2 garlic cloves, minced",
      "300 g Arborio or Carnaroli rice",
      "120 ml dry white wine",
      "1.2 L low-sodium vegetable broth, kept hot",
      "1 tsp fresh thyme leaves",
      "40 g parmesan, finely grated",
      "5 g parsley, chopped",
      "1/4 tsp salt",
      "2 tsp lemon juice"
    ],
    steps: [
      "Keep the broth at a bare simmer in a saucepan next to the stove.",
      "Heat half the oil in a wide pan over high and sear mushrooms in two batches, undisturbed for 2 minutes, then stir until browned. Season with a pinch of salt and set aside.",
      "Lower heat to medium, add remaining oil and half the butter and sweat shallots 4 minutes until translucent; add garlic and thyme for 30 seconds.",
      "Add rice and toast, stirring, 2 minutes until the edges look glassy.",
      "Pour in wine and stir until absorbed.",
      "Add hot broth one ladle at a time, stirring often and waiting until each addition is nearly absorbed, for 18-20 minutes, until the rice is creamy but still al dente.",
      "Fold in two-thirds of the mushrooms.",
      "Off the heat, beat in remaining butter, parmesan, lemon juice and salt vigorously (the mantecatura) until glossy and flowing; rest 1 minute.",
      "Serve in warm bowls topped with the remaining mushrooms and parsley."
    ]
  },
  {
    id: "baked-eggplant-parmesan",
    name: "Baked Eggplant Parmesan with Slow-Simmered Marinara",
    meal: ["dinner"],
    level: "chef",
    mins: 90,
    serves: 4,
    kcal: 446, p: 24, c: 47, f: 20, fib: 12, sug: 20, na: 740, satf: 7.4,
    contains: ["egg", "dairy", "gluten", "onion", "garlic", "tomato", "spicy", "eggplant"],
    tags: ["vegetarian", "high-fiber"],
    ingredients: [
      "2 large eggplants (900 g), in 1 cm slices",
      "1/4 tsp salt for sweating + 1/8 tsp for the sauce (count 1.25 g, rest rinsed off)",
      "2 large eggs, beaten",
      "80 g dry breadcrumbs",
      "40 g parmesan, grated, divided",
      "2 tbsp extra-virgin olive oil (28 g), divided",
      "1 onion (100 g), finely diced",
      "3 garlic cloves, sliced",
      "800 g no-salt-added crushed San Marzano tomatoes",
      "10 g fresh basil",
      "1/4 tsp red pepper flakes",
      "150 g part-skim mozzarella, torn"
    ],
    steps: [
      "Salt the eggplant slices, layer in a colander and let sweat 30 minutes. Rinse and pat thoroughly dry.",
      "For the marinara, warm 1 tbsp oil and cook onion gently 8 minutes, add garlic and pepper flakes 1 minute, then tomatoes and half the basil. Simmer 40 minutes, stirring now and then, until thick and sweet.",
      "Heat oven to 220 C (425 F). Mix breadcrumbs with half the parmesan.",
      "Dip eggplant in egg, then breadcrumbs, and arrange on 2 oiled, lined sheet pans. Brush tops with remaining oil.",
      "Bake 20-25 minutes, flipping once, until golden and tender.",
      "Reduce oven to 190 C (375 F). Layer sauce, eggplant and mozzarella in a 23 x 33 cm dish, finishing with sauce, mozzarella and the remaining parmesan.",
      "Bake 25 minutes until bubbling and browned on top.",
      "Rest 15 minutes so it slices cleanly, then top with remaining basil."
    ]
  },
  {
    id: "thai-green-curry-shrimp",
    name: "Thai Green Curry with Homemade Paste & Shrimp",
    meal: ["dinner"],
    level: "chef",
    mins: 60,
    serves: 4,
    kcal: 524, p: 33, c: 65, f: 15, fib: 4, sug: 8, na: 785, satf: 9.8,
    contains: ["fish", "shellfish", "seafood", "onion", "garlic", "spicy", "coconut", "rice", "cilantro", "eggplant", "bell-pepper"],
    tags: ["high-protein"],
    ingredients: [
      "40 g green Thai chiles or serranos",
      "2 stalks lemongrass, tender core (30 g)",
      "20 g galangal or ginger",
      "4 garlic cloves (12 g)",
      "2 shallots (50 g)",
      "20 g cilantro, stems and roots included",
      "1 tsp each cumin and coriander seeds, toasted (3 g)",
      "Zest and juice of 2 limes (30 g juice)",
      "2 tbsp fish sauce (30 g), divided",
      "1 tbsp canola oil (14 g)",
      "600 ml light coconut milk",
      "500 g large shrimp, peeled and deveined",
      "150 g red bell pepper, sliced",
      "200 g Thai or Japanese eggplant, cubed",
      "2 tsp brown or palm sugar (8 g)",
      "15 g Thai basil",
      "240 g jasmine rice"
    ],
    steps: [
      "Pound or blend chiles, lemongrass, galangal, garlic, shallots, cilantro, toasted seeds, lime zest and 1 tbsp fish sauce into a fine paste, adding a splash of water only if needed.",
      "Rinse the rice and cook with 360 ml water: boil, cover, simmer 12 minutes and rest 10 minutes.",
      "Heat oil in a wok over medium and fry 4-5 tbsp of the paste, stirring, 3-4 minutes until very fragrant and the oil turns green.",
      "Add 200 ml coconut milk and simmer until the oil begins to separate, 4 minutes.",
      "Add remaining coconut milk, eggplant and sugar and simmer 8 minutes until the eggplant is tender.",
      "Add bell pepper and shrimp and simmer 3 minutes until shrimp are just pink.",
      "Season with remaining fish sauce and lime juice to taste, balancing salty, sour, sweet and hot.",
      "Stir in Thai basil off the heat and serve with jasmine rice. Freeze leftover paste for next time."
    ]
  },
  {
    id: "baba-ganoush-zaatar-pita-crisps",
    name: "Smoky Baba Ganoush with Za'atar Pita Crisps",
    meal: ["snack"],
    level: "chef",
    mins: 60,
    serves: 4,
    kcal: 253, p: 7, c: 32, f: 13, fib: 9, sug: 6, na: 260, satf: 1.8,
    contains: ["gluten", "sesame", "garlic", "eggplant"],
    tags: ["vegetarian", "vegan", "high-fiber", "diabetes-friendly", "heart-healthy", "low-sodium"],
    ingredients: [
      "2 medium eggplants (800 g, about 700 g usable)",
      "3 tbsp tahini (45 g)",
      "2 tbsp lemon juice",
      "2 garlic cloves, grated",
      "1 1/2 tbsp extra-virgin olive oil (21 g), divided",
      "1/8 tsp salt",
      "Pinch of smoked paprika",
      "5 g parsley, chopped",
      "2 whole-wheat pitas (128 g)",
      "2 tsp za'atar (thyme, sumac, sesame) (4 g)"
    ],
    steps: [
      "Prick the eggplants and char directly over a gas flame or under a very hot broiler, turning, 20-25 minutes until the skin is blackened and the flesh collapses.",
      "Transfer to a colander, slit open and let drain 15 minutes so the dip is not watery.",
      "Scoop the smoky flesh away from the skin and chop it finely with a knife (for texture) rather than blending.",
      "Whisk tahini, lemon juice, garlic and salt with 2 tbsp ice water until pale and creamy.",
      "Fold the eggplant into the tahini mixture; taste and adjust lemon.",
      "Heat oven to 190 C (375 F). Split pitas, brush with 1 tsp oil, sprinkle with za'atar and bake 8-10 minutes until crisp; break into pieces.",
      "Spread baba ganoush in a shallow bowl, drizzle with remaining oil and sprinkle with paprika and parsley.",
      "Serve with the warm pita crisps."
    ]
  },
  {
    id: "seeded-crackers-whipped-ricotta",
    name: "Seeded Rye-Style Crackers with Lemon Whipped Ricotta",
    meal: ["snack"],
    level: "chef",
    mins: 70,
    serves: 4,
    kcal: 252, p: 11, c: 18, f: 16, fib: 6, sug: 2, na: 190, satf: 3.7,
    contains: ["dairy", "gluten", "sesame"],
    tags: ["vegetarian", "high-fiber", "low-carb", "diabetes-friendly", "heart-healthy", "low-sodium", "meal-prep"],
    ingredients: [
      "30 g pumpkin seeds",
      "20 g sesame seeds",
      "25 g ground flaxseed",
      "20 g chia seeds",
      "50 g whole-wheat flour",
      "2 tsp olive oil (9 g)",
      "1/4 tsp salt",
      "1 tsp chopped rosemary",
      "160 g part-skim ricotta",
      "1 tsp honey",
      "Zest of 1 lemon + 1 tsp juice"
    ],
    steps: [
      "Stir seeds, flax, chia, flour, rosemary and most of the salt with 120 ml warm water and the oil; rest 15 minutes until the chia gels into a firm dough.",
      "Heat oven to 160 C (325 F).",
      "Roll the dough very thinly (2 mm) between two sheets of parchment.",
      "Peel off the top sheet, score into 24 crackers and sprinkle with remaining salt.",
      "Bake 25 minutes, flip the sheet, peel off the parchment and bake 15-20 minutes more until crisp and golden. Cool completely on a rack; they crisp further as they cool.",
      "Whip ricotta with lemon zest and juice in a food processor 2 minutes until fluffy and smooth.",
      "Spoon into a bowl, drizzle with honey and crack black pepper over the top.",
      "Serve 6 crackers per person with the ricotta. Crackers keep 1 week airtight."
    ]
  },
  {
    id: "shrimp-spring-rolls-peanut-sauce",
    name: "Fresh Shrimp Spring Rolls with Peanut Dipping Sauce",
    meal: ["snack", "lunch"],
    level: "chef",
    mins: 50,
    serves: 4,
    kcal: 262, p: 16, c: 36, f: 7, fib: 3, sug: 4, na: 325, satf: 1.3,
    contains: ["shellfish", "seafood", "gluten", "soy", "peanuts", "garlic", "spicy", "rice", "cilantro"],
    tags: ["diabetes-friendly", "heart-healthy", "low-sodium"],
    ingredients: [
      "8 rice paper wrappers (80 g)",
      "200 g shrimp, peeled",
      "60 g dried rice vermicelli",
      "80 g butter lettuce",
      "80 g carrot, julienned",
      "80 g cucumber, julienned",
      "10 g mint + 10 g Thai basil",
      "10 g cilantro",
      "3 tbsp natural peanut butter (48 g)",
      "1 tbsp low-sodium soy sauce",
      "1 tbsp lime juice",
      "1 tsp honey",
      "1 garlic clove, grated",
      "1 tsp sriracha"
    ],
    steps: [
      "Poach shrimp in simmering water 2 minutes until just pink, chill in ice water, then halve lengthwise.",
      "Cook vermicelli per package, rinse in cold water and drain very well.",
      "Whisk peanut butter, soy sauce, lime, honey, garlic and sriracha with 3-4 tbsp hot water until smooth and pourable.",
      "Set up a station: a wide shallow dish of warm water, a damp board and all fillings within reach.",
      "Dip one rice paper in the water for 5 seconds and lay it on the board; it will keep softening.",
      "Place 3 shrimp halves cut-side up across the lower third, then lettuce, a little noodles, carrot, cucumber and herbs.",
      "Fold the bottom over the filling, fold in the sides and roll up tightly so the shrimp show through the wrapper.",
      "Repeat with the remaining wrappers and keep under a damp towel. Serve 2 rolls per person with the sauce."
    ]
  }
];
