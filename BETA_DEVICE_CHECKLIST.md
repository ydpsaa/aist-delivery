# AIST Beta Device Testing Checklist

> **Version**: Beta 1.0 · **Date**: April 2026  
> **Build type required**: Physical device (real push tokens, real GPS)  
> **Test accounts**:
> - Customer: `customer@aist.cz` / `Aist1234`
> - Courier: `courier3@aist.cz` / `courier123`
> - Admin: `ydolishniy@gmail.com` / `YDfootball17@`

---

## Prerequisites

- [ ] Physical iOS or Android device (not simulator/emulator)
- [ ] AIST TestFlight build (iOS) or APK (Android) installed
- [ ] Device connected to internet (LTE or WiFi)
- [ ] Location permissions granted: **"While Using" or "Always"** for courier device
- [ ] Push notification permission granted when prompted

---

## 1. Customer Flow

### 1.1 Onboarding
- [ ] App launch — splash screen shows AIST logo on white background
- [ ] Welcome screen — "Sign in with Google" and "Continue with email" visible
- [ ] Email registration: enter name, email, password → account created
- [ ] Email login: existing credentials work, JWT session persists after app restart
- [ ] Language picker works (EN / CS / RU / UK)

### 1.2 Address Flow (Google Places)
- [ ] Home map renders correctly (Google Maps tiles visible)
- [ ] Tap "Where are you sending?" → address picker opens
- [ ] **Search tab**: type an address → Places Autocomplete results appear
- [ ] Select an autocomplete result → coordinates saved, pin drops on map
- [ ] **Map tab**: tap anywhere on map → reverse-geocoded label appears
- [ ] Address details sheet: note / floor / buzzer fields optional and saved
- [ ] Both pickup and dropoff addresses can be set

### 1.3 Order Creation
- [ ] Service type selection: Flash / Window / Buy For Me
- [ ] Price shown in CZK before confirmation
- [ ] Promo code field: valid code applies discount
- [ ] Promo code field: invalid code shows error message
- [ ] Order submit → "Searching for courier" state shown on home screen

### 1.4 Live Tracking
- [ ] After courier accepts: tracking screen opens automatically
- [ ] Courier location pin visible on map (updates in real time)
- [ ] Order status updates: searching → accepted → picked_up → delivered
- [ ] Push notification received when courier assigned (physical device only)

### 1.5 Post-Delivery
- [ ] Order status updates to "Delivered"
- [ ] Invoice accessible in order history
- [ ] Order history lists past orders with status and price

### 1.6 Profile
- [ ] Profile screen shows name and email
- [ ] Logout clears session and redirects to welcome screen
- [ ] Language change from profile settings works

---

## 2. Courier Flow

### 2.1 Login
- [ ] Login with `courier3@aist.cz` → courier tab shown (not customer tabs)
- [ ] Courier dashboard loads map

### 2.2 Going Online
- [ ] "Go Online" toggle switches status to online
- [ ] Courier appears on dispatcher map within 10 seconds

### 2.3 Receiving an Order
- [ ] Push notification received when a new order is available
- [ ] Notification shows pickup address, dropoff area, and estimated price
- [ ] Tap notification → app opens to order acceptance screen

### 2.4 Active Delivery
- [ ] Accept order → GPS tracking begins automatically
- [ ] Location permission dialog appears on first delivery (if not yet granted)
- [ ] Dispatcher map shows courier moving in real time
- [ ] Customer sees courier moving on their tracking map
- [ ] Status advance: accepted → courier_arrived → picked_up → delivered
- [ ] Each status change is reflected on customer screen within 3 seconds

### 2.5 Completion
- [ ] Mark delivered → payment captured (mock: logged; live: Stripe)
- [ ] Go offline → GPS tracking stops
- [ ] Courier disappears from dispatcher map

### 2.6 Location Edge Cases
- [ ] GPS permission denied → graceful error, not crash
- [ ] App backgrounded during delivery → foreground tracking may pause (expected in Expo Go)
- [ ] Background tracking (development client only): location updates continue in background

---

## 3. Admin / Dispatcher Flow

### 3.1 Admin Login
- [ ] Login with admin credentials → admin panel loads
- [ ] Dashboard shows order counts, revenue, active couriers

### 3.2 Dispatcher
- [ ] Dispatcher map shows all online couriers
- [ ] Courier location pins update in real time
- [ ] Manual order assignment: select order → assign to courier → courier notified
- [ ] Order list filters by status

### 3.3 Finance Operations
- [ ] Orders list: all statuses visible, correct CZK amounts
- [ ] Invoice list: PDF accessible, correct Czech faktura format
- [ ] Refund evaluation: approve or reject refund request
- [ ] Coupon generation: create code with discount type and max uses
- [ ] Payout batch: select couriers, calculate payout, approve

### 3.4 System Status Page
- [ ] Integration cards show correct status for each service
- [ ] Missing credentials listed clearly with ENV var names
- [ ] "Beta Checklist" tab accessible and shows all flows

### 3.5 Email Log
- [ ] Email events logged (sent / skipped in mock mode / failed)
- [ ] Stats (total / sent / skipped / failed) visible

---

## 4. Permissions Matrix

| Permission | Customer | Courier | When Required |
|---|---|---|---|
| Location (while using) | Optional | Required | Address picker; order tracking |
| Location (always) | Not needed | Recommended | Background location in dev client build |
| Push notifications | Required | Required | Order updates, new order alerts |
| Camera | Optional | Optional | Proof of delivery (future feature) |

---

## 5. Known Limitations in Beta

| Limitation | Details |
|---|---|
| Push notifications | Real tokens only on physical device, not simulator |
| Background location | Requires development client build (not Expo Go) |
| Google Sign-In | Requires `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` configured |
| Real Stripe payments | Requires `STRIPE_SECRET_KEY` (test or live) |
| PDF cloud storage | Requires `STORAGE_BUCKET_URL` + access/secret keys |
| Email delivery | Requires `SENDGRID_API_KEY` (mock mode logs but doesn't send) |
| Phone auth | Requires Firebase Admin SDK credentials |

---

## 6. Bug Report Template

```
**Device**: iPhone 15 / Samsung Galaxy S24 / etc.
**OS**: iOS 17.4 / Android 14
**Build**: Beta 1.0 / TestFlight / APK
**Step**: [which step from this checklist]
**Expected**: [what should happen]
**Actual**: [what happened instead]
**Crash**: Yes / No
**Screenshot/video**: [attach]
```

---

## 7. Build Commands Reference

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo/EAS
eas login

# Configure the project (first time)
eas build:configure

# Development build (for background location + custom modules)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (internal distribution, TestFlight/APK)
eas build --profile preview --platform all

# Submit to TestFlight (iOS)
eas submit --platform ios

# OTA update (no new build needed for JS changes)
eas update --branch preview --message "fix: address picker autocomplete"
```

---

## 8. TestFlight Setup (iOS)

1. Create App Store Connect entry for AIST
2. Set Bundle ID: `com.aistdelivery.app` (from app.config.ts)
3. Run `eas build --profile preview --platform ios`
4. Run `eas submit --platform ios`
5. In TestFlight, invite beta testers by email
6. Testers accept invitation → install via TestFlight app

---

*This checklist lives at the project root: `BETA_DEVICE_CHECKLIST.md`*  
*Admin panel version: System Status → Beta Checklist tab*
