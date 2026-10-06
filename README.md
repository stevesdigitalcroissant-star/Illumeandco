# Montabo Soleil

The website and ordering app for Montabo Soleil, which sells French Guianese and Caribbean food at a Paris market.

- **Click & collect.** Customers order meals, baked goods, drinks and spices, choose a pickup slot (Saturday or Sunday, 9:00–17:00, every 30 minutes) and pay by card through Stripe Checkout. Apple Pay and Google Pay work there too.
- **Events (traiteur).** Customers choose trays and request them at least 4 days ahead. The chef confirms and sets the price, and the client gets a payment link by email.
- **Private chef (cheffe à domicile).** Bookings are requests only, never automatic. See "Safety" below.
- **Chef's dashboard (`/admin`).** Shows orders by pickup day with a combined prep list and a print button. Orders move through New → Preparing → Ready, and the customer gets an email when it's ready. The chef answers requests (accept with a price, or decline), marks items sold out, and can pause all orders.
- Allergens (the 14 EU allergens) are shown on every product, as French INCO rules require.

The menu and business details live in `data/menu.js` and `data/config.js`. **Right now they are sample content.**

## Safety for private-chef bookings
- Every booking is a request the chef reviews. She is prompted to phone the client first and can decline without giving a reason.
- Only certain venue types are accepted: a private home with the host present, a rented hall, company premises, or an association. Île-de-France postcodes only. 6–40 guests, booked at least 10 days ahead.
- The client must confirm they are an adult, that the host will be present, and that the chef may leave if she feels unsafe.
- A 30% card deposit is taken after acceptance, which ties the booking to a real payment identity.
- The dashboard flags returning clients.
- A trusted contact (`SAFETY_EMAIL`) is emailed the address, client and time of every confirmed booking. On the day, the chef taps **"Je suis arrivée"** and **"J'ai terminé"**. The arrival email tells the contact when to expect the "done" message and to call her if it doesn't come.

## Setup on Vercel
1. Import this repo as a new Vercel project. Choose the "Other" framework preset; there is no build step.
2. Go to **Storage → Create → Blob**, choose **private**, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. In **Settings → Environment Variables**, add:
   - `ADMIN_PASSWORD`: the chef's dashboard password.
   - `ADMIN_SECRET`: any long random text.
   - `STRIPE_SECRET_KEY`: from the Stripe dashboard, under Developers → API keys. Use a test key first.
   - `STRIPE_WEBHOOK_SECRET`: in Stripe, go to Developers → Webhooks, add the endpoint `https://<domain>/api/stripe-webhook` with the event `checkout.session.completed`, and copy its signing secret.
   - `RESEND_API_KEY` and `MAIL_FROM`: from resend.com. Verify your domain to send from your own address.
   - `ORDER_EMAIL`: where new orders and requests are sent.
   - `SAFETY_EMAIL`: the trusted contact for private-chef bookings.
4. Redeploy. Open `/admin`; any setup still missing is listed at the top.
