# Calorie Coach

A personal calorie tracker and meal planner that runs as a web app you can add to your phone's home screen.

- **Personal targets.** Calories, protein, carbs, fat and fiber come from your age, sex, height, weight, activity and goal (Mifflin–St Jeor formula).
- **Family health aware.** Mark diabetes, high blood pressure, heart disease, high cholesterol, stroke or kidney disease as "family" or "me". Your sugar, carb, sodium and saturated-fat limits tighten to match.
- **Detailed logging.** Search about 220 foods and every recipe. Adjust portions by servings or grams and see calories, macros, fiber, sugar, sodium and saturated fat before you add anything. Warnings appear when one item uses a big share of a daily limit.
- **Meal ideas.** Each day gets a breakfast, lunch, dinner and snack plan scaled to your calories. It skips foods you dislike or can't eat and favors recipes that suit your health profile. Recipes match how much you like to cook: quick and simple, everyday home cooking, or chef-level projects. A "cooking mood" switch changes the plan for one day.
- **Habits.** A seven-day calorie chart, daily averages, and plain-language tips about what to work on, naming the foods responsible.
- **Private.** Everything is stored on the device. A backup and restore option lets you move phones.

Coming next: camera scanning to recognize food and estimate calories before you eat.

## Running locally

It's a static site with no build step:

```sh
npx serve .
```

## Deploying

Import the repo into Vercel as a new project. The framework preset is "Other" and there's no build command.

Nutrition values are averages based on USDA FoodData Central. This app gives general guidance, not medical advice.
