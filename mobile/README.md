# Illume — iPhone & iPad app

The Illume app is Illume Studio in a native frame: it opens
`https://www.illumeandco.online/generation` full-screen, so everything that ships
on the website is in the app instantly. On top of the website it adds:

- **Save to Photos / Files / AirDrop** — a take's *Download* button and *Export cut*
  open the iOS share sheet.
- **A gentle vibration** when a take finishes.
- **Links to other sites** (photo credits, emails, Google, Atlas) open outside the
  app; the studio and Stripe checkout stay inside.
- **An offline screen** with *Try again*, pull-to-refresh, and swipe back/forward.
- Gold-dot **Illume** icon and splash, iPhone and iPad, portrait and landscape.

## Try it on your iPhone/iPad with Expo Go (no App Store needed)

You need a computer (Mac or Windows) once, on the same Wi-Fi as your phone.

1. On the iPhone/iPad, install **Expo Go** from the App Store.
2. On the computer, install **Node.js LTS** from nodejs.org.
3. Get this repository on the computer (GitHub → *Code* → *Download ZIP*, or `git clone`).
4. In a terminal:
   ```bash
   cd Illumeandco/mobile
   npm install
   npx expo start
   ```
5. A QR code appears. Open the iPhone **Camera** app, point it at the QR code and tap
   the banner — Illume opens inside Expo Go. Sign in once; you stay signed in.

Not on the same Wi-Fi? Use `npx expo start --tunnel` instead.

*In Expo Go the home-screen icon and name are Expo Go's — your own Illume icon and
name appear once it's built as its own app (below).*

## Later: your own app in the App Store

1. Create an Apple Developer account ($99/year).
2. `npx eas-cli@latest login`, then `npx eas-cli@latest build --platform ios`
   (Expo builds it in the cloud — no Mac/Xcode needed).
3. `npx eas-cli@latest submit --platform ios` → TestFlight → App Store review.

Before the App Store: in-app purchases rules apply to selling credits inside an iOS
app (see the main README), and Apple requires a way to delete your account in the app.

## Development

```bash
npx tsc --noEmit     # typecheck
npx expo-doctor      # check dependencies
```
The web side of the bridge lives in `Generation/index.html` ("inside the Illume
iPhone/iPad app"): `appSave()` sends files in base64 chunks (`save-start`,
`save-chunk`, `save-end`), and a finished take sends `haptic`.
